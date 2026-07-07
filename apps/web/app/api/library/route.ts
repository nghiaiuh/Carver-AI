/*
 * Route: API preset library goc.
 * Thuoc: module canvas preset library.
 * Vai tro: tra ve toan bo thu vien preset cloud cua user dang dang nhap.
 * Chuc nang:
 * - `GET`: lay danh sach folder va asset de sidebar/flyout hien thi.
 */

import { NextResponse } from "next/server";
import { listLibrary } from "@carver/storage";
import { getRequestContext } from "../_lib/auth";
import { apiFailure } from "../_lib/http";
import { withGatewayLibraryFolderUrls } from "./_lib/libraryAssetUrls";

export async function GET(request: Request) {
  const context = await getRequestContext(request);
  if ("error" in context) {
    return context.error;
  }

  try {
    const library = await listLibrary(context.user.id);
    return NextResponse.json({
      ...library,
      folders: library.folders.map((folder) => withGatewayLibraryFolderUrls(request.url, folder)),
    });
  } catch (error) {
    return apiFailure(
      "LIBRARY_LOAD_FAILED",
      error instanceof Error ? error.message : "Unable to load the library.",
      500,
      context.requestId,
    );
  }
}
