/*
 * Route: API preset library goc.
 * Thuoc: module canvas preset library.
 * Vai tro: tra ve toan bo thu vien preset cloud cua user dang dang nhap.
 * Chuc nang:
 * - `GET`: lay danh sach folder va asset de sidebar/flyout hien thi.
 */

import { listLibrary } from "@carver/storage";
import { getRequestContext } from "../_lib/auth";
import { apiFailure, apiSuccess } from "../_lib/http";
import { withGatewayLibraryFolderUrls } from "./_lib/libraryAssetUrls";

export async function GET(request: Request) {
  const context = await getRequestContext(request);
  if ("error" in context) {
    return context.error;
  }

  try {
    const library = await listLibrary(context.user.id);
    return apiSuccess({
      folders: await Promise.all(
        library.folders.map((folder) =>
          withGatewayLibraryFolderUrls({
            requestUrl: request.url,
            folder,
            supabase: context.supabase,
            userId: context.user.id,
          }),
        ),
      ),
    });
  } catch {
    return apiFailure(
      "LIBRARY_LOAD_FAILED",
      "Unable to load the library.",
      500,
      context.requestId,
    );
  }
}
