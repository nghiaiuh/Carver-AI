/*
 * Route: API preset library goc.
 * Thuoc: module canvas preset library.
 * Vai tro: tra ve toan bo thu vien preset cloud cua user dang dang nhap.
 * Chuc nang:
 * - `GET`: lay danh sach folder va asset de sidebar/flyout hien thi.
 */

import { listLibrary } from "@carver/storage/library-metadata";
import { createSafeLogger } from "@carver/shared";
import { getRequestContext } from "../_lib/auth";
import { apiFailure, apiSuccess } from "../_lib/http";
import { withGatewayLibraryFolderUrls } from "./_lib/libraryAssetUrls";

const logger = createSafeLogger("web.library");

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
  } catch (error) {
    logger.error("library load failed", {
      requestId: context.requestId,
      userId: context.user.id,
      error,
    });
    return apiFailure(
      "LIBRARY_LOAD_FAILED",
      "Unable to load the library.",
      500,
      context.requestId,
    );
  }
}
