import { randomUUID } from "node:crypto";
import type {
  EnhancedPromptResultV2,
  GenerationPromptResultV2,
  PromptEngineTrustedContext,
  PromptInterpreterMeta,
  PromptInterpreterResult,
  PromptWarning,
} from "@carver/shared";
import { buildPromptPlanV2 } from "./buildPromptPlan";
import { buildCompiledPromptV2, buildGenerationPromptResultV2 } from "./compileProviderPrompt";
import { buildDegradedInterpreterResult } from "./fallback";
import { PROMPT_INTERPRETATION_JSON_SCHEMA, validatePromptInterpreterResult } from "./schemas";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const DEFAULT_PROMPT_ENGINE_MODEL = process.env.CARVER_PROMPT_ENGINE_MODEL ?? "gpt-5-mini";

type InterpreterTransportPayload = {
  output_text?: string;
  output?: Array<{
    content?: Array<{
      type?: string;
      text?: string;
    }>;
  }>;
  error?: {
    message?: string;
    code?: string;
  };
  status?: string;
  incomplete_details?: {
    reason?: string;
  };
};

class PromptInterpreterError extends Error {
  retryable: boolean;
  code: string;

  constructor(message: string, options?: { retryable?: boolean; code?: string }) {
    super(message);
    this.name = "PromptInterpreterError";
    this.retryable = options?.retryable ?? false;
    this.code = options?.code ?? "INTERPRETER_FAILED";
  }
}

const getResponseOutputText = (payload: InterpreterTransportPayload) => {
  if (typeof payload.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  const text = payload.output
    ?.flatMap((item) => item.content ?? [])
    .map((content) => (content.type === "output_text" || content.type === "text" ? content.text ?? "" : ""))
    .join("")
    .trim();

  return text || null;
};

const buildInterpreterPrompt = (params: {
  rawPrompt: string;
  trustedContext: PromptEngineTrustedContext;
  purpose: "enhance" | "generation";
  repairHint?: string | null;
}) => {
  const target = params.trustedContext.target
    ? `${params.trustedContext.target.contextId}: ${params.trustedContext.target.title}`
    : "none";
  const references = params.trustedContext.availableReferences.map((reference) => ({
    contextId: reference.contextId,
    title: reference.title,
    allowedRoles: reference.allowedRoles,
    graphRole: reference.graphRole ?? null,
  }));

  return [
    "You are Carver AI Prompt Interpreter.",
    "Interpret language only. Do not decide ownership, spatial locks, or allowed references.",
    "Return only structured data that uses the trusted context ids below.",
    `Purpose: ${params.purpose}`,
    `Execution mode: ${params.trustedContext.executionMode}`,
    `Target: ${target}`,
    `References: ${JSON.stringify(references)}`,
    `Selected objects: ${JSON.stringify(params.trustedContext.selectedObjectIds)}`,
    `Selected regions: ${JSON.stringify(params.trustedContext.selectedRegionIds)}`,
    `Locked objects: ${JSON.stringify(params.trustedContext.lockedObjectIds)}`,
    `Mask: ${JSON.stringify(params.trustedContext.mask)}`,
    `Explicit constraints: ${JSON.stringify(params.trustedContext.explicitConstraints ?? {})}`,
    `Raw prompt: ${params.rawPrompt}`,
    params.repairHint ? `Repair hint: ${params.repairHint}` : "",
  ]
    .filter(Boolean)
    .join("\n");
};

const callPromptInterpreter = async (params: {
  rawPrompt: string;
  trustedContext: PromptEngineTrustedContext;
  purpose: "enhance" | "generation";
  model?: string;
  repairHint?: string | null;
}): Promise<PromptInterpreterResult> => {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new PromptInterpreterError("OPENAI_API_KEY is missing.", {
      retryable: false,
      code: "MISSING_API_KEY",
    });
  }

  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: params.model ?? DEFAULT_PROMPT_ENGINE_MODEL,
      input: [
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: buildInterpreterPrompt(params),
            },
          ],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          ...PROMPT_INTERPRETATION_JSON_SCHEMA,
        },
      },
    }),
  });

  const payload = (await response.json().catch(() => ({}))) as InterpreterTransportPayload;
  if (!response.ok) {
    throw new PromptInterpreterError(payload.error?.message || "Prompt interpreter request failed.", {
      retryable: response.status >= 500 || response.status === 429,
      code: payload.error?.code ?? "INTERPRETER_HTTP_ERROR",
    });
  }

  const outputText = getResponseOutputText(payload);
  if (!outputText) {
    throw new PromptInterpreterError("Prompt interpreter returned an empty response.", {
      retryable: true,
      code: "EMPTY_INTERPRETER_RESPONSE",
    });
  }

  const parsed = JSON.parse(outputText) as unknown;
  const interpretation = validatePromptInterpreterResult(parsed);
  if (!interpretation) {
    throw new PromptInterpreterError("Prompt interpreter returned malformed structured output.", {
      retryable: true,
      code: "INVALID_INTERPRETER_SCHEMA",
    });
  }

  return interpretation;
};

const interpretWithRetry = async (params: {
  rawPrompt: string;
  trustedContext: PromptEngineTrustedContext;
  purpose: "enhance" | "generation";
  model?: string;
}): Promise<{
  interpretation: PromptInterpreterResult | null;
  interpreter: PromptInterpreterMeta;
  fallbackReason: string | null;
}> => {
  const startedAt = Date.now();
  let attemptCount = 0;
  let repairHint: string | null = null;

  while (attemptCount < 2) {
    attemptCount += 1;

    try {
      const interpretation = await callPromptInterpreter({
        rawPrompt: params.rawPrompt,
        trustedContext: params.trustedContext,
        purpose: params.purpose,
        model: params.model,
        repairHint,
      });

      return {
        interpretation,
        interpreter: {
          model: params.model ?? DEFAULT_PROMPT_ENGINE_MODEL,
          latencyMs: Date.now() - startedAt,
          attemptCount,
          fallbackReason: null,
        },
        fallbackReason: null,
      };
    } catch (error) {
      const interpreterError =
        error instanceof PromptInterpreterError
          ? error
          : new PromptInterpreterError(
              error instanceof Error ? error.message : "Prompt interpreter failed.",
              {
                retryable: false,
              },
            );

      if (!interpreterError.retryable || attemptCount >= 2) {
        return {
          interpretation: null,
          interpreter: {
            model: params.model ?? DEFAULT_PROMPT_ENGINE_MODEL,
            latencyMs: Date.now() - startedAt,
            attemptCount,
            fallbackReason: interpreterError.message,
          },
          fallbackReason: interpreterError.message,
        };
      }

      repairHint = `Previous attempt failed validation: ${interpreterError.message}. Return valid schema only.`;
    }
  }

  return {
    interpretation: null,
    interpreter: {
      model: params.model ?? DEFAULT_PROMPT_ENGINE_MODEL,
      latencyMs: Date.now() - startedAt,
      attemptCount,
      fallbackReason: "Interpreter exhausted retries.",
    },
    fallbackReason: "Interpreter exhausted retries.",
  };
};

const buildPlanFromRuntime = async (params: {
  purpose: "enhance" | "generation";
  rawPrompt: string;
  trustedContext: PromptEngineTrustedContext;
  parentEngineRunId?: string | null;
  useModel?: boolean;
  forceModel?: boolean;
}): Promise<{
  engineRunId: string;
  warnings: PromptWarning[];
  degraded: boolean;
  compiled: ReturnType<typeof buildCompiledPromptV2>;
}> => {
  const engineRunId = randomUUID();
  const warnings: PromptWarning[] = [];
  const shouldUseModel = params.forceModel || params.useModel !== false;
  const interpreterOutcome = shouldUseModel
    ? await interpretWithRetry({
        rawPrompt: params.rawPrompt,
        trustedContext: params.trustedContext,
        purpose: params.purpose,
      })
    : {
        interpretation: null,
        fallbackReason: "Structured interpreter disabled for this request.",
        interpreter: {
          model: null,
          latencyMs: null,
          attemptCount: 0,
          fallbackReason: "Structured interpreter disabled for this request.",
        } satisfies PromptInterpreterMeta,
      };

  const degraded = !interpreterOutcome.interpretation;
  const interpretation =
    interpreterOutcome.interpretation ??
    buildDegradedInterpreterResult({
      rawPrompt: params.rawPrompt,
      trustedContext: params.trustedContext,
      fallbackReason: interpreterOutcome.fallbackReason ?? "Interpreter fallback was required.",
      warnings,
    });

  const plan = buildPromptPlanV2({
    purpose: params.purpose,
    rawPrompt: params.rawPrompt,
    trustedContext: params.trustedContext,
    interpretation,
    degraded,
    warnings,
    interpreter: interpreterOutcome.interpreter,
  });

  const compiled = buildCompiledPromptV2({
    engineRunId,
    parentEngineRunId: params.parentEngineRunId ?? undefined,
    contextRevision: params.trustedContext.contextRevision,
    snapshotId: params.trustedContext.snapshotId,
    plan,
    warnings,
    interpreter: interpreterOutcome.interpreter,
  });

  return {
    engineRunId,
    warnings,
    degraded,
    compiled,
  };
};

export async function enhancePromptV2(params: {
  rawPrompt: string;
  trustedContext: PromptEngineTrustedContext;
  parentEngineRunId?: string | null;
  useModel?: boolean;
  forceModel?: boolean;
}): Promise<EnhancedPromptResultV2> {
  const runtime = await buildPlanFromRuntime({
    purpose: "enhance",
    rawPrompt: params.rawPrompt,
    trustedContext: params.trustedContext,
    parentEngineRunId: params.parentEngineRunId,
    useModel: params.useModel,
    forceModel: params.forceModel,
  });

  return {
    engineRunId: runtime.engineRunId,
    parentEngineRunId: params.parentEngineRunId ?? undefined,
    planHash: runtime.compiled.planHash,
    contextRevision: runtime.compiled.contextRevision,
    enhancedPrompt: runtime.compiled.providerPrompt,
    planPreview: runtime.compiled.plan,
    warnings: runtime.compiled.warnings,
    decision: runtime.compiled.plan.decision,
    risk: runtime.compiled.plan.risk,
    reviewReasons: runtime.compiled.plan.reviewReasons,
    degraded: runtime.degraded,
    interpreter: runtime.compiled.interpreter,
  };
}

export async function compileGenerationPromptV2(params: {
  rawPrompt: string;
  trustedContext: PromptEngineTrustedContext;
  requiredAssetIds?: string[];
  parentEngineRunId?: string | null;
  useModel?: boolean;
  forceModel?: boolean;
}): Promise<GenerationPromptResultV2> {
  const runtime = await buildPlanFromRuntime({
    purpose: "generation",
    rawPrompt: params.rawPrompt,
    trustedContext: params.trustedContext,
    parentEngineRunId: params.parentEngineRunId,
    useModel: params.useModel,
    forceModel: params.forceModel,
  });

  return buildGenerationPromptResultV2({
    compiled: runtime.compiled,
    requiredAssetIds: params.requiredAssetIds ?? [],
  });
}
