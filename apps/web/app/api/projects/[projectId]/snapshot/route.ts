import { NextResponse } from "next/server";
import {
  coerceCanvasSnapshotDocument,
  type CanvasSnapshotDocument,
} from "@carver/shared";
import { badRequest, readJsonObject, serverError } from "../../../_lib/http";
import { requireProjectOwner, requireRequestContext } from "../../../_lib/authz";
import {
  loadCurrentProjectSnapshot,
  saveProjectSnapshot,
} from "../../../../../lib/server/snapshotService";
import {
  validateCanvasSnapshotDocument,
  validateSnapshotAssetOwnership,
} from "../../../../../lib/server/canvasSnapshotValidation";
import { resolveCanvasSnapshotAssetUrls } from "../../../../../lib/server/assetService";

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
        document: resolveCanvasSnapshotAssetUrls(request.url, loaded.document),
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

  const body = await readJsonObject(request);
  const snapshot = snapshotValue(body.snapshot ?? body.document);
  if (!snapshot) {
    return badRequest("snapshot is required");
  }

  const reason = snapshotReasonValue(body.reason) ?? "manual";
  const documentHash = typeof body.documentHash === "string" ? body.documentHash.trim() : "";
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
    const savedSnapshot = await saveProjectSnapshot(context.supabase, {
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
