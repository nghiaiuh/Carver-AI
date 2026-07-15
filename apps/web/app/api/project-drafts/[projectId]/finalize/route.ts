import { apiFailure, apiSuccess, readJsonObject } from "../../../_lib/http";
import { requireProjectOwner, requireRequestContext } from "../../../_lib/authz";
import {
  ProjectCanvasDraftConflictError,
  finalizeProjectCanvasDraft,
} from "../../../../../lib/server/draftService";

function reasonValue(value: unknown): "manual" | "close" | "job_checkpoint" | null {
  if (value === "manual" || value === "close" || value === "job_checkpoint") {
    return value;
  }

  return null;
}

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
    return apiFailure("BAD_REQUEST", "projectId is required", 400, context.requestId);
  }

  const projectResult = await requireProjectOwner(context, projectId);
  if ("error" in projectResult) {
    return projectResult.error;
  }

  const body = await readJsonObject(request);
  const expectedRevision =
    typeof body.expectedRevision === "number" && Number.isInteger(body.expectedRevision)
      ? body.expectedRevision
      : null;
  if (expectedRevision === null) {
    return apiFailure("BAD_REQUEST", "expectedRevision is required", 400, context.requestId);
  }

  const reason = reasonValue(body.reason) ?? "manual";

  try {
    const finalized = await finalizeProjectCanvasDraft(context.supabase, {
      projectId: projectResult.project.id,
      expectedRevision,
      reason,
    });

    return apiSuccess({
      projectId: projectResult.project.id,
      snapshot: finalized,
    });
  } catch (error) {
    if (error instanceof ProjectCanvasDraftConflictError) {
      return apiFailure("DRAFT_CONFLICT", "The cloud draft changed in another tab or device.", 409, context.requestId);
    }

    return apiFailure(
      "DRAFT_FINALIZE_FAILED",
      "Unable to finalize the project draft",
      500,
      context.requestId,
    );
  }
}
