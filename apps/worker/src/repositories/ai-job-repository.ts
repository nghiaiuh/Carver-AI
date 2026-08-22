/*
 * Flow: Persists AI job state transitions.
 * 1. Update ai_jobs status as work progresses.
 * 2. Store job results when preparation succeeds.
 * 3. Persist failure metadata when processing breaks.
 */

import { getSupabaseAdmin } from "@carver/db/server";
import type { Database } from "@carver/db";
import {
  coerceCanvasSnapshotDocument,
  isImageGeneratorAspectRatio,
  type CarverAiJobPayload,
  type CarverAiJobSimulationConfig,
  type CreateAiJobRequest,
} from "@carver/shared";
import type { PreparedGenerationJobResult } from "../services/generation-service";

const objectValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const simulationValue = (value: unknown): CarverAiJobSimulationConfig | undefined => {
  const source = objectValue(value);
  if (!source || typeof source.scenario !== "string") {
    return undefined;
  }

  return {
    scenario: source.scenario as CarverAiJobSimulationConfig["scenario"],
    delayMs: typeof source.delayMs === "number" ? source.delayMs : undefined,
    failUntilAttempt: typeof source.failUntilAttempt === "number" ? source.failUntilAttempt : undefined,
  };
};

type AiJobRow = Database["public"]["Tables"]["ai_jobs"]["Row"];
type AiJobStatus = AiJobRow["status"];

export type LoadedForProcessingJob =
  | {
      kind: "process";
      payload: CarverAiJobPayload;
      status: "queued" | "running";
      bullJobId: string | null;
    }
  | {
      kind: "terminal";
      status: AiJobStatus;
      bullJobId: string | null;
    }
  | {
      kind: "missing";
    };

export type StaleRunningJob = {
  id: string;
  bullJobId: string | null;
  lastAttemptAt: string | null;
};

export function readPersistedGenerationOptions(payload: Record<string, unknown>) {
  const imageGeneratorContext = objectValue(payload.imageGeneratorContext);
  const cameraShotSetContext = objectValue(payload.cameraShotSetContext);
  const targetType: CarverAiJobPayload["targetType"] =
    payload.targetType === "canvas-node"
      ? "canvas-node"
      : payload.targetType === "image-generator"
        ? "image-generator"
        : undefined;
  const outputCount =
    typeof payload.outputCount === "number" && Number.isInteger(payload.outputCount)
      ? Math.min(Math.max(payload.outputCount, 1), 4)
      : undefined;

  return {
    targetType,
    model: typeof payload.model === "string" && payload.model.trim() ? payload.model.trim() : undefined,
    aspectRatio: isImageGeneratorAspectRatio(payload.aspectRatio) ? payload.aspectRatio : undefined,
    outputCount,
    imageGeneratorContext:
      typeof imageGeneratorContext.nodeId === "string" &&
      typeof imageGeneratorContext.nodeTitle === "string" &&
      Array.isArray(imageGeneratorContext.imageReferences) &&
      Array.isArray(imageGeneratorContext.presetReferences) &&
      Array.isArray(imageGeneratorContext.textReferences)
        ? (imageGeneratorContext as CreateAiJobRequest["imageGeneratorContext"])
        : undefined,
    cameraShotSetContext:
      typeof cameraShotSetContext.shotSetNodeId === "string" &&
      cameraShotSetContext.source &&
      Array.isArray(cameraShotSetContext.shots) &&
      cameraShotSetContext.shots.length > 0
        ? (cameraShotSetContext as CreateAiJobRequest["cameraShotSetContext"])
        : undefined,
  };
}

type StartJobResult =
  | { kind: "started" | "resumed"; status: "running" }
  | { kind: "terminal"; status: AiJobStatus }
  | { kind: "conflict"; status: "running"; bullJobId: string | null };

const selectJobForProcessing = async (jobId: string) => {
  const supabase = getSupabaseAdmin();
  const aiJobsTable = supabase.from("ai_jobs") as any;
  const { data: job, error } = await aiJobsTable
    .select(
      "id, project_id, thread_id, created_by, status, job_type, prompt, input_snapshot_id, input_asset_ids, job_payload, idempotency_key, target_node_id, bull_job_id",
    )
    .eq("id", jobId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return job;
};

const markRunning = async (jobId: string, bullJobId: string): Promise<StartJobResult> => {
  const supabase = getSupabaseAdmin();
  const aiJobsTable = supabase.from("ai_jobs") as any;

  const { data, error } = await aiJobsTable
    .update({
      status: "running",
      bull_job_id: bullJobId,
      last_attempt_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("status", "queued")
    .select("id, status, bull_job_id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (data?.id) {
    return {
      kind: "started",
      status: "running",
    };
  }

  const currentJob = await selectJobForProcessing(jobId);
  if (!currentJob) {
    return { kind: "terminal", status: "failed" };
  }

  if (currentJob.status === "running" && currentJob.bull_job_id === bullJobId) {
    return {
      kind: "resumed",
      status: "running",
    };
  }

  if (currentJob.status === "running") {
    return {
      kind: "conflict",
      status: "running",
      bullJobId: currentJob.bull_job_id ?? null,
    };
  }

  return {
    kind: "terminal",
    status: currentJob.status,
  };
};

const loadForProcessing = async (
  jobId: string,
  bullJobId: string,
): Promise<LoadedForProcessingJob> => {
  const supabase = getSupabaseAdmin();
  const job = await selectJobForProcessing(jobId);

  if (!job) {
    return { kind: "missing" };
  }

  if (job.status !== "queued" && job.status !== "running") {
    return {
      kind: "terminal",
      status: job.status,
      bullJobId: job.bull_job_id ?? null,
    };
  }

  if (job.status === "running" && job.bull_job_id !== bullJobId) {
    throw new Error(
      `AI job running conflict: expected bull_job_id ${bullJobId} but found ${job.bull_job_id ?? "null"}.`,
    );
  }

  if (!job.created_by) {
    throw new Error("AI job is missing created_by.");
  }

  const payload = objectValue(job.job_payload);
  let snapshot = payload.snapshot ? coerceCanvasSnapshotDocument(payload.snapshot) : null;
  let snapshotVersion =
    payload.promptEngine &&
    typeof payload.promptEngine === "object" &&
    !Array.isArray(payload.promptEngine) &&
    typeof (payload.promptEngine as Record<string, unknown>).contextRevision === "number"
      ? ((payload.promptEngine as Record<string, unknown>).contextRevision as number)
      : null;

  if (!snapshot && job.input_snapshot_id) {
    const { data: snapshotRow, error: snapshotError } = await supabase
      .from("canvas_snapshots")
      .select("canvas_json, version")
      .eq("id", job.input_snapshot_id)
      .eq("project_id", job.project_id)
      .maybeSingle();

    if (snapshotError) {
      throw snapshotError;
    }

    if (snapshotRow) {
      snapshot = coerceCanvasSnapshotDocument(snapshotRow.canvas_json);
      snapshotVersion = typeof snapshotRow.version === "number" ? snapshotRow.version : snapshotVersion;
    }
  }

  if (!snapshot) {
    throw new Error("AI job is missing a canvas snapshot.");
  }

  const canvasGraphContext = objectValue(payload.canvasGraphContext);
  const generationOptions = readPersistedGenerationOptions(payload);

  return {
    kind: "process",
    status: job.status,
    bullJobId: job.bull_job_id ?? null,
    payload: {
      jobId: job.id,
      projectId: job.project_id,
      userId: job.created_by,
      jobType: job.job_type,
      prompt: job.prompt ?? "",
      inputSnapshotId: job.input_snapshot_id,
      threadId: job.thread_id,
      promptMode:
        payload.promptMode === "review" || payload.promptMode === "expert"
          ? payload.promptMode
          : "auto",
      executionMode:
        payload.executionMode === "text_to_image" ||
        payload.executionMode === "region_edit"
          ? payload.executionMode
          : "image_edit",
      targetType: generationOptions.targetType,
      model: generationOptions.model,
      aspectRatio: generationOptions.aspectRatio,
      outputCount: generationOptions.outputCount,
      snapshot,
      referenceAssetIds: Array.isArray(payload.referenceAssetIds)
        ? payload.referenceAssetIds.filter((item): item is string => typeof item === "string")
        : [],
      inputAssetIds: Array.isArray(job.input_asset_ids)
        ? job.input_asset_ids.filter((item: unknown): item is string => typeof item === "string")
        : [],
      targetNodeId: typeof job.target_node_id === "string"
        ? job.target_node_id
        : typeof payload.targetNodeId === "string"
          ? payload.targetNodeId
          : undefined,
      maskAssetId: typeof payload.maskAssetId === "string" ? payload.maskAssetId : undefined,
      simulation: simulationValue(payload.simulation),
      canvasGraphContext: "target" in canvasGraphContext
        ? (canvasGraphContext as CreateAiJobRequest["canvasGraphContext"])
        : undefined,
      imageGeneratorContext: generationOptions.imageGeneratorContext,
      cameraShotSetContext: generationOptions.cameraShotSetContext,
      promptEngine: {
        contextRevision: snapshotVersion ?? snapshot.snapshotVersion,
        snapshotId:
          payload.promptEngine &&
          typeof payload.promptEngine === "object" &&
          !Array.isArray(payload.promptEngine) &&
          typeof (payload.promptEngine as Record<string, unknown>).snapshotId === "string"
            ? ((payload.promptEngine as Record<string, unknown>).snapshotId as string)
            : job.input_snapshot_id,
        parentEngineRunId:
          payload.promptEngine &&
          typeof payload.promptEngine === "object" &&
          !Array.isArray(payload.promptEngine) &&
          typeof (payload.promptEngine as Record<string, unknown>).parentEngineRunId === "string"
            ? ((payload.promptEngine as Record<string, unknown>).parentEngineRunId as string)
            : undefined,
      },
    },
  };
};

const markSucceeded = async (
  jobId: string,
  bullJobId: string,
  result: PreparedGenerationJobResult,
) => {
  const supabase = getSupabaseAdmin();
  const aiJobsTable = supabase.from("ai_jobs") as any;
  const { data, error } = await aiJobsTable
    .update({
      status: "succeeded",
      bull_job_id: null,
      provider: result.provider,
      job_result: result.jobResult,
      output_asset_ids: result.jobResult.outputAssetIds,
      output_snapshot_id: result.jobResult.outputSnapshotId,
      error_code: null,
      error_message: null,
      last_error_code: null,
      last_error_message: null,
    })
    .eq("id", jobId)
    .eq("status", "running")
    .eq("bull_job_id", bullJobId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data?.id) {
    throw new Error("AI job could not be marked succeeded by this BullMQ execution.");
  }
};

/**
 * A stale/re-delivered BullMQ attempt must never overwrite a different
 * execution's running or succeeded state. A job may still be queued before
 * its first claim, so that state is only terminalized when no worker has bound
 * a bull_job_id yet.
 */
const markTerminalForCurrentExecution = async (
  jobId: string,
  bullJobId: string | null | undefined,
  fields: Record<string, unknown>,
) => {
  const supabase = getSupabaseAdmin();
  const aiJobsTable = supabase.from("ai_jobs") as any;

  if (bullJobId) {
    const { data, error } = await aiJobsTable
      .update({ ...fields, bull_job_id: bullJobId })
      .eq("id", jobId)
      .eq("status", "running")
      .eq("bull_job_id", bullJobId)
      .select("id")
      .maybeSingle();

    if (error) {
      throw error;
    }
    if (data?.id) {
      return true;
    }
  }

  const { data, error } = await aiJobsTable
    .update({ ...fields, bull_job_id: bullJobId ?? null })
    .eq("id", jobId)
    .eq("status", "queued")
    .is("bull_job_id", null)
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  return Boolean(data?.id);
};

const markFailed = async (
  jobId: string,
  params: {
    bullJobId?: string | null;
    errorCode: string;
    errorMessage: string;
  },
) => {
  await markTerminalForCurrentExecution(jobId, params.bullJobId, {
    status: "failed",
    error_code: params.errorCode,
    error_message: params.errorMessage,
    last_error_code: params.errorCode,
    last_error_message: params.errorMessage,
    last_attempt_at: new Date().toISOString(),
  });
};

const recordRetryableFailure = async (
  jobId: string,
  bullJobId: string,
  params: {
    errorCode: string;
    errorMessage: string;
  },
) => {
  const supabase = getSupabaseAdmin();
  const aiJobsTable = supabase.from("ai_jobs") as any;

  const { error } = await aiJobsTable
    .update({
      status: "running",
      bull_job_id: bullJobId,
      last_error_code: params.errorCode,
      last_error_message: params.errorMessage,
      last_attempt_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("status", "running")
    .eq("bull_job_id", bullJobId);

  if (error) {
    throw error;
  }
};

const reconcileExhaustedFailure = async (
  jobId: string,
  bullJobId: string | null,
  params: {
    errorCode: string;
    errorMessage: string;
  },
) => {
  await markTerminalForCurrentExecution(jobId, bullJobId, {
    status: "failed",
    error_code: params.errorCode,
    error_message: params.errorMessage,
    last_error_code: params.errorCode,
    last_error_message: params.errorMessage,
    last_attempt_at: new Date().toISOString(),
  });
};

const listStaleRunningJobs = async (olderThan: Date, limit: number): Promise<StaleRunningJob[]> => {
  const supabase = getSupabaseAdmin();
  const aiJobsTable = supabase.from("ai_jobs") as any;
  const { data, error } = await aiJobsTable
    .select("id, bull_job_id, last_attempt_at")
    .eq("status", "running")
    .or(`last_attempt_at.lt.${olderThan.toISOString()},last_attempt_at.is.null`)
    .order("last_attempt_at", { ascending: true })
    .limit(limit);

  if (error) {
    throw error;
  }

  return (data ?? []).map((job: { id: string; bull_job_id?: string | null; last_attempt_at?: string | null }) => ({
    id: job.id,
    bullJobId: job.bull_job_id ?? null,
    lastAttemptAt: job.last_attempt_at ?? null,
  }));
};

const reconcileStalledFailure = async (
  jobId: string,
  bullJobId: string | null,
  params: {
    errorCode: string;
    errorMessage: string;
  },
) => {
  const supabase = getSupabaseAdmin();
  const aiJobsTable = supabase.from("ai_jobs") as any;
  let query = aiJobsTable
    .update({
      status: "failed",
      error_code: params.errorCode,
      error_message: params.errorMessage,
      last_error_code: params.errorCode,
      last_error_message: params.errorMessage,
      last_attempt_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .eq("status", "running");

  // Never reconcile a running row owned by another BullMQ execution. Legacy
  // rows without a binding are safe to repair only when the DB value is also
  // null; omitting this filter would let a stale reconciler overwrite a newer
  // worker claim.
  query = bullJobId
    ? query.eq("bull_job_id", bullJobId)
    : query.is("bull_job_id", null);

  const { error } = await query;
  if (error) {
    throw error;
  }
};

export const aiJobRepository = {
  loadForProcessing,
  markRunning,
  markSucceeded,
  markFailed,
  recordRetryableFailure,
  reconcileExhaustedFailure,
  listStaleRunningJobs,
  reconcileStalledFailure,
};
