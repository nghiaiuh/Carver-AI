/*
 * Route: API upload asset vao mot folder cua preset library.
 * Thuoc: module canvas preset library.
 * Vai tro: nhan file anh tu client, resize thanh nhieu version va luu len cloud.
 * Chuc nang:
 * - `POST`: upload anh vao folder, tao `thumb` / `preview` / `original`,
 *   sau do luu metadata va URL vao Supabase.
 */

import { NextResponse } from "next/server";
import { getRequestContext } from "../../../../_lib/auth";
import { badRequest } from "../../../../_lib/http";
import { buildLibraryAssetRecord, uploadLibraryAssets } from "../../../../../../lib/server/library";

function parseTags(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || !value.trim()) return [];

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return [];
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ folderId: string }> },
) {
  const context = await getRequestContext(request);
  if ("error" in context) {
    return context.error;
  }

  const { folderId } = await params;
  if (!folderId) {
    return badRequest("folderId is required");
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return badRequest("files are required");
  }

  const rawTitle = formData.get("title");
  const rawPrompt = formData.get("prompt");
  const rawCategory = formData.get("category");
  const rawSourceType = formData.get("sourceType");

  const files = formData
    .getAll("files")
    .filter((item): item is File => item instanceof File && item.size > 0 && item.type.startsWith("image/"));

  if (files.length === 0) {
    return badRequest("files are required");
  }

  const title = typeof rawTitle === "string" ? rawTitle.trim() : undefined;
  const prompt = typeof rawPrompt === "string" ? rawPrompt.trim() : undefined;
  const category = typeof rawCategory === "string" ? rawCategory.trim() : undefined;
  const sourceType =
    rawSourceType === "ai-chat" || rawSourceType === "manual" || rawSourceType === "upload"
      ? (rawSourceType as "ai-chat" | "manual" | "upload")
      : "upload";

  try {
    const assets = await uploadLibraryAssets({
      ownerId: context.user.id,
      folderId,
      files,
      title,
      prompt,
      category,
      tags: parseTags(formData.get("tags")),
      sourceType,
    });

    return NextResponse.json({ assets: assets.map((asset) => buildLibraryAssetRecord(asset)) }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to upload images." },
      { status: 500 },
    );
  }
}
