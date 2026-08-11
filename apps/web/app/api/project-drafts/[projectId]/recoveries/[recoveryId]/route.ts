import { getSupabaseAdmin } from "@carver/db/server";
import { createSafeLogger } from "@carver/shared";
import { apiFailure, apiSuccess } from "../../../../_lib/http";
import { isUuidLike, requireProjectOwner, requireRequestContext } from "../../../../_lib/authz";
import {
  getProjectCanvasDraftErrorCode,
  getProjectCanvasDraftErrorMessage,
  getProjectCanvasDraftErrorStatus,
  resolveProjectCanvasRecovery,
} from "../../../../../../lib/server/draftService";

const logger = createSafeLogger("web.project-draft-recovery");

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ projectId: string; recoveryId: string }> },
) {
  const context = await requireRequestContext(request);
  if ("error" in context) return context.error;
  const { projectId, recoveryId } = await params;
  const projectResult = await requireProjectOwner(context, projectId);
  if ("error" in projectResult) return projectResult.error;
  if (!isUuidLike(recoveryId)) return apiFailure("BAD_REQUEST", "recoveryId is invalid.", 400, context.requestId);
  try {
    await resolveProjectCanvasRecovery(getSupabaseAdmin(), {
      projectId: projectResult.project.id,
      recoveryId,
    });
    return apiSuccess({ recoveryId });
  } catch (error) {
    logger.error("project draft recovery discard failed", {
      requestId: context.requestId,
      projectId: projectResult.project.id,
      userId: context.user.id,
      error,
    });
    return apiFailure(
      getProjectCanvasDraftErrorCode(error, "DRAFT_SAVE_FAILED"),
      getProjectCanvasDraftErrorMessage(error, "Unable to discard the recovery copy."),
      getProjectCanvasDraftErrorStatus(error),
      context.requestId,
    );
  }
}
