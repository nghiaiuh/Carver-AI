import {
  coerceCanvasSnapshotDocument,
  isCanvasSnapshotDocument,
  type CanvasSnapshotDocument,
} from "@carver/shared";
import { apiFailure, apiSuccess, readJsonObject } from "../../_lib/http";
import { isUuidLike, requireProjectOwner, requireRequestContext } from "../../_lib/authz";
import {
  ProjectCanvasDraftConflictError,
  getProjectCanvasDraftErrorCode,
  getProjectCanvasDraftErrorMessage,
  getProjectCanvasDraftErrorStatus,
  loadProjectCanvasDraft,
  saveProjectCanvasDraft,
} from "../../../../lib/server/draftService";
import {
  validateCanvasSnapshotDocument,
  validateSnapshotAssetOwnership,
} from "../../../../lib/server/canvasSnapshotValidation";
import { resolveCanvasSnapshotAssetUrls } from "../../../../lib/server/assetService";
import { createSafeLogger } from "@carver/shared";
import { getSupabaseAdmin } from "@carver/db/server";
import { enforceRateLimit } from "../../_lib/rateLimit";

const logger = createSafeLogger("web.project-drafts");
const MAX_DRAFT_REQUEST_BYTES = 5 * 1024 * 1024;

type DraftRouteResponse = {
  projectId: string;
  document: CanvasSnapshotDocument | null;
  assetDeliveryWarning?: string;
  draft: {
    projectId: string;
    ownerId: string;
    baseSnapshotId: string | null;
    revision: number;
    documentHash: string | null;
    lastMutationId: string | null;
    updatedAt: string;
  } | null;
};

function documentValue(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  // A malformed autosave payload must fail closed. Coercing arbitrary input to
  // an empty document here could overwrite a valid cloud draft after a client bug.
  if (!isCanvasSnapshotDocument(value)) {
    return null;
  }

  return coerceCanvasSnapshotDocument(value);
}

function revisionValue(value: unknown) {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

export async function GET(
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

  try {
    const loaded = await loadProjectCanvasDraft(context.supabase, projectResult.project.id);
    let document = loaded.document;
    let assetDeliveryWarning: string | undefined;

    if (document) {
      try {
        document = await resolveCanvasSnapshotAssetUrls({
          requestUrl: request.url,
          document,
          supabase: context.supabase,
          userId: context.user.id,
          projectId: projectResult.project.id,
        });
      } catch (error) {
        // Asset delivery URLs are runtime decoration. The durable graph must
        // still be restored when an asset refresh has a temporary failure.
        logger.warn("project draft asset resolution failed", {
          requestId: context.requestId,
          projectId: projectResult.project.id,
          userId: context.user.id,
          error,
        });
        assetDeliveryWarning = "Some canvas images could not be refreshed yet.";
      }
    }

    return apiSuccess<DraftRouteResponse>({
      projectId: projectResult.project.id,
      document,
      assetDeliveryWarning,
      draft: loaded.draft,
    });
  } catch (error) {
    logger.error("project draft load failed", {
      requestId: context.requestId,
      projectId: projectResult.project.id,
      userId: context.user.id,
      error,
    });

    return apiFailure(
      getProjectCanvasDraftErrorCode(error, "DRAFT_LOAD_FAILED"),
      getProjectCanvasDraftErrorMessage(error, "Unable to load the project draft"),
      getProjectCanvasDraftErrorStatus(error),
      context.requestId,
    );
  }
}

export async function PUT(
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
    scope: "project-draft-save",
    limit: 120,
    windowMs: 60_000,
  });
  if (!rateLimit.ok) {
    return rateLimit.response;
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_DRAFT_REQUEST_BYTES) {
    return apiFailure("PAYLOAD_TOO_LARGE", "Canvas draft is too large.", 413, context.requestId);
  }

  const body = await readJsonObject(request);
  const document = documentValue(body.document ?? body.snapshot);
  if (!document) {
    return apiFailure("BAD_REQUEST", "document is required", 400, context.requestId);
  }

  const validationError = validateCanvasSnapshotDocument(document);
  if (validationError) {
    return apiFailure("BAD_REQUEST", validationError, 400, context.requestId);
  }

  const ownershipError = await validateSnapshotAssetOwnership({
    supabase: context.supabase,
    projectId: projectResult.project.id,
    userId: context.user.id,
    document,
  });
  if (ownershipError) {
    return apiFailure("BAD_REQUEST", ownershipError, 400, context.requestId);
  }

  const expectedRevision = revisionValue(body.expectedRevision);
  const documentHash =
    typeof body.documentHash === "string" && body.documentHash.trim()
      ? body.documentHash.trim()
      : null;
  const isCanvasFingerprint = /^fnv1a-[0-9a-f]{1,8}$/i.test(documentHash ?? "");
  if (
    documentHash &&
    !isCanvasFingerprint &&
    (documentHash.length < 32 || documentHash.length > 128)
  ) {
    return apiFailure("BAD_REQUEST", "documentHash is invalid", 400, context.requestId);
  }
  const mutationId =
    typeof body.mutationId === "string" && body.mutationId.trim()
      ? body.mutationId.trim()
      : null;
  if (mutationId && mutationId.length > 128) {
    return apiFailure("BAD_REQUEST", "mutationId is invalid", 400, context.requestId);
  }
  const baseSnapshotId =
    typeof body.baseSnapshotId === "string" && body.baseSnapshotId.trim()
      ? body.baseSnapshotId.trim()
      : null;
  if (baseSnapshotId && !isUuidLike(baseSnapshotId)) {
    return apiFailure("BAD_REQUEST", "baseSnapshotId is invalid", 400, context.requestId);
  }

  try {
    const savedDraft = await saveProjectCanvasDraft(getSupabaseAdmin(), {
      actorUserId: context.user.id,
      projectId: projectResult.project.id,
      expectedRevision,
      document,
      documentHash,
      lastMutationId: mutationId,
      baseSnapshotId,
    });

    return apiSuccess<DraftRouteResponse>({
      projectId: projectResult.project.id,
      document: null,
      draft: savedDraft,
    });
  } catch (error) {
    logger.error("project draft save failed", {
      requestId: context.requestId,
      projectId: projectResult.project.id,
      userId: context.user.id,
      error,
    });

    return apiFailure(
      getProjectCanvasDraftErrorCode(error, "DRAFT_SAVE_FAILED"),
      getProjectCanvasDraftErrorMessage(error, "Unable to save the project draft"),
      getProjectCanvasDraftErrorStatus(error),
      context.requestId,
    );
  }
}
