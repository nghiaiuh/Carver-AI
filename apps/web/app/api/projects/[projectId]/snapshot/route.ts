import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@carver/db/server";
import {
  coerceCanvasSnapshotDocument,
  type CanvasSnapshotDocument,
} from "@carver/shared";
import { apiFailure, badRequest, readJsonObject, serverError } from "../../../_lib/http";
import { requireProjectOwner, requireRequestContext } from "../../../_lib/authz";
import { enforceRateLimit } from "../../../_lib/rateLimit";
import {
  loadCurrentProjectSnapshot,
  saveProjectSnapshot,
} from "../../../../../lib/server/snapshotService";
import {
  validateCanvasSnapshotDocument,
  validateSnapshotAssetOwnership,
} from "../../../../../lib/server/canvasSnapshotValidation";
import { resolveCanvasSnapshotAssetUrls } from "../../../../../lib/server/assetService";

const MAX_SNAPSHOT_REQUEST_BYTES = 5 * 1024 * 1024;

function snapshotValue(value: unknown): CanvasSnapshotDocument | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return coerceCanvasSnapshotDocument(value);
}

function snapshotReasonValue(value: unknown): "manual" | "close" | "job_checkpoint" | null {
  if (value === "manual" || value === "close" || value === "job_checkpoint") {
    return value;
  }

  return null;
}

function hasTransientCloseRefs(document: CanvasSnapshotDocument) {
  return document.graph.nodes.some((node) => {
    if (node.kind !== "presetGroup") {
      const hasStableImageSource = Boolean(
        node.sourceImage?.assetId ||
          node.sourceImage?.url ||
          node.imageUrl,
      );

      if (!hasStableImageSource) {
        return true;
      }
    }

    return (
      node.presetGroup?.children.some((child) =>
        !child.assetId && !child.sourceImage?.assetId && !child.sourceImage?.url && !child.imageSrc,
      ) ?? false
    );
  });
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
    return badRequest("projectId is required");
  }

  const projectResult = await requireProjectOwner(context, projectId);
  if ("error" in projectResult) {
    return projectResult.error;
  }

  try {
    const loaded = await loadCurrentProjectSnapshot(context.supabase, projectId);

    return NextResponse.json({
      success: true,
      data: {
        projectId,
        document: await resolveCanvasSnapshotAssetUrls({
          requestUrl: request.url,
          document: loaded.document,
          supabase: context.supabase,
          userId: context.user.id,
          projectId,
        }),
        snapshot: loaded.snapshot,
      },
    });
  } catch {
    return serverError();
  }
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
    return badRequest("projectId is required");
  }

  const projectResult = await requireProjectOwner(context, projectId);
  if ("error" in projectResult) {
    return projectResult.error;
  }

  const rateLimit = await enforceRateLimit(context, {
    // A snapshot creates an immutable version, equivalent in cost to draft finalization.
    scope: "project-draft-finalize",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rateLimit.ok) {
    return rateLimit.response;
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_SNAPSHOT_REQUEST_BYTES) {
    return apiFailure("PAYLOAD_TOO_LARGE", "Canvas snapshot is too large.", 413, context.requestId);
  }

  const body = await readJsonObject(request);
  const snapshot = snapshotValue(body.snapshot ?? body.document);
  if (!snapshot) {
    return badRequest("snapshot is required");
  }

  const reason = snapshotReasonValue(body.reason) ?? "manual";
  const documentHash = typeof body.documentHash === "string" ? body.documentHash.trim() : "";
  if (documentHash && (documentHash.length < 32 || documentHash.length > 128)) {
    return apiFailure("BAD_REQUEST", "documentHash is invalid", 400, context.requestId);
  }
  const validationError = validateCanvasSnapshotDocument(snapshot);
  if (validationError) {
    return badRequest(validationError);
  }

  if (reason === "close" && hasTransientCloseRefs(snapshot)) {
    return badRequest("Close save requires all canvas images to use stable persisted asset references.");
  }

  const ownershipError = await validateSnapshotAssetOwnership({
    supabase: context.supabase,
    projectId: projectResult.project.id,
    userId: context.user.id,
    document: snapshot,
  });
  if (ownershipError) {
    return badRequest(ownershipError);
  }

  try {
    const savedSnapshot = await saveProjectSnapshot(getSupabaseAdmin(), {
      actorUserId: context.user.id,
      projectId: projectResult.project.id,
      snapshot,
      reason,
      documentHash: documentHash || null,
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          projectId: projectResult.project.id,
          snapshot: savedSnapshot,
          document: snapshot,
        },
      },
      { status: 201 },
    );
  } catch {
    return serverError();
  }
}
