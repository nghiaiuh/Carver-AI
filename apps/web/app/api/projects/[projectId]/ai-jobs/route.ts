/*
 * Route: API tao AI job theo project.
 * Thuoc: module background jobs / generation workflow.
 * Vai tro: dong goi yeu cau AI thanh job co snapshot context de worker xu ly bat dong bo.
 * Chuc nang:
 * - `POST`: kiem tra quyen project, lay snapshot hien tai, tao ai_job va enqueue vao queue.
 */

import { NextResponse } from "next/server";
import { buildConnectedGenerationBrief, buildSnapshotAwareEditBrief } from "@carver/ai";
import { AI_JOB_QUEUE_EVENT_NAME, createAiJobQueue } from "@carver/queue";
import type { CarverAiJobPayload, CreateAiJobRequest } from "@carver/shared";
import { coerceCanvasSnapshotDocument } from "@carver/shared";
import { getRequestContext } from "../../../_lib/auth";
import { badRequest, readJsonObject, stringArrayValue, stringValue } from "../../../_lib/http";

const JOB_TYPES: CreateAiJobRequest["jobType"][] = [
  "generate_concept",
  "refine_concept",
  "analyze_reference",
  "export",
];

const PROMPT_MODES = ["auto", "review", "expert"] as const;

const objectValue = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;

const normalizeJobType = (value: unknown): CreateAiJobRequest["jobType"] =>
  typeof value === "string" && JOB_TYPES.includes(value as CreateAiJobRequest["jobType"])
    ? (value as CreateAiJobRequest["jobType"])
    : "generate_concept";

const normalizePromptMode = (value: unknown): NonNullable<CreateAiJobRequest["promptMode"]> =>
  typeof value === "string" && PROMPT_MODES.includes(value as (typeof PROMPT_MODES)[number])
    ? (value as NonNullable<CreateAiJobRequest["promptMode"]>)
    : "auto";

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
  const context = await getRequestContext(request);
  if ("error" in context) {
    return context.error;
  }

  const { projectId } = await params;
  if (!projectId) {
    return badRequest("projectId is required");
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

  const { supabase, user } = context;

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, current_canvas_snapshot_id")
    .eq("id", projectId)
    .single();

  if (projectError || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const resolvedSnapshotId = inputSnapshotId ?? project.current_canvas_snapshot_id;
  if (!resolvedSnapshotId) {
    return badRequest("The project does not have a current canvas snapshot");
  }

  const { data: snapshotRow, error: snapshotError } = await supabase
    .from("canvas_snapshots")
    .select("id, project_id, version, canvas_json")
    .eq("id", resolvedSnapshotId)
    .eq("project_id", projectId)
    .single();

  if (snapshotError || !snapshotRow) {
    return NextResponse.json({ error: "Snapshot not found" }, { status: 404 });
  }

  const snapshot = coerceCanvasSnapshotDocument(snapshotRow.canvas_json);
  const mergedSnapshot = {
    ...snapshot,
    selection: {
      objectIds: selection.objectIds ?? snapshot.selection.objectIds,
      regionIds: selection.regionIds ?? snapshot.selection.regionIds,
      activeAssetIds: selection.activeAssetIds ?? snapshot.selection.activeAssetIds,
    },
  };

  const snapshotEditBrief = buildSnapshotAwareEditBrief({
    jobType,
    prompt,
    snapshot: mergedSnapshot,
  });
  const editBrief = canvasGraphContext
    ? buildConnectedGenerationBrief(
        snapshotEditBrief,
        canvasGraphContext as NonNullable<CreateAiJobRequest["canvasGraphContext"]>,
      )
    : snapshotEditBrief;

  const { data: aiJob, error: aiJobError } = await supabase
    .from("ai_jobs")
    .insert({
      project_id: projectId,
      thread_id: threadId ?? null,
      created_by: user.id,
      status: "queued",
      job_type: jobType,
      prompt,
      input_snapshot_id: snapshotRow.id,
      job_payload: {
        promptMode,
        referenceAssetIds,
        selection: mergedSnapshot.selection,
        snapshotVersion: snapshotRow.version,
        snapshotSummary: {
          objectCount: mergedSnapshot.objects.length,
          regionCount: mergedSnapshot.regions.length,
          lockCount: mergedSnapshot.locks.length,
        },
        targetNodeId,
        canvasGraphContext: canvasGraphContext ?? null,
        editBrief,
      } as never,
    })
    .select("id, project_id, status, job_type, input_snapshot_id, created_at")
    .single();

  if (aiJobError || !aiJob) {
    return NextResponse.json({ error: "Unable to create AI job" }, { status: 500 });
  }

  const payload: CarverAiJobPayload = {
    jobId: aiJob.id,
    projectId,
    userId: user.id,
    jobType,
    prompt,
    inputSnapshotId: snapshotRow.id,
    threadId: threadId ?? null,
    promptMode,
    snapshot: mergedSnapshot,
    referenceAssetIds,
    targetNodeId: targetNodeId ?? undefined,
    canvasGraphContext: canvasGraphContext as CreateAiJobRequest["canvasGraphContext"],
  };

  const queue = createAiJobQueue();

  try {
    await queue.add(AI_JOB_QUEUE_EVENT_NAME, payload, {
      jobId: aiJob.id,
      removeOnComplete: 100,
      removeOnFail: 100,
    });
  } catch {
    await supabase
      .from("ai_jobs")
      .update({
        status: "failed",
        error_code: "queue_enqueue_failed",
        error_message: "Unable to enqueue the AI job",
      })
      .eq("id", aiJob.id);

    return NextResponse.json({ error: "Unable to enqueue AI job" }, { status: 500 });
  } finally {
    await queue.close();
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        job: aiJob,
        editBrief,
      },
    },
    { status: 201 },
  );
}
