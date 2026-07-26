/*
 * Route: API thao tac tren mot library asset.
 * Thuoc: module canvas preset library.
 * Vai tro: quan ly vong doi cua tung anh preset da luu tren cloud.
 * Chuc nang:
 * - `DELETE`: xoa asset metadata trong Supabase va xoa cac file lien quan tren R2.
 */

import { deleteLibraryAsset } from "@carver/storage";
import { notifyOperationalAlert } from "@carver/shared";
import { getRequestContext } from "../../../_lib/auth";
import { apiFailure, apiSuccess, badRequest } from "../../../_lib/http";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const context = await getRequestContext(request);
  if ("error" in context) {
    return context.error;
  }

  const { assetId } = await params;
  if (!assetId) {
    return badRequest("assetId is required");
  }

  try {
    const result = await deleteLibraryAsset({
      ownerId: context.user.id,
      assetId,
    });

    if (result.r2CleanupPending) {
      void notifyOperationalAlert({
        event: "library_asset_r2_cleanup_pending",
        severity: "warning",
        cooldownKey: "library_asset_r2_cleanup_pending",
        metadata: { requestId: context.requestId, userId: context.user.id, assetId },
      });
    }

    return apiSuccess({ deleted: true, r2CleanupPending: result.r2CleanupPending });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/not found/i.test(message)) {
      return apiFailure("LIBRARY_ASSET_NOT_FOUND", "Library asset not found.", 404, context.requestId);
    }
    return apiFailure("LIBRARY_ASSET_DELETE_FAILED", "Unable to delete the library asset.", 500, context.requestId);
  }
}
