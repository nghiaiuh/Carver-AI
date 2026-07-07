/*
 * Route: API tao AI job theo project.
 * Thuoc: module background jobs / generation workflow.
 * Vai tro: dong goi yeu cau AI thanh job co snapshot + graph context de worker xu ly bat dong bo.
 * Chuc nang:
 * - `POST`: kiem tra quyen project, resolve snapshot, tao ai_job va enqueue vao queue.
 */

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createSafeLogger } from "@carver/shared";
import { AI_JOB_QUEUE_EVENT_NAME, createAiJobQueue } from "@carver/queue";
import type { CarverAiJobRecord, CarverAiJobResult, CreateAiJobRequest, QueuedCarverAiJobPayload } from "@carver/shared";
import { coerceCanvasSnapshotDocument } from "@carver/shared";
import { requireProjectOwner, requireRequestContext, isUuidLike } from "../../../_lib/authz";
import { apiFailure, apiSuccess, badRequest, readJsonObject, stringArrayValue, stringValue } from "../../../_lib/http";
import { checkRateLimit } from "../../../_lib/rateLimit";
import { resolveAiJobResultAssetUrls } from "../../../../../lib/server/aiJobResultAssets";

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
const logger = createSafeLogger("web.ai-jobs");

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

const buildIdempotencyKey = (params: {
  userId: string;
  projectId: string;
  jobType: string;
  prompt: string;
  inputSnapshotId: string | null;
  targetNodeId: string | undefined;
}) =>
  createHash("sha256")
    .update(
      JSON.stringify({
        userId: params.userId,
        projectId: params.projectId,
        jobType: params.jobType,
        prompt: params.prompt,
        inputSnapshotId: params.inputSnapshotId,
        targetNodeId: params.targetNodeId ?? null,
      }),
    )
    .digest("hex")
    .slice(0, 48);

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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const context = await requireRequestContext(request);
  if ("error" in context) {
    return context.error;
  }

  const { projectId } = await params;
  if (!projectId) {
    return badRequest("projectId is required");
  }

  if (!isUuidLike(projectId)) {
    return badRequest("projectId is invalid");
  }

  const body = await readJsonObject(request);
  const prompt = stringValue(body, "prompt") ?? stringValue(body, "rawPrompt");
  if (!prompt) {
    return badRequest("prompt is required");
  }

  const inputSnapshotId = stringValue(body, "inputSnapshotId");
  const threadId = stringValue(body, "threadId");
  const referenceAssetIds = stringArrayValue(body, "referenceAssetIds") ?? [];
  const selection = normalizeSelection(body.selection);
  const promptMode = normalizePromptMode(body.promptMode);
  const jobType = normalizeJobType(body.jobType);
  const targetNodeId = stringValue(body, "targetNodeId");
  const canvasGraphContext = objectValue(body.canvasGraphContext);
  const clientSnapshot = snapshotValue(body.snapshot ?? body.canvasSnapshot);

  if (!SUPPORTED_JOB_TYPES.includes(jobType)) {
    return badRequest(`jobType ${jobType} is not supported yet`);
  }

  const projectResult = await requireProjectOwner(context, projectId);
  if ("error" in projectResult) {
    return projectResult.error;
  }
  const { supabase, user } = context;
  const { project } = projectResult;

  const rateLimit = checkRateLimit({
    key: `ai-job:${user.id}:${projectId}`,
    limit: 10,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return apiFailure("RATE_LIMITED", "Too many generation requests", 429, context.requestId);
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
    return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
  }

  if (!clientSnapshot && !loadedSnapshot) {
    return badRequest("A canvas snapshot is required to create an AI job");
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

  const idempotencyKey =
    stringValue(body, "idempotencyKey") ??
    buildIdempotencyKey({
      userId: user.id,
      projectId,
      jobType,
      prompt,
      inputSnapshotId: loadedSnapshot?.id ?? resolvedSnapshotId ?? null,
      targetNodeId,
    });

  const { data: existingJob, error: existingJobError } = await supabase
    .from("ai_jobs")
    .select("id, project_id, thread_id, status, job_type, prompt, input_snapshot_id, output_snapshot_id, output_asset_ids, provider, error_code, error_message, created_at, updated_at, job_result")
    .eq("project_id", projectId)
    .eq("created_by", user.id)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  if (existingJobError) {
    return apiFailure("AI_JOB_LOOKUP_FAILED", "Unable to check existing AI job", 500, context.requestId);
  }

  if (existingJob) {
    return apiSuccess({
      job: mapAiJobRecord(existingJob, request.url),
      idempotent: true,
    });
  }

  const { count: activeJobCount, error: activeJobError } = await supabase
    .from("ai_jobs")
    .select("id", { count: "exact", head: true })
    .eq("project_id", projectId)
    .eq("created_by", user.id)
    .in("status", ["queued", "running"]);

  if (activeJobError) {
    return apiFailure("AI_JOB_LOOKUP_FAILED", "Unable to check active AI jobs", 500, context.requestId);
  }

  if ((activeJobCount ?? 0) >= 3) {
    return apiFailure("CONCURRENT_JOB_LIMIT_REACHED", "Too many active generation jobs", 429, context.requestId);
  }

  const { data: aiJob, error: aiJobError } = await supabase
    .from("ai_jobs")
    .insert({
      project_id: projectId,
      thread_id: threadId ?? null,
      created_by: user.id,
      status: "queued",
      job_type: jobType,
      prompt,
      input_snapshot_id: loadedSnapshot?.id ?? null,
      idempotency_key: idempotencyKey,
      target_node_id: targetNodeId ?? null,
      job_payload: {
        promptMode,
        referenceAssetIds,
        selection: mergedSnapshot.selection,
        snapshot: mergedSnapshot,
        snapshotVersion: mergedSnapshot.snapshotVersion,
        snapshotSummary: {
          objectCount: mergedSnapshot.objects.length,
          regionCount: mergedSnapshot.regions.length,
          lockCount: mergedSnapshot.locks.length,
        },
        targetNodeId,
        canvasGraphContext: canvasGraphContext ?? null,
      } as never,
    })
    .select("id, project_id, thread_id, status, job_type, prompt, input_snapshot_id, output_snapshot_id, output_asset_ids, provider, error_code, error_message, created_at, updated_at, job_result")
    .single();

  if (aiJobError || !aiJob) {
    logger.error("ai job create failed", {
      requestId: context.requestId,
      userId: user.id,
      projectId,
      error: aiJobError,
    });
    const { data: racedJob } = await supabase
      .from("ai_jobs")
      .select("id, project_id, thread_id, status, job_type, prompt, input_snapshot_id, output_snapshot_id, output_asset_ids, provider, error_code, error_message, created_at, updated_at, job_result")
      .eq("project_id", projectId)
      .eq("created_by", user.id)
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (racedJob) {
      return apiSuccess({
        job: mapAiJobRecord(racedJob, request.url),
        idempotent: true,
      });
    }

    return apiFailure("AI_JOB_CREATE_FAILED", "Unable to create AI job", 500, context.requestId);
  }

  const payload: QueuedCarverAiJobPayload = {
    jobId: aiJob.id,
    requestId: context.requestId,
    idempotencyKey,
  };

  const queue = createAiJobQueue();

  try {
    await queue.add(AI_JOB_QUEUE_EVENT_NAME, payload, {
      jobId: aiJob.id,
      removeOnComplete: 100,
      removeOnFail: 100,
    });
  } catch {
    logger.error("ai job enqueue failed", {
      requestId: context.requestId,
      userId: user.id,
      projectId,
      jobId: aiJob.id,
    });
    await supabase
      .from("ai_jobs")
      .update({
        status: "failed",
        error_code: "queue_enqueue_failed",
        error_message: "Unable to enqueue the AI job",
      })
      .eq("id", aiJob.id);

    return apiFailure("QUEUE_UNAVAILABLE", "Unable to enqueue AI job", 500, context.requestId);
  } finally {
    await queue.close();
  }

  return apiSuccess(
    {
      job: mapAiJobRecord(aiJob, request.url),
      idempotent: false,
    },
    { status: 201 },
  );
}

function mapAiJobRecord(row: {
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
  job_result: unknown;
}, requestUrl?: string): CarverAiJobRecord {
  return {
    id: row.id,
    projectId: row.project_id,
    threadId: row.thread_id,
    status: row.status,
    jobType: row.job_type,
    prompt: row.prompt,
    inputSnapshotId: row.input_snapshot_id,
    outputSnapshotId: row.output_snapshot_id,
    outputAssetIds: row.output_asset_ids ?? [],
    provider: row.provider,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    jobResult: requestUrl
      ? resolveAiJobResultAssetUrls(
          requestUrl,
          isCarverAiJobResult(row.job_result) ? row.job_result : null,
        )
      : isCarverAiJobResult(row.job_result) ? row.job_result : null,
  };
}

function isCarverAiJobResult(value: unknown): value is CarverAiJobResult {
  const candidate = value as Record<string, unknown> | null;
  return candidate !== null && typeof candidate === "object" && !Array.isArray(candidate) && "stage" in candidate;
}
