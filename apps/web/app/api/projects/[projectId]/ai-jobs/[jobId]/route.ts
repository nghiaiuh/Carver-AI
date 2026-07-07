/*
 * Route: API doc trang thai cua mot AI job.
 * Thuoc: module background jobs / generation workflow.
 * Vai tro: tra ve job state de UI co the poll va render ket qua generation tu worker.
 * Chuc nang:
 * - `GET`: xac thuc quyen project va tra ve mot ai_job cu the.
 */

import { NextResponse } from "next/server";
import type { CarverAiJobRecord, CarverAiJobResult } from "@carver/shared";
import { requireProjectScopedJob, requireRequestContext, isUuidLike } from "../../../../_lib/authz";
import { badRequest } from "../../../../_lib/http";
import { resolveAiJobResultAssetUrls } from "../../../../../../lib/server/aiJobResultAssets";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string; jobId: string }> },
) {
  const context = await requireRequestContext(request);
  if ("error" in context) {
    return context.error;
  }

  const { projectId, jobId } = await params;
  if (!projectId) {
    return badRequest("projectId is required");
  }

  if (!isUuidLike(projectId)) {
    return badRequest("projectId is invalid");
  }

  if (!jobId) {
    return badRequest("jobId is required");
  }

  if (!isUuidLike(jobId)) {
    return badRequest("jobId is invalid");
  }

  const jobResult = await requireProjectScopedJob(context, projectId, jobId);
  if ("error" in jobResult) {
    return jobResult.error;
  }
  const { job } = jobResult;

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
        jobResult: resolveAiJobResultAssetUrls(
          request.url,
          isCarverAiJobResult(job.job_result) ? job.job_result : null,
        ),
      } satisfies CarverAiJobRecord,
    },
  });
}

function isCarverAiJobResult(value: unknown): value is CarverAiJobResult {
  const candidate = value as Record<string, unknown> | null;
  return candidate !== null && typeof candidate === "object" && !Array.isArray(candidate) && "stage" in candidate;
}
