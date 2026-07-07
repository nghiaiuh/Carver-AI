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
} from "../../../../../lib/server/projectCanvasSnapshots";

function snapshotValue(value: unknown): CanvasSnapshotDocument | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return coerceCanvasSnapshotDocument(value);
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
        document: loaded.document,
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

  try {
    const savedSnapshot = await saveProjectSnapshot(context.supabase, {
      projectId: projectResult.project.id,
      snapshot,
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
