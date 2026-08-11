import {
  buildCanvasDraftOperations,
  coerceCanvasSnapshotDocument,
  toCanvasOperationV2,
} from "@carver/shared";
import { getSupabaseAdmin } from "@carver/db/server";
import { createSafeLogger } from "@carver/shared";
import { apiFailure, apiSuccess, readJsonObject } from "../../../../../_lib/http";
import { isUuidLike, requireProjectOwner, requireRequestContext } from "../../../../../_lib/authz";
import {
  commitProjectCanvasOperationBatch,
  getProjectCanvasDraftErrorCode,
  getProjectCanvasDraftErrorMessage,
  getProjectCanvasDraftErrorStatus,
  listProjectCanvasRecoveries,
  loadProjectCanvasDraft,
  resolveProjectCanvasRecovery,
} from "../../../../../../../lib/server/draftService";

const logger = createSafeLogger("web.project-draft-recovery-restore");

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string; recoveryId: string }> },
) {
  const context = await requireRequestContext(request);
  if ("error" in context) return context.error;
  const { projectId, recoveryId } = await params;
  const projectResult = await requireProjectOwner(context, projectId);
  if ("error" in projectResult) return projectResult.error;
  if (!isUuidLike(recoveryId)) return apiFailure("BAD_REQUEST", "recoveryId is invalid.", 400, context.requestId);
  const body = await readJsonObject(request);
  const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
  if (!clientId || clientId.length > 128) return apiFailure("BAD_REQUEST", "clientId is required.", 400, context.requestId);

  try {
    const admin = getSupabaseAdmin();
    const recovery = (await listProjectCanvasRecoveries(admin, projectResult.project.id))
      .find((candidate) => candidate.id === recoveryId);
    if (!recovery) return apiFailure("RESOURCE_NOT_FOUND", "Recovery copy not found.", 404, context.requestId);
    const current = await loadProjectCanvasDraft(admin, projectResult.project.id);
    const { operations } = buildCanvasDraftOperations({
      previousDocument: current.document ?? coerceCanvasSnapshotDocument(undefined),
      nextDocument: recovery.document,
      projectId: projectResult.project.id,
      tabId: clientId,
      baseRevision: current.draft?.revision ?? 0,
      sequenceStart: 0,
    });
    if (operations.length === 0) {
      await resolveProjectCanvasRecovery(admin, { projectId: projectResult.project.id, recoveryId });
      return apiSuccess({ draft: current.draft, restored: false });
    }
    const batchId = crypto.randomUUID();
    const committed = await commitProjectCanvasOperationBatch(admin, {
      actorUserId: context.user.id,
      projectId: projectResult.project.id,
      expectedRevision: current.draft?.revision ?? 0,
      batchId,
      clientId,
      baseSnapshotId: current.draft?.baseSnapshotId ?? null,
      operations: operations.map((operation, index) => toCanvasOperationV2(operation, {
        clientId,
        clientSequence: index + 1,
      })),
      cloudDocument: current.document ?? coerceCanvasSnapshotDocument(undefined),
      documentHash: recovery.documentHash,
    });
    await resolveProjectCanvasRecovery(admin, { projectId: projectResult.project.id, recoveryId });
    return apiSuccess({ draft: committed.draft, restored: true });
  } catch (error) {
    logger.error("project draft recovery restore failed", {
      requestId: context.requestId,
      projectId: projectResult.project.id,
      userId: context.user.id,
      error,
    });
    return apiFailure(
      getProjectCanvasDraftErrorCode(error, "DRAFT_SAVE_FAILED"),
      getProjectCanvasDraftErrorMessage(error, "Unable to restore the recovery copy."),
      getProjectCanvasDraftErrorStatus(error),
      context.requestId,
    );
  }
}
