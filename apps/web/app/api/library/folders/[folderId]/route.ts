import { NextResponse } from "next/server";
import { getRequestContext } from "../../../_lib/auth";
import { badRequest, readJsonObject } from "../../../_lib/http";
import {
  deleteLibraryFolder,
  renameLibraryFolder,
  buildLibraryFolderRecord,
} from "../../../../../lib/server/library";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ folderId: string }> },
) {
  const context = await getRequestContext(request);
  if ("error" in context) {
    return context.error;
  }

  const { folderId } = await params;
  if (!folderId) {
    return badRequest("folderId is required");
  }

  const body = await readJsonObject(request);
  const title = typeof body.title === "string" ? body.title.trim() : "";
  if (!title) {
    return badRequest("title is required");
  }

  try {
    const folder = await renameLibraryFolder({
      ownerId: context.user.id,
      folderId,
      title,
    });

    return NextResponse.json({ folder: buildLibraryFolderRecord(folder) });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to rename folder." },
      { status: 500 },
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ folderId: string }> },
) {
  const context = await getRequestContext(request);
  if ("error" in context) {
    return context.error;
  }

  const { folderId } = await params;
  if (!folderId) {
    return badRequest("folderId is required");
  }

  try {
    await deleteLibraryFolder({
      ownerId: context.user.id,
      folderId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to delete folder." },
      { status: 500 },
    );
  }
}
