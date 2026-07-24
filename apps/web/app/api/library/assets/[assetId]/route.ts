/*
 * Route: API thao tac tren mot library asset.
 * Thuoc: module canvas preset library.
 * Vai tro: quan ly vong doi cua tung anh preset da luu tren cloud.
 * Chuc nang:
 * - `DELETE`: xoa asset metadata trong Supabase va xoa cac file lien quan tren R2.
 */

import { NextResponse } from "next/server";
import { deleteLibraryAsset } from "@carver/storage";
import { getRequestContext } from "../../../_lib/auth";
import { apiFailure, badRequest } from "../../../_lib/http";

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
    await deleteLibraryAsset({
      ownerId: context.user.id,
      assetId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (/not found/i.test(message)) {
      return apiFailure("LIBRARY_ASSET_NOT_FOUND", "Library asset not found.", 404, context.requestId);
    }
    return apiFailure("LIBRARY_ASSET_DELETE_FAILED", "Unable to delete the library asset.", 500, context.requestId);
  }
}
