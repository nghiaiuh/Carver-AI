import {
  applyCanvasDraftOperations,
  coerceCanvasSnapshotDocument,
  getCanvasOperationConflict,
  getCanvasDraftOperationEntityKey,
  type CanvasDraftOperation,
  type CanvasOperationV2,
} from "@carver/shared";
import { getSupabaseAdmin } from "@carver/db/server";
import { createSafeLogger } from "@carver/shared";
import { apiFailure, apiSuccess, readJsonObject } from "../../../_lib/http";
import { isUuidLike, requireProjectOwner, requireRequestContext } from "../../../_lib/authz";
import { enforceRateLimit } from "../../../_lib/rateLimit";
import {
  ProjectCanvasDraftEntityConflictError,
  commitProjectCanvasOperationBatch,
  createProjectCanvasRecovery,
  getProjectCanvasDraftErrorCode,
  getProjectCanvasDraftErrorMessage,
  getProjectCanvasDraftErrorStatus,
  listProjectCanvasDraftOperations,
  loadProjectCanvasDraft,
} from "../../../../../lib/server/draftService";
import {
  validateCanvasSnapshotDocument,
  validateSnapshotAssetOwnership,
} from "../../../../../lib/server/canvasSnapshotValidation";

const logger = createSafeLogger("web.project-draft-operations");
const MAX_OPERATIONS_PER_BATCH = 200;
const MAX_OPERATION_BATCH_BYTES = 2 * 1024 * 1024;
const OPERATION_TYPES = new Set<CanvasDraftOperation["type"]>([
  "node.upsert", "node.delete", "edge.upsert", "edge.delete", "target.set",
  "markers.set", "added-objects.set", "sketch-lines.set", "sketch-groups.set",
  "pen-strokes.set", "pen-settings.set", "camera.set",
]);

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function documentValue(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return coerceCanvasSnapshotDocument(value);
}

function parseOperations(params: {
  value: unknown;
  projectId: string;
  clientId: string;
  baseRevision: number;
}) {
  if (!Array.isArray(params.value) || params.value.length === 0 || params.value.length > MAX_OPERATIONS_PER_BATCH) {
    return null;
  }

  const operationIds = new Set<string>();
  const parsed: CanvasOperationV2[] = [];
  for (const value of params.value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const candidate = value as Record<string, unknown>;
    const payload = candidate.payload;
    const operationId = typeof candidate.operationId === "string" ? candidate.operationId : "";
    const type = candidate.type as CanvasDraftOperation["type"];
    const sequence = numberValue(candidate.clientSequence);
    if (!isUuidLike(operationId) || operationIds.has(operationId) || !OPERATION_TYPES.has(type) || sequence === null) {
      return null;
    }
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
    const legacy = payload as CanvasDraftOperation;
    if (legacy.operationId !== operationId || legacy.projectId !== params.projectId || legacy.type !== type) {
      return null;
    }
    operationIds.add(operationId);
    parsed.push({
      operationId,
      projectId: params.projectId,
      clientId: params.clientId,
      clientSequence: sequence,
      baseRevision: params.baseRevision,
      entityKey: typeof candidate.entityKey === "string" && candidate.entityKey.length <= 240
        ? candidate.entityKey
        : getCanvasDraftOperationEntityKey(legacy),
      type,
      payload: legacy,
      createdAt: typeof candidate.createdAt === "string" ? candidate.createdAt : new Date().toISOString(),
    });
  }
  return parsed;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const context = await requireRequestContext(request);
  if ("error" in context) return context.error;
  const { projectId } = await params;
  const projectResult = await requireProjectOwner(context, projectId);
  if ("error" in projectResult) return projectResult.error;
  const afterRevision = numberValue(new URL(request.url).searchParams.get("afterRevision")
    ? Number(new URL(request.url).searchParams.get("afterRevision"))
    : 0);
  if (afterRevision === null) {
    return apiFailure("BAD_REQUEST", "afterRevision is invalid.", 400, context.requestId);
  }
  try {
    const operations = await listProjectCanvasDraftOperations(getSupabaseAdmin(), {
      projectId: projectResult.project.id,
      afterRevision,
    });
    return apiSuccess({ operations });
  } catch (error) {
    logger.error("project draft operation load failed", {
      requestId: context.requestId,
      projectId: projectResult.project.id,
      userId: context.user.id,
      error,
    });
    return apiFailure(
      getProjectCanvasDraftErrorCode(error, "DRAFT_LOAD_FAILED"),
      getProjectCanvasDraftErrorMessage(error, "Unable to load canvas operations."),
      getProjectCanvasDraftErrorStatus(error),
      context.requestId,
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const context = await requireRequestContext(request);
  if ("error" in context) return context.error;
  const { projectId } = await params;
  const projectResult = await requireProjectOwner(context, projectId);
  if ("error" in projectResult) return projectResult.error;

  const rateLimit = await enforceRateLimit(context, { scope: "project-draft-save", limit: 120, windowMs: 60_000 });
  if (!rateLimit.ok) return rateLimit.response;
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_OPERATION_BATCH_BYTES) {
    return apiFailure("PAYLOAD_TOO_LARGE", "Canvas operation batch is too large.", 413, context.requestId);
  }

  const body = await readJsonObject(request);
  const batchId = typeof body.batchId === "string" ? body.batchId : "";
  const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
  const baseRevision = numberValue(body.baseRevision);
  const document = documentValue(body.document);
  const documentHash = typeof body.documentHash === "string" ? body.documentHash.trim() : "";
  const baseSnapshotId = typeof body.baseSnapshotId === "string" && body.baseSnapshotId.trim()
    ? body.baseSnapshotId.trim()
    : null;
  if (!isUuidLike(batchId) || !clientId || clientId.length > 128 || baseRevision === null || !document || !documentHash) {
    return apiFailure("BAD_REQUEST", "batchId, clientId, baseRevision, document and documentHash are required.", 400, context.requestId);
  }
  if (baseSnapshotId && !isUuidLike(baseSnapshotId)) {
    return apiFailure("BAD_REQUEST", "baseSnapshotId is invalid.", 400, context.requestId);
  }
  const operations = parseOperations({ value: body.operations, projectId: projectResult.project.id, clientId, baseRevision });
  if (!operations) return apiFailure("BAD_REQUEST", "operations are invalid.", 400, context.requestId);

  try {
    const admin = getSupabaseAdmin();
    const current = await loadProjectCanvasDraft(admin, projectResult.project.id);
    const currentRevision = current.draft?.revision ?? 0;
    if (currentRevision !== baseRevision) {
      const remoteOperations = await listProjectCanvasDraftOperations(admin, {
        projectId: projectResult.project.id,
        afterRevision: baseRevision,
      });
      const conflict = getCanvasOperationConflict(operations, remoteOperations);
      if (conflict.hasConflict) {
        await createProjectCanvasRecovery(admin, {
          projectId: projectResult.project.id,
          actorUserId: context.user.id,
          clientId,
          baseRevision,
          cloudRevision: currentRevision,
          documentHash,
          document,
          conflictingEntityKeys: conflict.entityKeys,
          reason: "DRAFT_ENTITY_CONFLICT",
        });
        throw new ProjectCanvasDraftEntityConflictError(conflict.entityKeys);
      }
    }

    const resultingDocument = applyCanvasDraftOperations(
      current.document ?? document,
      operations.map((operation) => operation.payload),
    );
    const validationError = validateCanvasSnapshotDocument(resultingDocument);
    if (validationError) return apiFailure("BAD_REQUEST", validationError, 400, context.requestId);
    const ownershipError = await validateSnapshotAssetOwnership({
      supabase: context.supabase,
      projectId: projectResult.project.id,
      userId: context.user.id,
      document: resultingDocument,
    });
    if (ownershipError) return apiFailure("BAD_REQUEST", ownershipError, 400, context.requestId);

    const committed = await commitProjectCanvasOperationBatch(admin, {
      actorUserId: context.user.id,
      projectId: projectResult.project.id,
      expectedRevision: baseRevision,
      batchId,
      clientId,
      baseSnapshotId,
      operations,
      cloudDocument: current.document ?? document,
      documentHash,
    });
    return apiSuccess({
      draft: committed.draft,
      batchId: committed.batchId,
      ackedOperationIds: committed.ackedOperationIds,
      rebased: committed.rebased,
    });
  } catch (error) {
    logger.error("project draft operation batch failed", {
      requestId: context.requestId,
      projectId: projectResult.project.id,
      userId: context.user.id,
      error,
    });
    if (error instanceof ProjectCanvasDraftEntityConflictError) {
      return apiFailure("DRAFT_ENTITY_CONFLICT", "Some canvas changes conflicted. A recovery copy was saved.", 409, context.requestId);
    }
    return apiFailure(
      getProjectCanvasDraftErrorCode(error, "DRAFT_SAVE_FAILED"),
      getProjectCanvasDraftErrorMessage(error, "Unable to save canvas operations."),
      getProjectCanvasDraftErrorStatus(error),
      context.requestId,
    );
  }
}
