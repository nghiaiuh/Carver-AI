/*
 * Route: API folder goc cua preset library.
 * Thuoc: module canvas preset library.
 * Vai tro: tao moi nhom / folder de sap xep preset cloud cua user.
 * Chuc nang:
 * - `POST`: tao folder moi va tra ve metadata de client cap nhat sidebar.
 */

import { buildLibraryFolderRecord, createLibraryFolder } from "@carver/storage";
import { createSafeLogger } from "@carver/shared";
import { getRequestContext } from "../../_lib/auth";
import { apiFailure, apiSuccess, badRequest, readJsonObject } from "../../_lib/http";

const logger = createSafeLogger("web.library-folders");

function classifyLibraryFolderError(error: unknown) {
  if (!error || typeof error !== "object") {
    return "LIBRARY_FOLDER_CREATE_FAILED";
  }

  const maybeError = error as {
    code?: string;
    message?: string;
  };
  const message = maybeError.message ?? "";

  if (
    maybeError.code === "42P01" ||
    maybeError.code === "PGRST205" ||
    message.includes("library_folders") ||
    message.includes("schema cache")
  ) {
    return "LIBRARY_SCHEMA_ERROR";
  }

  if (maybeError.code === "42703" || message.includes("column")) {
    return "LIBRARY_SCHEMA_ERROR";
  }

  if (maybeError.code === "42501" || message.includes("permission denied")) {
    return "LIBRARY_PERMISSION_DENIED";
  }

  if (maybeError.code === "23505" || message.includes("duplicate key")) {
    return "LIBRARY_FOLDER_CONFLICT";
  }

  return "LIBRARY_FOLDER_CREATE_FAILED";
}

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
  } catch (error) {
    const errorCode = classifyLibraryFolderError(error);
    logger.error("library folder creation failed", {
      requestId: context.requestId,
      userId: context.user.id,
      errorCode,
      error,
    });
    return apiFailure(errorCode, "Unable to create the folder.", 500, context.requestId);
  }
}
