/*
 * Route: API dong bo preset library tu R2 ve Supabase.
 * Thuoc: module canvas preset library.
 * Vai tro: quet anh co san trong bucket cua user, tao folder/asset metadata
 * trong Supabase de library hien thi duoc ngay.
 * Chuc nang:
 * - `POST`: sync cac object trong R2 theo prefix user hien tai, tao metadata
 *   thieu va tra ve library sau khi dong bo.
 */

import { NextResponse } from "next/server";
import { syncLibraryFromBucket } from "@carver/storage";
import { requireRequestContext } from "../../_lib/authz";
import { apiFailure } from "../../_lib/http";
import { checkRateLimit } from "../../_lib/rateLimit";

export async function POST(request: Request) {
  const context = await requireRequestContext(request);
  if ("error" in context) {
    return context.error;
  }

  const rateLimit = checkRateLimit({
    key: `library-sync:${context.user.id}`,
    limit: 3,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return apiFailure("RATE_LIMITED", "Too many library sync requests", 429, context.requestId);
  }

  try {
    const result = await syncLibraryFromBucket({
      ownerId: context.user.id,
    });
    return NextResponse.json(result);
  } catch (error) {
    return apiFailure(
      "LIBRARY_SYNC_FAILED",
      error instanceof Error ? error.message : "Unable to sync the library.",
      500,
      context.requestId,
    );
  }
}
