/*
 * Route: API upload asset vao mot folder cua preset library.
 * Thuoc: module canvas preset library.
 * Vai tro: nhan file anh tu client, resize thanh nhieu version va luu len cloud.
 * Chuc nang:
 * - `POST`: upload anh vao folder, tao `thumb` / `preview` / `original`,
 *   sau do luu metadata va URL vao Supabase.
 */

import {
  buildLibraryAssetRecord,
  type LibraryUploadInputFile,
  uploadLibraryAssets,
} from "@carver/storage";
import { createSafeLogger } from "@carver/shared";
import { getRequestContext } from "../../../../_lib/auth";
import { isUuidLike } from "../../../../_lib/authz";
import { apiFailure, apiSuccess, badRequest } from "../../../../_lib/http";
import { enforceRateLimit } from "../../../../_lib/rateLimit";
import { withGatewayLibraryAssetUrls } from "../../../_lib/libraryAssetUrls";

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const MAX_UPLOAD_TOTAL_BYTES = 24 * 1024 * 1024;
const MAX_UPLOAD_FILE_COUNT = 5;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const logger = createSafeLogger("web.library-upload");

function isKnownUploadValidationMessage(message: string) {
  return (
    message === "Unsupported file type." ||
    message === "Upload file is too large." ||
    message === "File content does not match the declared image type."
  );
}

function hasAllowedMagicBytes(buffer: Buffer, mimeType: string) {
  if (mimeType === "image/jpeg") {
    return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  if (mimeType === "image/png") {
    return buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }

  if (mimeType === "image/webp") {
    return (
      buffer.length > 12 &&
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }

  return false;
}

async function validateUploadFile(file: File): Promise<LibraryUploadInputFile> {
  if (!ALLOWED_MIME_TYPES.has(file.type)) {
    throw new Error("Unsupported file type.");
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("Upload file is too large.");
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!hasAllowedMagicBytes(bytes, file.type)) {
    throw new Error("File content does not match the declared image type.");
  }

  return {
    name: file.name,
    type: file.type,
    bytes,
  };
}

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
  if (!isUuidLike(folderId)) {
    return badRequest("folderId is invalid");
  }

  const rateLimit = await enforceRateLimit(context, {
    scope: "library-upload",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rateLimit.ok) {
    return rateLimit.response;
  }

  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_TOTAL_BYTES + 256 * 1024) {
    return apiFailure("UPLOAD_TOO_LARGE", "Upload is too large.", 413, context.requestId);
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
    .filter((item): item is File => item instanceof File && item.size > 0);

  if (files.length === 0) {
    return badRequest("files are required");
  }

  if (files.length > MAX_UPLOAD_FILE_COUNT) {
    return apiFailure("UPLOAD_TOO_MANY_FILES", "Too many files in one upload.", 400, context.requestId);
  }

  if (files.reduce((total, file) => total + file.size, 0) > MAX_UPLOAD_TOTAL_BYTES) {
    return apiFailure("UPLOAD_TOO_LARGE", "Upload is too large.", 413, context.requestId);
  }

  const title = typeof rawTitle === "string" ? rawTitle.trim().slice(0, 240) : undefined;
  const prompt = typeof rawPrompt === "string" ? rawPrompt.trim().slice(0, 12_000) : undefined;
  const category = typeof rawCategory === "string" ? rawCategory.trim().slice(0, 240) : undefined;
  const sourceType =
    rawSourceType === "ai-chat" || rawSourceType === "manual" || rawSourceType === "upload"
      ? (rawSourceType as "ai-chat" | "manual" | "upload")
      : "upload";

  try {
    const uploadFiles: LibraryUploadInputFile[] = await Promise.all(files.map(validateUploadFile));

    const assets = await uploadLibraryAssets({
      ownerId: context.user.id,
      folderId,
      files: uploadFiles,
      title,
      prompt,
      category,
      tags: parseTags(formData.get("tags")),
      sourceType,
    });

    return apiSuccess(
      {
        assets: await Promise.all(
          assets
            .map((asset) => buildLibraryAssetRecord(asset))
            .map((asset) =>
              withGatewayLibraryAssetUrls({
                requestUrl: request.url,
                asset,
                supabase: context.supabase,
                userId: context.user.id,
              }),
            ),
        ),
      },
      { status: 201 },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "Upload file is too large.") {
      return apiFailure("UPLOAD_TOO_LARGE", "Upload is too large.", 413, context.requestId);
    }
    if (isKnownUploadValidationMessage(message)) {
      return apiFailure("UNSUPPORTED_FILE_TYPE", "One or more files are invalid.", 400, context.requestId);
    }
    logger.error("library image upload failed", {
      requestId: context.requestId,
      userId: context.user.id,
      folderId,
      fileCount: files.length,
      error,
    });
    return apiFailure("UPLOAD_FAILED", "Unable to upload images.", 500, context.requestId);
  }
}
