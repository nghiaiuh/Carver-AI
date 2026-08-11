import { getSupabaseAdmin } from "@carver/db/server";
import { createSafeLogger } from "@carver/shared";
import { apiFailure, apiSuccess } from "../../../_lib/http";
import { requireProjectOwner, requireRequestContext } from "../../../_lib/authz";
import {
  getProjectCanvasDraftErrorCode,
  getProjectCanvasDraftErrorMessage,
  getProjectCanvasDraftErrorStatus,
  listProjectCanvasRecoveries,
} from "../../../../../lib/server/draftService";

const logger = createSafeLogger("web.project-draft-recoveries");

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const context = await requireRequestContext(request);
  if ("error" in context) return context.error;
  const { projectId } = await params;
  const projectResult = await requireProjectOwner(context, projectId);
  if ("error" in projectResult) return projectResult.error;
  try {
    const recoveries = await listProjectCanvasRecoveries(getSupabaseAdmin(), projectResult.project.id);
    // Documents are intentionally omitted from list responses. A recovery can
    // be restored explicitly, and the list is safe for a lightweight toast/UI.
    return apiSuccess({
      recoveries: recoveries.map((recovery) => ({
        id: recovery.id,
        projectId: recovery.projectId,
        clientId: recovery.clientId,
        baseRevision: recovery.baseRevision,
        cloudRevision: recovery.cloudRevision,
        documentHash: recovery.documentHash,
        conflictingEntityKeys: recovery.conflictingEntityKeys,
        reason: recovery.reason,
        createdAt: recovery.createdAt,
        resolvedAt: recovery.resolvedAt,
      })),
    });
  } catch (error) {
    logger.error("project draft recovery load failed", {
      requestId: context.requestId,
      projectId: projectResult.project.id,
      userId: context.user.id,
      error,
    });
    return apiFailure(
      getProjectCanvasDraftErrorCode(error, "DRAFT_LOAD_FAILED"),
      getProjectCanvasDraftErrorMessage(error, "Unable to load canvas recoveries."),
      getProjectCanvasDraftErrorStatus(error),
      context.requestId,
    );
  }
}
