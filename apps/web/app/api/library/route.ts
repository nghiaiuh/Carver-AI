/*
 * Route: API preset library goc.
 * Thuoc: module canvas preset library.
 * Vai tro: tra ve toan bo thu vien preset cloud cua user dang dang nhap.
 * Chuc nang:
 * - `GET`: lay danh sach folder va asset de sidebar/flyout hien thi.
 */

import { NextResponse } from "next/server";
import { getRequestContext } from "../_lib/auth";
import { listLibrary } from "../../../lib/server/library";

export async function GET(request: Request) {
  const context = await getRequestContext(request);
  if ("error" in context) {
    return context.error;
  }

  try {
    const library = await listLibrary(context.user.id);
    return NextResponse.json(library);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load the library." },
      { status: 500 },
    );
  }
}
