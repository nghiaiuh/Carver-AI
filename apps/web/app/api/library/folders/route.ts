/*
 * Route: API folder goc cua preset library.
 * Thuoc: module canvas preset library.
 * Vai tro: tao moi nhom / folder de sap xep preset cloud cua user.
 * Chuc nang:
 * - `POST`: tao folder moi va tra ve metadata de client cap nhat sidebar.
 */

import { buildLibraryFolderRecord, createLibraryFolder } from "@carver/storage";
import { getRequestContext } from "../../_lib/auth";
import { apiFailure, apiSuccess, badRequest, readJsonObject } from "../../_lib/http";

export async function POST(request: Request) {
  const context = await getRequestContext(request);
  if ("error" in context) {
    return context.error;
  }

  const body = await readJsonObject(request);
  const title = typeof body.title === "string" ? body.title.trim() : "";

  if (!title || title.length > 240) {
    return badRequest("title is required");
  }

  try {
    const folder = await createLibraryFolder({
      ownerId: context.user.id,
      title,
      // Client callers cannot forge system/AI audit metadata.
      createdBy: "user",
    });

    return apiSuccess({ folder: buildLibraryFolderRecord(folder) }, { status: 201 });
  } catch {
    return apiFailure("LIBRARY_FOLDER_CREATE_FAILED", "Unable to create the folder.", 500, context.requestId);
  }
}
