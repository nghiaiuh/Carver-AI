import { NextResponse } from "next/server";
import { apiFailure } from "./http";
import { getRequestContext } from "./auth";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type RequestContext = Exclude<Awaited<ReturnType<typeof getRequestContext>>, { error: NextResponse }>;

type NotFoundResult = {
  error: NextResponse;
};

const notFoundResponse = (message: string, requestId: string): NotFoundResult => ({
  error: apiFailure("RESOURCE_NOT_FOUND", message, 404, requestId),
});

export const isUuidLike = (value: string) => UUID_PATTERN.test(value.trim());

export async function requireRequestContext(request: Request) {
  return getRequestContext(request);
}

export async function requireProjectOwner(context: RequestContext, projectId: string) {
  const normalizedProjectId = projectId.trim();
  if (!isUuidLike(normalizedProjectId)) {
    return { error: apiFailure("BAD_REQUEST", "projectId is invalid", 400, context.requestId) };
  }

  const { data: project, error } = await context.supabase
    .from("projects")
    .select("id, owner_id, current_canvas_snapshot_id")
    .eq("id", normalizedProjectId)
    .eq("owner_id", context.user.id)
    .maybeSingle();

  if (error) {
    return { error: apiFailure("INTERNAL_SERVER_ERROR", "Internal server error", 500, context.requestId) };
  }

  if (!project) {
    return notFoundResponse("Project not found", context.requestId);
  }

  return { project };
}

export async function requireProjectScopedJob(context: RequestContext, projectId: string, jobId: string) {
  const projectResult = await requireProjectOwner(context, projectId);
  if ("error" in projectResult) {
    return projectResult;
  }

  const normalizedJobId = jobId.trim();
  if (!isUuidLike(normalizedJobId)) {
    return { error: apiFailure("BAD_REQUEST", "jobId is invalid", 400, context.requestId) };
  }

  const { data: job, error } = await context.supabase
    .from("ai_jobs")
    .select(
      "id, project_id, thread_id, status, job_type, prompt, input_snapshot_id, output_snapshot_id, output_asset_ids, provider, error_code, error_message, created_at, updated_at, job_result",
    )
    .eq("id", normalizedJobId)
    .eq("project_id", projectId.trim())
    .eq("created_by", context.user.id)
    .maybeSingle();

  if (error) {
    return { error: apiFailure("INTERNAL_SERVER_ERROR", "Internal server error", 500, context.requestId) };
  }

  if (!job) {
    return notFoundResponse("AI job not found", context.requestId);
  }

  return { project: projectResult.project, job };
}
