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
import { getRequestContext } from "../../_lib/auth";
import { syncLibraryFromBucket } from "../../../../lib/server/librarySync";

export async function POST(request: Request) {
  const context = await getRequestContext(request);
  if ("error" in context) {
    return context.error;
  }

  try {
    const body = await request.json().catch(() => ({}));
    const sourcePrefix = typeof body.sourcePrefix === "string" ? body.sourcePrefix : undefined;

    const result = await syncLibraryFromBucket({
      ownerId: context.user.id,
      sourcePrefix,
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to sync the library." },
      { status: 500 },
    );
  }
}
