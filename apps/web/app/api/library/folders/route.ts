/*
 * Route: API folder goc cua preset library.
 * Thuoc: module canvas preset library.
 * Vai tro: tao moi nhom / folder de sap xep preset cloud cua user.
 * Chuc nang:
 * - `POST`: tao folder moi va tra ve metadata de client cap nhat sidebar.
 */

import { NextResponse } from "next/server";
import { buildLibraryFolderRecord, createLibraryFolder } from "@carver/storage";
import { getRequestContext } from "../../_lib/auth";
import { badRequest, readJsonObject } from "../../_lib/http";

export async function POST(request: Request) {
  const context = await getRequestContext(request);
  if ("error" in context) {
    return context.error;
  }

  const body = await readJsonObject(request);
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const createdBy = body.createdBy === "ai" ? "ai" : "user";

  if (!title) {
    return badRequest("title is required");
  }

  try {
    const folder = await createLibraryFolder({
      ownerId: context.user.id,
      title,
      createdBy,
    });

    return NextResponse.json({ folder: buildLibraryFolderRecord(folder) }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create folder." },
      { status: 500 },
    );
  }
}
