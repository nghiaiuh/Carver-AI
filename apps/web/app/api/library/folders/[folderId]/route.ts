/*
 * Route: API thao tac tren mot folder cua preset library.
 * Thuoc: module canvas preset library.
 * Vai tro: cap nhat hoac xoa mot folder preset cu the.
 * Chuc nang:
 * - `PATCH`: doi ten folder.
 * - `DELETE`: xoa folder va toan bo asset ben trong.
 */

import { NextResponse } from "next/server";
import {
  buildLibraryFolderRecord,
  deleteLibraryFolder,
  renameLibraryFolder,
} from "@carver/storage";
import { getRequestContext } from "../../../_lib/auth";
import { apiFailure, badRequest, readJsonObject } from "../../../_lib/http";

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
  if (!title || title.length > 240) {
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
    const message = error instanceof Error ? error.message : "";
    if (/not found/i.test(message)) {
      return apiFailure("LIBRARY_FOLDER_NOT_FOUND", "Library folder not found.", 404, context.requestId);
    }
    return apiFailure("LIBRARY_FOLDER_UPDATE_FAILED", "Unable to rename the folder.", 500, context.requestId);
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
    return apiFailure("LIBRARY_FOLDER_DELETE_FAILED", "Unable to delete the folder.", 500, context.requestId);
  }
}
