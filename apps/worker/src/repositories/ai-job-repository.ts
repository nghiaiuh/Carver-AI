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

const markSucceeded = async (jobId: string, result: PreparedGenerationJobResult) => {
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
    .select("id")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data?.id) {
    throw new Error("AI job could not be marked succeeded from the running state.");
  }
};

const markFailed = async (
  jobId: string,
  params: {
    bullJobId?: string | null;
    errorCode: string;
    errorMessage: string;
  },
) => {
  const supabase = getSupabaseAdmin();
  const aiJobsTable = supabase.from("ai_jobs") as any;

  await aiJobsTable
    .update({
      status: "failed",
      bull_job_id: params.bullJobId ?? null,
      error_code: params.errorCode,
      error_message: params.errorMessage,
      last_error_code: params.errorCode,
      last_error_message: params.errorMessage,
      last_attempt_at: new Date().toISOString(),
    })
    .eq("id", jobId);
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
  const supabase = getSupabaseAdmin();
  const aiJobsTable = supabase.from("ai_jobs") as any;

  const { error } = await aiJobsTable
    .update({
      status: "failed",
      bull_job_id: bullJobId,
      error_code: params.errorCode,
      error_message: params.errorMessage,
      last_error_code: params.errorCode,
      last_error_message: params.errorMessage,
      last_attempt_at: new Date().toISOString(),
    })
    .eq("id", jobId)
    .in("status", ["queued", "running"]);

  if (error) {
    throw error;
  }
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

  if (bullJobId) {
    query = query.eq("bull_job_id", bullJobId);
  }

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
