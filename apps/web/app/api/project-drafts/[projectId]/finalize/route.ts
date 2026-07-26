import { apiFailure, apiSuccess, readJsonObject } from "../../../_lib/http";
import { requireProjectOwner, requireRequestContext } from "../../../_lib/authz";
import {
  finalizeProjectCanvasDraft,
  getProjectCanvasDraftErrorCode,
  getProjectCanvasDraftErrorMessage,
  getProjectCanvasDraftErrorStatus,
} from "../../../../../lib/server/draftService";
import { createSafeLogger } from "@carver/shared";
import { getSupabaseAdmin } from "@carver/db/server";
import { enforceRateLimit } from "../../../_lib/rateLimit";

const logger = createSafeLogger("web.project-drafts.finalize");

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

  const rateLimit = await enforceRateLimit(context, {
    scope: "project-draft-finalize",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rateLimit.ok) {
    return rateLimit.response;
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
    const finalized = await finalizeProjectCanvasDraft(getSupabaseAdmin(), {
      actorUserId: context.user.id,
      projectId: projectResult.project.id,
      expectedRevision,
      reason,
    });

    return apiSuccess({
      projectId: projectResult.project.id,
      snapshot: finalized,
    });
  } catch (error) {
    logger.error("project draft finalize failed", {
      requestId: context.requestId,
      projectId: projectResult.project.id,
      userId: context.user.id,
      reason,
      error,
    });

    return apiFailure(
      getProjectCanvasDraftErrorCode(error, "DRAFT_FINALIZE_FAILED"),
      getProjectCanvasDraftErrorMessage(error, "Unable to finalize the project draft"),
      getProjectCanvasDraftErrorStatus(error),
      context.requestId,
    );
  }
}
