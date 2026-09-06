import { NextResponse } from "next/server";
import { createHash, randomUUID } from "node:crypto";
import {
  createAiJobBodySchema,
  createSafeLogger,
  coerceCanvasSnapshotDocument,
  formatZodError,
  NOVEL_VIEW_PROMPT_COMPILER_VERSION,
  OPENAI_IMAGE_MODEL,
} from "@carver/shared";
import type {
  CarverAiJobRecord,
  CarverAiJobResult,
  CarverAiJobSimulationConfig,
  CarverAiJobSimulationScenario,
  CarverImageExecutionMode,
  CanvasSnapshotDocument,
  CreateAiJobBody,
  CreateAiJobRequest,
} from "@carver/shared";
import type { RequestContext } from "../../app/api/_lib/authz";
import { isUuidLike, requireProjectOwner } from "../../app/api/_lib/authz";
import { AI_CREDIT_COSTS } from "../../app/api/_lib/credits";
import { getSupabaseAdmin } from "@carver/db/server";
import { apiFailure, badRequest } from "../../app/api/_lib/http";
import { enforceRateLimit } from "../../app/api/_lib/rateLimit";
import {
  extractAssetIdFromGatewayUrl,
  resolveAiJobResultAssetUrls,
} from "./assetService";
import {
  validateCanvasSnapshotDocument,
  validateSnapshotAssetOwnership,
} from "./canvasSnapshotValidation";
import {
  deletePersistedProjectImageAssets,
  persistTemporaryProjectImageAsset,
} from "./projectInputAssets";
import {
  buildCanonicalMultiAngleRequestHash,
  rebuildCanonicalMultiAngleRequest,
} from "./multiAngleRequestService";

const JOB_TYPES: CreateAiJobRequest["jobType"][] = [
  "generate_concept",
  "refine_concept",
  "analyze_reference",
  "export",
];
const SUPPORTED_JOB_TYPES: CreateAiJobRequest["jobType"][] = [
  "generate_concept",
  "refine_concept",
];

const PROMPT_MODES = ["auto", "review", "expert"] as const;
const EXECUTION_MODES = ["text_to_image", "image_edit", "region_edit"] as const;
const SIMULATION_SCENARIOS = [
  "success",
  "slow_success",
  "transient_provider_fail_then_success",
  "timeout_then_success",
  "fail_after_asset_persisted_once",
  "permanent_fail",
] as const;
const INLINE_IMAGE_LIMIT_BYTES = 8 * 1024 * 1024;
const logger = createSafeLogger("web.ai-jobs");
// Production defaults to real providers. Staging must opt in explicitly so its
// deterministic E2E flow cannot accidentally enable simulation in production.
const AI_JOB_SIMULATION_ENABLED =
  process.env.CARVER_ENABLE_AI_JOB_SIMULATION === "true" || process.env.NODE_ENV !== "production";

const isSafeInlineImageValidationMessage = (value: string) =>
  /^Inline image (must|type|is|content|dimensions)/.test(value);

function getAiJobDatabaseFailure(params: {
  error: { code?: string | null; message?: string | null };
  requestId: string;
  message: string;
  fallbackCode: "AI_JOB_LOOKUP_FAILED" | "AI_JOB_CREATE_FAILED";
}) {
  const databaseMessage = params.error.message?.toLowerCase() ?? "";
  const stableRpcFailures = [
    {
      marker: "input_asset_not_found",
      code: "AI_JOB_INPUT_ASSET_NOT_FOUND",
      message: "A connected image is no longer available in this project. Refresh the canvas and reconnect it.",
      status: 400,
    },
    {
      marker: "snapshot_not_found",
      code: "SNAPSHOT_NOT_FOUND",
      message: "The canvas checkpoint for this generation no longer exists.",
      status: 404,
    },
    {
      marker: "project_not_found",
      code: "PROJECT_NOT_FOUND",
      message: "Project not found.",
      status: 404,
    },
    {
      marker: "chat_thread_not_found",
      code: "CHAT_THREAD_NOT_FOUND",
      message: "The selected chat thread no longer exists.",
      status: 404,
    },
    {
      marker: "credit_idempotency_inconsistent",
      code: "CREDIT_IDEMPOTENCY_CONFLICT",
      message: "This generation request conflicts with an earlier credit reservation.",
      status: 409,
    },
  ] as const;
  const stableRpcFailure = stableRpcFailures.find((failure) =>
    databaseMessage.includes(failure.marker),
  );
  if (stableRpcFailure) {
    return apiFailure(
      stableRpcFailure.code,
      stableRpcFailure.message,
      stableRpcFailure.status,
      params.requestId,
    );
  }

  const isSchemaFailure =
    databaseMessage.includes("does not exist") ||
    databaseMessage.includes("schema cache") ||
    databaseMessage.includes("could not find the function") ||
    params.error.code === "PGRST202" ||
    params.error.code === "PGRST204" ||
    params.error.code === "42703";

  return isSchemaFailure
    ? apiFailure(
        "AI_JOB_SCHEMA_ERROR",
        "AI job database schema is out of date. Apply the latest database migrations.",
        500,
        params.requestId,
      )
    : apiFailure(params.fallbackCode, params.message, 500, params.requestId);
}

type CreateAiJobWithCheckpointRpcRow = {
  id: string;
  project_id: string;
  thread_id: string | null;
  status: CarverAiJobRecord["status"];
  job_type: CarverAiJobRecord["jobType"];
  prompt: string | null;
  input_snapshot_id: string | null;
  output_snapshot_id: string | null;
  output_asset_ids: string[] | null;
  provider: string | null;
  error_code: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  job_result?: unknown;
  created: boolean;
  credit_applied: boolean;
  credits_remaining: number | null;
};

type AiJobCheckpointRpcClient = {
  rpc: (
    fn: "create_ai_job_with_checkpoint",
    args: Record<string, unknown>,
  ) => Promise<{
    data: CreateAiJobWithCheckpointRpcRow[] | null;
    error: { code?: string | null; message: string } | null;
  }>;
};

const objectValue = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

const snapshotValue = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? coerceCanvasSnapshotDocument(value)
    : undefined;

const normalizeJobType = (value: unknown): CreateAiJobRequest["jobType"] =>
  typeof value === "string" && JOB_TYPES.includes(value as CreateAiJobRequest["jobType"])
    ? (value as CreateAiJobRequest["jobType"])
    : "generate_concept";

const normalizePromptMode = (value: unknown): NonNullable<CreateAiJobRequest["promptMode"]> =>
  typeof value === "string" && PROMPT_MODES.includes(value as (typeof PROMPT_MODES)[number])
    ? (value as NonNullable<CreateAiJobRequest["promptMode"]>)
    : "auto";

const normalizeExecutionMode = (value: unknown): CarverImageExecutionMode | undefined =>
  typeof value === "string" && EXECUTION_MODES.includes(value as (typeof EXECUTION_MODES)[number])
    ? (value as CarverImageExecutionMode)
    : undefined;

const buildIdempotencyKey = (params: {
  userId: string;
  projectId: string;
  jobType: string;
  prompt: string;
  snapshotIdentity: string | null;
  targetNodeId: string | undefined;
  executionMode: CarverImageExecutionMode;
  targetType?: "canvas-node" | "image-generator";
  model?: string | null;
  aspectRatio?: string | null;
  outputCount?: number | null;
  simulationScenario?: string | null;
  cameraShotSetContext?: unknown;
  cameraPromptCompilerVersion?: string | null;
}) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        userId: params.userId,
        projectId: params.projectId,
        jobType: params.jobType,
        prompt: params.prompt,
        snapshotIdentity: params.snapshotIdentity,
        targetNodeId: params.targetNodeId ?? null,
        executionMode: params.executionMode,
        targetType: params.targetType ?? "canvas-node",
        model: params.model ?? null,
        aspectRatio: params.aspectRatio ?? null,
        outputCount: params.outputCount ?? 1,
        simulationScenario: params.simulationScenario ?? null,
        cameraShotSetContext: params.cameraShotSetContext ?? null,
        cameraPromptCompilerVersion: params.cameraPromptCompilerVersion ?? null,
      }),
    )
    .digest("hex")
    .slice(0, 48);

const createRetryIdempotencyKey = (baseKey: string) => `${baseKey}-retry-${randomUUID()}`;

const isRetryableTerminalJobStatus = (status: string) =>
  status === "failed" || status === "cancelled" || status === "enqueue_failed";

function imageSourceValue(
  value: unknown,
  imageKey: "imageUrl" | "imageSrc",
): (Record<string, unknown> & {
  assetId?: string;
  imageUrl?: string;
  imageSrc?: string;
  title?: string;
  label?: string;
}) | null {
  const source = objectValue(value);
  if (!source) {
    return null;
  }

  const imageUrl = typeof source[imageKey] === "string" ? source[imageKey].trim() : "";

  return {
    ...source,
    assetId:
      extractAssetIdFromGatewayUrl(imageUrl) ??
      (typeof source.assetId === "string" && source.assetId.trim() ? source.assetId.trim() : undefined),
    title: typeof source.title === "string" ? source.title.trim() : undefined,
    label: typeof source.label === "string" ? source.label.trim() : undefined,
    [imageKey]: imageUrl,
  };
}

function maskValue(value: unknown) {
  const source = objectValue(value);
  if (!source) {
    return null;
  }

  return {
    assetId: typeof source.assetId === "string" && source.assetId.trim() ? source.assetId.trim() : undefined,
    dataUrl: typeof source.dataUrl === "string" ? source.dataUrl.trim() : "",
    width: typeof source.width === "number" ? source.width : undefined,
    height: typeof source.height === "number" ? source.height : undefined,
    selectionRatio: typeof source.selectionRatio === "number" ? source.selectionRatio : undefined,
  };
}

function isInlineImageUrl(imageUrl: string) {
  return imageUrl.startsWith("data:image/");
}

function isRemoteImageUrl(imageUrl: string) {
  return /^https?:\/\//i.test(imageUrl);
}

const normalizeSelection = (
  value: unknown,
): NonNullable<CreateAiJobRequest["selection"]> => {
  const source = objectValue(value);

  return {
    objectIds: Array.isArray(source?.objectIds)
      ? source.objectIds.filter((item): item is string => typeof item === "string")
      : undefined,
    regionIds: Array.isArray(source?.regionIds)
      ? source.regionIds.filter((item): item is string => typeof item === "string")
      : undefined,
    activeAssetIds: Array.isArray(source?.activeAssetIds)
      ? source.activeAssetIds.filter((item): item is string => typeof item === "string")
      : undefined,
  };
};

const normalizeSimulation = (value: unknown): CarverAiJobSimulationConfig | undefined => {
  const source = objectValue(value);
  if (!source) {
    return undefined;
  }

  const scenario = typeof source.scenario === "string" &&
    SIMULATION_SCENARIOS.includes(source.scenario as CarverAiJobSimulationScenario)
    ? (source.scenario as CarverAiJobSimulationScenario)
    : undefined;

  if (!scenario) {
    return undefined;
  }

  return {
    scenario,
    delayMs: typeof source.delayMs === "number" && Number.isFinite(source.delayMs) ? source.delayMs : undefined,
    failUntilAttempt:
      typeof source.failUntilAttempt === "number" && Number.isFinite(source.failUntilAttempt)
        ? source.failUntilAttempt
        : undefined,
  };
};

export type CreateProjectAiJobSuccess = {
  created: boolean;
  idempotent: boolean;
  creditsRemaining?: number;
  job: CarverAiJobRecord;
};

export type CreateProjectAiJobResult =
  | { ok: true; data: CreateProjectAiJobSuccess }
  | { ok: false; response: NextResponse };

export async function createProjectAiJob(params: {
  request: Request;
  context: RequestContext;
  projectId: string;
  body: Record<string, unknown> | CreateAiJobBody;
}): Promise<CreateProjectAiJobResult> {
  const { request, context, projectId } = params;
  const parsedBody = createAiJobBodySchema.safeParse(params.body);
  if (!parsedBody.success) {
    return { ok: false, response: badRequest(formatZodError(parsedBody.error)) };
  }

  const body = parsedBody.data;

  if (!projectId) {
    return { ok: false, response: badRequest("projectId is required") };
  }

  if (!isUuidLike(projectId)) {
    return { ok: false, response: badRequest("projectId is invalid") };
  }

  const inputSnapshotId = body.inputSnapshotId;
  const threadId = body.threadId;
  const referenceAssetIds = body.referenceAssetIds ?? [];
  const selection = normalizeSelection(body.selection);
  const promptMode = normalizePromptMode(body.promptMode);
  const jobType = normalizeJobType(body.jobType);
  const requestedExecutionMode = normalizeExecutionMode(body.executionMode);
  const targetType = body.targetType ?? "canvas-node";
  const targetNodeId = body.targetNodeId;
  const requestedModel = body.model?.trim() || "auto";
  const aspectRatio = body.aspectRatio ?? "1:1";
  const outputCount = body.outputCount ?? 1;
  const canvasGraphContext = objectValue(body.canvasGraphContext);
  const imageGeneratorContext = objectValue(body.imageGeneratorContext);
  const cameraShotSetContext = body.cameraShotSetContext;
  const maskInput = maskValue(body.mask);
  const clientSnapshot = snapshotValue(body.snapshot ?? body.canvasSnapshot);
  const simulation = normalizeSimulation(body.simulation);
  const prompt = body.prompt ?? body.rawPrompt ?? "";
  const hasConnectedTextDirection =
    targetType === "image-generator" &&
    Array.isArray(imageGeneratorContext?.textReferences) &&
    imageGeneratorContext.textReferences.length > 0;

  if (!prompt && !hasConnectedTextDirection) {
    return { ok: false, response: badRequest("prompt is required") };
  }

  if (!SUPPORTED_JOB_TYPES.includes(jobType)) {
    return { ok: false, response: badRequest(`jobType ${jobType} is not supported yet`) };
  }

  if (simulation && !AI_JOB_SIMULATION_ENABLED) {
    return { ok: false, response: badRequest("AI job simulation mode is disabled.") };
  }

  if (targetType === "image-generator" && !targetNodeId) {
    return { ok: false, response: badRequest("Image generator jobs require a targetNodeId.") };
  }

  if (cameraShotSetContext) {
    if (targetType !== "image-generator" || !canvasGraphContext) {
      return { ok: false, response: badRequest("Multi-angle generation requires an Image Generator target and source image.") };
    }
    if (outputCount !== 1) {
      return { ok: false, response: badRequest("Multi-angle generation creates one image per visible camera. Set outputCount to 1.") };
    }
  }

  if (requestedModel !== "auto" && requestedModel !== OPENAI_IMAGE_MODEL) {
    return { ok: false, response: badRequest("Unsupported image generation model.") };
  }

  const projectResult = await requireProjectOwner(context, projectId);
  if ("error" in projectResult) {
    return { ok: false, response: projectResult.error };
  }

  const { supabase, user } = context;
  const { project } = projectResult;
  // Ownership was checked above. Internal idempotency and concurrency queries
  // use the server client so RLS policy changes cannot break queue submission.
  const adminSupabase = getSupabaseAdmin();

  const rateLimit = await enforceRateLimit(context, {
    scope: "ai-job",
    limit: 10,
    windowMs: 60_000,
  });
  if (!rateLimit.ok) {
    return { ok: false, response: rateLimit.response };
  }

  const resolvedSnapshotId = inputSnapshotId ?? project.current_canvas_snapshot_id;
  const snapshotRow = resolvedSnapshotId
    ? await supabase
        .from("canvas_snapshots")
        .select("id, project_id, version, canvas_json")
        .eq("id", resolvedSnapshotId)
        .eq("project_id", projectId)
        .single()
    : null;
  const loadedSnapshot = snapshotRow?.data ?? null;

  if (resolvedSnapshotId && (snapshotRow?.error || !loadedSnapshot)) {
    return {
      ok: false,
      response: apiFailure("SNAPSHOT_NOT_FOUND", "Snapshot not found.", 404, context.requestId),
    };
  }

  if (!clientSnapshot && !loadedSnapshot) {
    return { ok: false, response: badRequest("A canvas snapshot is required to create an AI job") };
  }

  const snapshot = clientSnapshot ?? coerceCanvasSnapshotDocument(loadedSnapshot!.canvas_json);
  const mergedSnapshot = {
    ...snapshot,
    selection: {
      objectIds: selection.objectIds ?? snapshot.selection.objectIds,
      regionIds: selection.regionIds ?? snapshot.selection.regionIds,
      activeAssetIds: selection.activeAssetIds ?? snapshot.selection.activeAssetIds,
    },
  };
  const mergedSnapshotHash = createHash("sha256")
    .update(JSON.stringify(mergedSnapshot))
    .digest("hex");

  const snapshotValidationError = validateCanvasSnapshotDocument(mergedSnapshot);
  if (snapshotValidationError) {
    return { ok: false, response: badRequest(snapshotValidationError) };
  }

  const snapshotOwnershipError = await validateSnapshotAssetOwnership({
    supabase,
    projectId,
    userId: user.id,
    document: mergedSnapshot,
  });
  if (snapshotOwnershipError) {
    return { ok: false, response: badRequest(snapshotOwnershipError) };
  }

  const canonicalMultiAngleResult = cameraShotSetContext
    ? rebuildCanonicalMultiAngleRequest({
        snapshot: mergedSnapshot,
        requestedContext: cameraShotSetContext,
      })
    : null;
  if (canonicalMultiAngleResult && !canonicalMultiAngleResult.ok) {
    return { ok: false, response: badRequest(canonicalMultiAngleResult.error) };
  }
  const canonicalMultiAngleRequest = canonicalMultiAngleResult?.ok
    ? canonicalMultiAngleResult.value
    : null;

  const normalizedTarget = canonicalMultiAngleRequest?.source ?? (canvasGraphContext
    ? imageSourceValue(canvasGraphContext.target, "imageUrl")
    : null);
  const normalizedImageReferences = Array.isArray(canvasGraphContext?.imageReferences)
    ? canvasGraphContext.imageReferences
        .map((reference) => imageSourceValue(reference, "imageUrl"))
        .filter((reference): reference is NonNullable<ReturnType<typeof imageSourceValue>> => reference !== null)
    : [];
  const normalizedPresetReferences = Array.isArray(canvasGraphContext?.presetReferences)
    ? canvasGraphContext.presetReferences
        .map((reference) => imageSourceValue(reference, "imageSrc"))
        .filter((reference): reference is NonNullable<ReturnType<typeof imageSourceValue>> => reference !== null)
    : [];

  const executionMode =
    requestedExecutionMode ??
    (maskInput?.assetId || maskInput?.dataUrl
      ? "region_edit"
      : normalizedTarget
        ? "image_edit"
        : "text_to_image");

  if (cameraShotSetContext && executionMode !== "image_edit") {
    return { ok: false, response: badRequest("Multi-angle generation requires image_edit execution mode.") };
  }

  if (executionMode !== "text_to_image" && !normalizedTarget) {
    return { ok: false, response: badRequest("Image edit jobs require a target image.") };
  }

  if (executionMode === "region_edit" && !maskInput) {
    return { ok: false, response: badRequest("Region edit jobs require a mask.") };
  }

  const inputAssetIds = new Set<string>(referenceAssetIds);
  const persistedInputAssets: Array<{ assetId: string; storagePath: string }> = [];

  const persistInlineImage = async (persistParams: {
    label: string;
    imageUrl: string;
    kind?: "upload" | "reference";
    metadata?: Record<string, unknown>;
  }) => {
    if (!isInlineImageUrl(persistParams.imageUrl)) {
      if (persistParams.imageUrl && isRemoteImageUrl(persistParams.imageUrl)) {
        throw new Error("Remote image URLs are not allowed for AI job inputs.");
      }

      if (persistParams.imageUrl) {
        throw new Error("Unsupported AI job image source.");
      }

      return undefined;
    }

    if (persistParams.imageUrl.length > INLINE_IMAGE_LIMIT_BYTES * 2) {
      throw new Error("Inline image is too large.");
    }

    const persisted = await persistTemporaryProjectImageAsset({
      supabase,
      projectId,
      ownerId: user.id,
      requestId: context.requestId,
      label: persistParams.label,
      dataUrl: persistParams.imageUrl,
      kind: persistParams.kind ?? "reference",
      metadata: persistParams.metadata,
    });

    persistedInputAssets.push({ assetId: persisted.assetId, storagePath: persisted.storagePath });
    inputAssetIds.add(persisted.assetId);
    return persisted.assetId;
  };

  let sanitizedTarget: typeof normalizedTarget = null;
  let sanitizedImageReferences: typeof normalizedImageReferences = [];
  let sanitizedPresetReferences: typeof normalizedPresetReferences = [];
  let resolvedMaskAssetId: string | undefined;

  try {
    sanitizedTarget = normalizedTarget
      ? {
          ...normalizedTarget,
          assetId:
            normalizedTarget.assetId ??
            (await persistInlineImage({
              label: normalizedTarget.title ?? "target-image",
              imageUrl: normalizedTarget.imageUrl ?? "",
              kind: "upload",
              metadata: {
                sourceType: "ai-job-target",
                targetNodeId,
              },
            })),
          imageUrl: "",
        }
      : null;

    if (sanitizedTarget?.assetId) {
      inputAssetIds.add(sanitizedTarget.assetId);
    }

    sanitizedImageReferences = await Promise.all(
      normalizedImageReferences.map(async (reference, index) => {
        const assetId =
          reference.assetId ??
          (await persistInlineImage({
            label: reference.title ?? `reference-image-${index + 1}`,
            imageUrl: reference.imageUrl ?? "",
            kind: "reference",
            metadata: {
              sourceType: "ai-job-reference",
              referenceIndex: index,
            },
          }));

        if (reference.assetId) {
          inputAssetIds.add(reference.assetId);
        }

        return {
          ...reference,
          assetId,
          imageUrl: assetId ? "" : reference.imageUrl,
        };
      }),
    );

    sanitizedPresetReferences = await Promise.all(
      normalizedPresetReferences.map(async (reference, index) => {
        const assetId =
          reference.assetId ??
          (await persistInlineImage({
            label: reference.label ?? `preset-reference-${index + 1}`,
            imageUrl: reference.imageSrc ?? "",
            kind: "reference",
            metadata: {
              sourceType: "ai-job-preset-reference",
              referenceIndex: index,
            },
          }));

        if (reference.assetId) {
          inputAssetIds.add(reference.assetId);
        }

        return {
          ...reference,
          assetId,
          imageSrc: assetId ? "" : reference.imageSrc,
        };
      }),
    );

    resolvedMaskAssetId =
      maskInput?.assetId ??
      (maskInput?.dataUrl
        ? await persistInlineImage({
            label: "region-mask",
            imageUrl: maskInput.dataUrl,
            kind: "reference",
            metadata: {
              sourceType: "ai-job-mask",
              width: maskInput.width,
              height: maskInput.height,
              selectionRatio: maskInput.selectionRatio,
            },
          })
        : undefined);
  } catch (error) {
    await deletePersistedProjectImageAssets({
      supabase,
      projectId,
      ownerId: user.id,
      assets: persistedInputAssets,
    }).catch(() => undefined);

    const message = error instanceof Error ? error.message : "";
    logger.warn("AI job input preparation failed", {
      requestId: context.requestId,
      userId: user.id,
      projectId,
      error,
    });

    if (isSafeInlineImageValidationMessage(message)) {
      return { ok: false, response: badRequest(message) };
    }

    return {
      ok: false,
      response: apiFailure(
        "AI_JOB_INPUT_PREPARATION_FAILED",
        "Unable to prepare AI job image inputs right now.",
        500,
        context.requestId,
      ),
    };
  }

  if (executionMode !== "text_to_image" && !sanitizedTarget?.assetId) {
    return { ok: false, response: badRequest("Image edit jobs require a persisted target asset.") };
  }

  if (executionMode === "region_edit" && !resolvedMaskAssetId) {
    return { ok: false, response: badRequest("Region edit jobs require a persisted mask asset.") };
  }

  const resolvedReferenceAssetIds = Array.from(
    new Set([
      ...referenceAssetIds,
      ...sanitizedImageReferences
        .map((reference) => reference.assetId)
        .filter((assetId): assetId is string => typeof assetId === "string" && assetId.length > 0),
      ...sanitizedPresetReferences
        .map((reference) => reference.assetId)
        .filter((assetId): assetId is string => typeof assetId === "string" && assetId.length > 0),
    ]),
  );

  const clientIdempotencyKey = body.idempotencyKey;
  let idempotencyKey =
    clientIdempotencyKey ??
    buildIdempotencyKey({
      userId: user.id,
      projectId,
      jobType,
      prompt,
      snapshotIdentity: canonicalMultiAngleRequest
        ? buildCanonicalMultiAngleRequestHash({
            snapshot: mergedSnapshot,
            request: canonicalMultiAngleRequest,
          })
        : loadedSnapshot?.id ?? resolvedSnapshotId ?? mergedSnapshotHash,
      targetNodeId,
      executionMode,
      targetType,
      model: requestedModel,
      aspectRatio,
      outputCount,
      simulationScenario: simulation?.scenario ?? null,
      cameraShotSetContext: canonicalMultiAngleRequest?.cameraShotSetContext,
      cameraPromptCompilerVersion: cameraShotSetContext
        ? NOVEL_VIEW_PROMPT_COMPILER_VERSION
        : null,
    });

  const sanitizedCanvasGraphContext = canvasGraphContext
    ? {
        ...canvasGraphContext,
        ...(sanitizedTarget ? { target: sanitizedTarget } : {}),
        imageReferences: sanitizedImageReferences,
        presetReferences: sanitizedPresetReferences,
      }
    : null;
  const sanitizedImageGeneratorContext = imageGeneratorContext
    ? {
        ...imageGeneratorContext,
        imageReferences: sanitizedImageReferences,
        presetReferences: sanitizedPresetReferences,
        ...(canonicalMultiAngleRequest
          ? { cameraShotSet: canonicalMultiAngleRequest.cameraShotSetContext }
          : {}),
      }
    : null;
  const sanitizedCameraShotSetContext = canonicalMultiAngleRequest
    ? canonicalMultiAngleRequest.cameraShotSetContext
    : cameraShotSetContext
    ? {
        ...cameraShotSetContext,
        source: sanitizedTarget
          ? { ...cameraShotSetContext.source, ...sanitizedTarget }
          : cameraShotSetContext.source,
      }
    : null;

  const { data: existingJob, error: existingJobError } = await adminSupabase
    .from("ai_jobs")
    .select("id, project_id, thread_id, status, job_type, prompt, input_snapshot_id, output_snapshot_id, output_asset_ids, provider, error_code, error_message, last_error_code, last_error_message, last_attempt_at, created_at, updated_at, job_result")
    .eq("project_id", projectId)
    .eq("created_by", user.id)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existingJobError) {
    logger.error("ai job idempotency lookup failed", {
      requestId: context.requestId,
      projectId,
      userId: user.id,
      databaseCode: existingJobError.code ?? null,
      error: existingJobError,
    });
    return {
      ok: false,
      response: getAiJobDatabaseFailure({
        error: existingJobError,
        requestId: context.requestId,
        message: "Unable to check existing AI job",
        fallbackCode: "AI_JOB_LOOKUP_FAILED",
      }),
    };
  }

  if (existingJob && (!isRetryableTerminalJobStatus(existingJob.status) || clientIdempotencyKey)) {
    await deletePersistedProjectImageAssets({
      supabase,
      projectId,
      ownerId: user.id,
      assets: persistedInputAssets,
    }).catch(() => undefined);
    return {
      ok: true,
      data: {
        created: false,
        idempotent: true,
        job: await mapAiJobRecord(existingJob, {
          requestUrl: request.url,
          supabase,
          userId: user.id,
          projectId,
        }),
      },
    };
  }

  const { count: activeJobCount, error: activeJobError } = await adminSupabase
    .from("ai_jobs")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("created_by", user.id)
    .in("status", ["queued", "running"]);

  if (activeJobError) {
    logger.error("active ai job lookup failed", {
      requestId: context.requestId,
      projectId,
      userId: user.id,
      databaseCode: activeJobError.code ?? null,
      error: activeJobError,
    });
    return {
      ok: false,
      response: getAiJobDatabaseFailure({
        error: activeJobError,
        requestId: context.requestId,
        message: "Unable to check active AI jobs",
        fallbackCode: "AI_JOB_LOOKUP_FAILED",
      }),
    };
  }

  if ((activeJobCount ?? 0) >= 3) {
    return {
      ok: false,
      response: apiFailure(
        "CONCURRENT_JOB_LIMIT_REACHED",
        "Too many active generation jobs",
        429,
        context.requestId,
      ),
    };
  }

  const generationCreditCost =
    (jobType === "refine_concept" ? AI_CREDIT_COSTS.refineConcept : AI_CREDIT_COSTS.generateConcept) *
    Math.max(1, outputCount) * Math.max(1, sanitizedCameraShotSetContext?.shots.length ?? 1);

  const jobPayload = {
    executionMode,
    targetType,
    promptMode,
    model: requestedModel,
    aspectRatio,
    outputCount,
    promptEngine: {
      contextRevision: loadedSnapshot?.version ?? 0,
      snapshotId: resolvedSnapshotId ?? null,
      parentEngineRunId: null,
    },
    simulation: simulation ?? null,
    referenceAssetIds: resolvedReferenceAssetIds,
    inputAssetIds: [...inputAssetIds],
    selection: mergedSnapshot.selection,
    snapshot: mergedSnapshot,
    snapshotVersion: mergedSnapshot.snapshotVersion,
    snapshotSummary: {
      objectCount: mergedSnapshot.objects.length,
      regionCount: mergedSnapshot.regions.length,
      lockCount: mergedSnapshot.locks.length,
    },
    targetNodeId,
    maskAssetId: resolvedMaskAssetId ?? null,
    canvasGraphContext: sanitizedCanvasGraphContext,
    imageGeneratorContext: sanitizedImageGeneratorContext,
    cameraShotSetContext: sanitizedCameraShotSetContext,
    cameraPromptCompilerVersion: sanitizedCameraShotSetContext
      ? NOVEL_VIEW_PROMPT_COMPILER_VERSION
      : null,
  } as const;

  const rpcClient = adminSupabase as unknown as AiJobCheckpointRpcClient;
  const { data: createdRows, error: aiJobError } = await rpcClient.rpc("create_ai_job_with_checkpoint", {
    target_project_id: projectId,
    target_created_by: user.id,
    target_thread_id: threadId ?? null,
    target_job_type: jobType,
    target_prompt: prompt,
    target_input_asset_ids: [...inputAssetIds],
    target_idempotency_key: idempotencyKey,
    target_target_node_id: targetNodeId ?? null,
    target_job_payload: jobPayload,
    checkpoint_snapshot_json: clientSnapshot ? mergedSnapshot : null,
    checkpoint_document_hash: clientSnapshot ? mergedSnapshotHash : null,
    target_credit_amount: simulation ? 0 : generationCreditCost,
    target_credit_idempotency_key: simulation ? null : `generation:${idempotencyKey}`,
  });
  const aiJob = createdRows?.[0] ?? null;

  if (aiJobError || !aiJob) {
    logger.error("ai job create failed", {
      requestId: context.requestId,
      userId: user.id,
      projectId,
      databaseCode: aiJobError?.code ?? null,
      error: aiJobError,
    });
    const { data: racedJob } = await adminSupabase
      .from("ai_jobs")
      .select("id, project_id, thread_id, status, job_type, prompt, input_snapshot_id, output_snapshot_id, output_asset_ids, provider, error_code, error_message, last_error_code, last_error_message, last_attempt_at, created_at, updated_at, job_result")
      .eq("project_id", projectId)
      .eq("created_by", user.id)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (racedJob) {
      await deletePersistedProjectImageAssets({
        supabase,
        projectId,
        ownerId: user.id,
        assets: persistedInputAssets,
      }).catch(() => undefined);
      return {
        ok: true,
        data: {
          created: false,
          idempotent: true,
          job: await mapAiJobRecord(racedJob, {
            requestUrl: request.url,
            supabase,
            userId: user.id,
            projectId,
          }),
        },
      };
    }

    if (/INSUFFICIENT_CREDITS/i.test(aiJobError?.message ?? "")) {
      await deletePersistedProjectImageAssets({
        supabase,
        projectId,
        ownerId: user.id,
        assets: persistedInputAssets,
      }).catch(() => undefined);
      return {
        ok: false,
        response: apiFailure("INSUFFICIENT_CREDITS", "Not enough credits.", 403, context.requestId),
      };
    }
    await deletePersistedProjectImageAssets({
      supabase,
      projectId,
      ownerId: user.id,
      assets: persistedInputAssets,
    }).catch(() => undefined);
    return {
      ok: false,
      response: getAiJobDatabaseFailure({
        error: aiJobError ?? { message: "AI job RPC returned no row." },
        requestId: context.requestId,
        message: "Unable to create AI job",
        fallbackCode: "AI_JOB_CREATE_FAILED",
      }),
    };
  }

  if (!aiJob.created) {
    return {
      ok: true,
      data: {
        created: false,
        idempotent: true,
        job: await mapAiJobRecord(aiJob, {
          requestUrl: request.url,
          supabase,
          userId: user.id,
          projectId,
        }),
        creditsRemaining: aiJob.credits_remaining ?? undefined,
      },
    };
  }

  if (existingJob) {
    // Canvas requests use a deterministic key to collapse accidental duplicate
    // clicks. A terminal failure is a completed attempt, not a successful run,
    // so a later user-initiated Run needs a new job and credit reservation.
    idempotencyKey = createRetryIdempotencyKey(idempotencyKey);
    logger.info("creating AI job retry after terminal failure", {
      requestId: context.requestId,
      projectId,
      userId: user.id,
      previousJobId: existingJob.id,
      previousStatus: existingJob.status,
    });
  }

  return {
    ok: true,
    data: {
      created: true,
      idempotent: false,
      job: await mapAiJobRecord(aiJob, {
        requestUrl: request.url,
        supabase,
        userId: user.id,
        projectId,
      }),
      creditsRemaining: aiJob.credits_remaining ?? undefined,
    },
  };
}

async function mapAiJobRecord(row: {
  id: string;
  project_id: string;
  thread_id: string | null;
  status: string;
  job_type: string;
  prompt: string | null;
  input_snapshot_id: string | null;
  output_snapshot_id: string | null;
  output_asset_ids: string[] | null;
  provider: string | null;
  error_code: string | null;
  error_message: string | null;
  last_error_code?: string | null;
  last_error_message?: string | null;
  last_attempt_at?: string | null;
  created_at: string;
  updated_at: string;
  job_result?: unknown;
}, params?: {
  requestUrl: string;
  supabase: RequestContext["supabase"];
  userId: string;
  projectId: string;
}): Promise<CarverAiJobRecord> {
  return {
    id: row.id,
    projectId: row.project_id,
    threadId: row.thread_id,
    status: row.status as CarverAiJobRecord["status"],
    jobType: row.job_type as CarverAiJobRecord["jobType"],
    prompt: row.prompt,
    inputSnapshotId: row.input_snapshot_id,
    outputSnapshotId: row.output_snapshot_id,
    outputAssetIds: row.output_asset_ids ?? [],
    provider: row.provider,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    lastErrorCode: row.last_error_code ?? null,
    lastErrorMessage: row.last_error_message ?? null,
    lastAttemptAt: row.last_attempt_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    jobResult: params
      ? await resolveAiJobResultAssetUrls({
          requestUrl: params.requestUrl,
          result: isCarverAiJobResult(row.job_result) ? row.job_result : null,
          jobStatus: row.status as CarverAiJobRecord["status"],
          supabase: params.supabase,
          userId: params.userId,
          projectId: params.projectId,
        })
      : isCarverAiJobResult(row.job_result) ? row.job_result : null,
  };
}

function isCarverAiJobResult(value: unknown): value is CarverAiJobResult {
  const candidate = value as Record<string, unknown> | null;
  return candidate !== null && typeof candidate === "object" && !Array.isArray(candidate) && "stage" in candidate;
}
