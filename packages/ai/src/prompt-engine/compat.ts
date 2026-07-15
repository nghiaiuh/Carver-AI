import type {
  CarverCompiledPromptMeta,
  EnhancedPromptResultV2,
  GenerationPromptResultV2,
  PromptEngineTrustedContext,
  PromptExecutionMode,
} from "@carver/shared";
import type { EnhanceLandscapePromptInput, EnhanceLandscapePromptResult } from "./generate/types";
import { buildPromptPlanV2 } from "./buildPromptPlan";
import { buildCompiledPromptV2, buildGenerationPromptResultV2 } from "./compileProviderPrompt";
import { buildDegradedInterpreterResult } from "./fallback";

const classifyLegacyTaskType = (params: { prompt: string; operationType?: string; executionMode: PromptExecutionMode }) => {
  if (params.operationType) {
    return params.operationType;
  }

  return params.executionMode === "text_to_image" ? "full_redesign" : "unknown";
};

const classifyLegacyEditScope = (executionMode: PromptExecutionMode) => {
  switch (executionMode) {
    case "region_edit":
      return "area_edit";
    case "image_edit":
      return "object_edit";
    case "text_to_image":
    default:
      return "global_style_edit";
  }
};

const classifyLegacyRiskLevel = (riskLevel: EnhancedPromptResultV2["risk"]["level"]): EnhanceLandscapePromptResult["riskLevel"] => {
  switch (riskLevel) {
    case "blocked":
      return "high";
    case "high":
      return "high";
    case "medium":
      return "medium";
    case "low":
    default:
      return "low";
  }
};

export const mapGenerationResultToLegacyMeta = (
  compiled: GenerationPromptResultV2,
): CarverCompiledPromptMeta => ({
  taskType: classifyLegacyTaskType({
    prompt: compiled.plan.rawGoal,
    operationType: compiled.plan.operations[0]?.type,
    executionMode: compiled.plan.executionMode,
  }),
  editScope: classifyLegacyEditScope(compiled.plan.executionMode),
  riskLevel: compiled.plan.risk.level,
  targetArea: compiled.executionTarget?.title ?? null,
  targetObject: compiled.executionTarget?.title ?? null,
  formulaUsed: "prompt_engine_v2",
  shouldShowReview: compiled.plan.decision !== "continue",
  engineVersion: "2",
  engineRunId: compiled.engineRunId,
  parentEngineRunId: compiled.parentEngineRunId,
  planHash: compiled.planHash,
  contextRevision: compiled.contextRevision,
  snapshotId: compiled.snapshotId ?? null,
  decision: compiled.plan.decision,
  warnings: compiled.warnings,
  risk: compiled.plan.risk,
  reviewReasons: compiled.plan.reviewReasons,
  validatedReferences: compiled.validatedReferences,
  executionTarget: compiled.executionTarget,
  revalidation: compiled.revalidation,
  degraded: compiled.plan.degraded,
  providerPrompt: compiled.providerPrompt,
  plan: compiled.plan,
});

export const mapEnhancedPromptResultV2ToLegacy = (
  result: EnhancedPromptResultV2,
  mode: string,
): Record<string, unknown> => ({
  originalPrompt: result.planPreview.rawGoal,
  enhancedPrompt: result.enhancedPrompt,
  ruleScaffold: result.enhancedPrompt,
  mode,
  detectedIntent: classifyLegacyTaskType({
    prompt: result.planPreview.rawGoal,
    operationType: result.planPreview.operations[0]?.type,
    executionMode: result.planPreview.executionMode,
  }),
  score: result.decision === "continue" ? 80 : result.decision === "require_review" ? 55 : 30,
  usedAiFallback: !result.degraded,
  detectedObjects: result.planPreview.operations.flatMap((operation) => {
    switch (operation.type) {
      case "add_object":
        return [operation.objectCategory];
      case "replace_object":
        return [operation.replacementCategory];
      case "replace_material":
        return [operation.material];
      case "modify_attribute":
        return [operation.attribute, operation.value];
      case "restyle":
        return [operation.style];
      default:
        return [];
    }
  }),
  detectedTargetAreas: result.planPreview.target.value?.title ? [result.planPreview.target.value.title] : [],
  detectedStyle:
    result.planPreview.operations.find((operation) => operation.type === "restyle")?.type === "restyle"
      ? (result.planPreview.operations.find((operation) => operation.type === "restyle") as { style: string }).style
      : null,
  preserveRules: result.planPreview.constraints
    .filter((constraint) => constraint.type.startsWith("preserve"))
    .map((constraint) => constraint.description),
  negativeRules: result.planPreview.constraints
    .filter((constraint) => constraint.type === "forbid_addition" || constraint.type === "forbid_removal")
    .map((constraint) => constraint.description),
  fallbackReason: result.interpreter.fallbackReason,
  fallbackError: null,
  attemptedAiFallback: !result.degraded,
  scoringReasons: result.reviewReasons.map((reason) => reason.code),
});

export const compileFinalPromptCompatibility = (
  input: EnhanceLandscapePromptInput & {
    trustedContext?: PromptEngineTrustedContext;
    executionMode?: PromptExecutionMode;
  },
): EnhanceLandscapePromptResult => {
  const trustedContext: PromptEngineTrustedContext = input.trustedContext ?? {
    contextRevision: 0,
    executionMode:
      input.executionMode ??
      (input.imageContext && typeof input.imageContext === "object" ? "image_edit" : "text_to_image"),
    target: null,
    availableTargets: [],
    availableReferences: [],
    selectedObjectIds: [],
    selectedRegionIds: [],
    lockedObjectIds: [],
    locks: [],
    mask: null,
  };
  const warnings: EnhancedPromptResultV2["warnings"] = [];
  const interpretation = buildDegradedInterpreterResult({
    rawPrompt: input.rawPrompt,
    trustedContext,
    fallbackReason: "Legacy compatibility adapter uses degraded interpretation only.",
    warnings,
  });
  const plan = buildPromptPlanV2({
    purpose: "generation",
    rawPrompt: input.rawPrompt,
    trustedContext,
    interpretation,
    degraded: true,
    warnings,
    interpreter: {
      model: null,
      latencyMs: null,
      attemptCount: 0,
      fallbackReason: "legacy_compatibility_adapter",
    },
  });
  const compiled = buildCompiledPromptV2({
    engineRunId: "legacy-compatibility",
    contextRevision: trustedContext.contextRevision,
    snapshotId: trustedContext.snapshotId,
    plan,
    warnings,
    interpreter: {
      model: null,
      latencyMs: null,
      attemptCount: 0,
      fallbackReason: "legacy_compatibility_adapter",
    },
  });
  const generationResult = buildGenerationPromptResultV2({
    compiled,
    requiredAssetIds: [],
  });

  return {
    rawPrompt: input.rawPrompt,
    enhancedPrompt: generationResult.providerPrompt,
    taskType: classifyLegacyTaskType({
      prompt: generationResult.plan.rawGoal,
      operationType: generationResult.plan.operations[0]?.type,
      executionMode: generationResult.plan.executionMode,
    }) as EnhanceLandscapePromptResult["taskType"],
    editScope: classifyLegacyEditScope(generationResult.plan.executionMode) as EnhanceLandscapePromptResult["editScope"],
    riskLevel: classifyLegacyRiskLevel(generationResult.plan.risk.level),
    targetArea: generationResult.executionTarget?.title,
    targetObject: generationResult.executionTarget?.title,
    preserveRules: generationResult.plan.constraints
      .filter((constraint) => constraint.type.startsWith("preserve"))
      .map((constraint) => constraint.description),
    negativeConstraints: generationResult.plan.constraints
      .filter((constraint) => constraint.type === "forbid_addition" || constraint.type === "forbid_removal")
      .map((constraint) => constraint.description),
    formulaUsed: "prompt_engine_v2",
    editBrief: {
      title: "Prompt Engine V2",
      summary: generationResult.providerPrompt,
      detectedIntent: generationResult.plan.operations[0]?.type ?? "unknown",
      targetArea: generationResult.executionTarget?.title,
      targetObject: generationResult.executionTarget?.title,
      preserve: generationResult.plan.constraints
        .filter((constraint) => constraint.type.startsWith("preserve"))
        .map((constraint) => constraint.description),
      modify: generationResult.plan.operations.map((operation) => operation.type),
      avoid: generationResult.plan.constraints
        .filter((constraint) => constraint.type === "forbid_addition" || constraint.type === "forbid_removal")
        .map((constraint) => constraint.description),
      quality: generationResult.plan.reviewReasons.map((reason) => reason.code),
    },
    shouldShowReview: input.promptMode === "expert" ? true : generationResult.plan.decision !== "continue",
  };
};
