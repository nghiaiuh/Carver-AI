import {
  coerceCanvasSnapshotDocument,
  type CanvasSnapshotDocument,
} from "@carver/shared";
import { apiFailure, apiSuccess, readJsonObject } from "../../_lib/http";
import { requireProjectOwner, requireRequestContext } from "../../_lib/authz";
import {
  ProjectCanvasDraftConflictError,
  loadProjectCanvasDraft,
  saveProjectCanvasDraft,
} from "../../../../lib/server/draftService";
import {
  validateCanvasSnapshotDocument,
  validateSnapshotAssetOwnership,
} from "../../../../lib/server/canvasSnapshotValidation";
import { resolveCanvasSnapshotAssetUrls } from "../../../../lib/server/assetService";

type DraftRouteResponse = {
  projectId: string;
  document: CanvasSnapshotDocument | null;
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

    return apiSuccess<DraftRouteResponse>({
      projectId: projectResult.project.id,
      document: loaded.document
        ? resolveCanvasSnapshotAssetUrls(request.url, loaded.document)
        : null,
      draft: loaded.draft,
    });
  } catch {
    return apiFailure(
      "DRAFT_LOAD_FAILED",
      "Unable to load the project draft",
      500,
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
  const mutationId =
    typeof body.mutationId === "string" && body.mutationId.trim()
      ? body.mutationId.trim()
      : null;
  const baseSnapshotId =
    typeof body.baseSnapshotId === "string" && body.baseSnapshotId.trim()
      ? body.baseSnapshotId.trim()
      : null;

  try {
    const savedDraft = await saveProjectCanvasDraft(context.supabase, {
      projectId: projectResult.project.id,
      expectedRevision,
      document,
      documentHash,
      lastMutationId: mutationId,
      baseSnapshotId,
    });

    return apiSuccess<DraftRouteResponse>({
      projectId: projectResult.project.id,
      document: resolveCanvasSnapshotAssetUrls(request.url, document),
      draft: savedDraft,
    });
  } catch (error) {
    if (error instanceof ProjectCanvasDraftConflictError) {
      return apiFailure("DRAFT_CONFLICT", "The cloud draft changed in another tab or device.", 409, context.requestId);
    }

    return apiFailure(
      "DRAFT_SAVE_FAILED",
      "Unable to save the project draft",
      500,
      context.requestId,
    );
  }
}
