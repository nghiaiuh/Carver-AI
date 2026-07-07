/*
 * Flow: Persists AI job state transitions.
 * 1. Update ai_jobs status as work progresses.
 * 2. Store job results when preparation succeeds.
 * 3. Persist failure metadata when processing breaks.
 */

import { getSupabaseAdmin } from "@carver/db/server";
import { coerceCanvasSnapshotDocument, type CarverAiJobPayload, type CreateAiJobRequest } from "@carver/shared";
import type { PreparedGenerationJobResult } from "../services/generation-service";

const objectValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};

const markRunning = async (jobId: string) => {
  const supabase = getSupabaseAdmin();

  await supabase
    .from("ai_jobs")
    .update({
      status: "running",
      error_code: null,
      error_message: null,
    })
    .eq("id", jobId);
};

const loadForProcessing = async (jobId: string): Promise<CarverAiJobPayload | null> => {
  const supabase = getSupabaseAdmin();
  const { data: job, error } = await supabase
    .from("ai_jobs")
    .select(
      "id, project_id, thread_id, created_by, status, job_type, prompt, input_snapshot_id, job_payload, idempotency_key, target_node_id",
    )
    .eq("id", jobId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!job || job.status === "succeeded") {
    return null;
  }

  if (!job.created_by) {
    throw new Error("AI job is missing created_by.");
  }

  const payload = objectValue(job.job_payload);
  let snapshot = payload.snapshot ? coerceCanvasSnapshotDocument(payload.snapshot) : null;

  if (!snapshot && job.input_snapshot_id) {
    const { data: snapshotRow, error: snapshotError } = await supabase
      .from("canvas_snapshots")
      .select("canvas_json")
      .eq("id", job.input_snapshot_id)
      .eq("project_id", job.project_id)
      .maybeSingle();

    if (snapshotError) {
      throw snapshotError;
    }

    if (snapshotRow) {
      snapshot = coerceCanvasSnapshotDocument(snapshotRow.canvas_json);
    }
  }

  if (!snapshot) {
    throw new Error("AI job is missing a canvas snapshot.");
  }

  const canvasGraphContext = objectValue(payload.canvasGraphContext);

  return {
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
    snapshot,
    referenceAssetIds: Array.isArray(payload.referenceAssetIds)
      ? payload.referenceAssetIds.filter((item): item is string => typeof item === "string")
      : [],
    targetNodeId: typeof job.target_node_id === "string"
      ? job.target_node_id
      : typeof payload.targetNodeId === "string"
        ? payload.targetNodeId
        : undefined,
    canvasGraphContext: "target" in canvasGraphContext
      ? (canvasGraphContext as CreateAiJobRequest["canvasGraphContext"])
      : undefined,
  };
};

const markSucceeded = async (jobId: string, result: PreparedGenerationJobResult) => {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("ai_jobs")
    .update({
      status: "succeeded",
      provider: result.provider,
      job_result: result.jobResult,
      output_asset_ids: result.jobResult.outputAssetIds,
      output_snapshot_id: result.jobResult.outputSnapshotId,
    })
    .eq("id", jobId);

  if (error) {
    throw error;
  }
};

const markFailed = async (
  jobId: string,
  params: {
    errorCode: string;
    errorMessage: string;
  },
) => {
  const supabase = getSupabaseAdmin();

  await supabase
    .from("ai_jobs")
    .update({
      status: "failed",
      error_code: params.errorCode,
      error_message: params.errorMessage,
    })
    .eq("id", jobId);
};

export const aiJobRepository = {
  loadForProcessing,
  markRunning,
  markSucceeded,
  markFailed,
};
