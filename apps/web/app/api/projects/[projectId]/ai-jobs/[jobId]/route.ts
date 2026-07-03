/*
 * Route: API doc trang thai cua mot AI job.
 * Thuoc: module background jobs / generation workflow.
 * Vai tro: tra ve job state de UI co the poll va render ket qua generation tu worker.
 * Chuc nang:
 * - `GET`: xac thuc quyen project va tra ve mot ai_job cu the.
 */

import { NextResponse } from "next/server";
import type { CarverAiJobRecord, CarverAiJobResult } from "@carver/shared";
import { getRequestContext } from "../../../../_lib/auth";
import { badRequest } from "../../../../_lib/http";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string; jobId: string }> },
) {
  const context = await getRequestContext(request);
  if ("error" in context) {
    return context.error;
  }

  const { projectId, jobId } = await params;
  if (!projectId) {
    return badRequest("projectId is required");
  }

  if (!jobId) {
    return badRequest("jobId is required");
  }

  const { supabase } = context;

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .single();

  if (projectError || !project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { data: job, error: jobError } = await supabase
    .from("ai_jobs")
    .select("id, project_id, thread_id, status, job_type, prompt, input_snapshot_id, output_snapshot_id, output_asset_ids, provider, error_code, error_message, created_at, updated_at, job_result")
    .eq("id", jobId)
    .eq("project_id", projectId)
    .single();

  if (jobError || !job) {
    return NextResponse.json({ error: "AI job not found" }, { status: 404 });
  }

  return NextResponse.json({
    success: true,
    data: {
      job: {
        id: job.id,
        projectId: job.project_id,
        threadId: job.thread_id,
        status: job.status,
        jobType: job.job_type,
        prompt: job.prompt,
        inputSnapshotId: job.input_snapshot_id,
        outputSnapshotId: job.output_snapshot_id,
        outputAssetIds: job.output_asset_ids ?? [],
        provider: job.provider,
        errorCode: job.error_code,
        errorMessage: job.error_message,
        createdAt: job.created_at,
        updatedAt: job.updated_at,
        jobResult: isCarverAiJobResult(job.job_result) ? job.job_result : null,
      } satisfies CarverAiJobRecord,
    },
  });
}

function isCarverAiJobResult(value: unknown): value is CarverAiJobResult {
  const candidate = value as Record<string, unknown> | null;
  return candidate !== null && typeof candidate === "object" && !Array.isArray(candidate) && "stage" in candidate;
}
