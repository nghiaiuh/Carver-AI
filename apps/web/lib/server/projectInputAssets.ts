import "server-only";

import { randomUUID } from "node:crypto";
import sharp from "sharp";
import type { Database } from "@carver/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deleteR2Objects,
  extensionForMimeType,
  getR2Bucket,
  parseDataUrlImage,
  uploadR2Object,
} from "@carver/storage";

const slugify = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "image";

export async function persistTemporaryProjectImageAsset(params: {
  supabase: SupabaseClient<Database>;
  projectId: string;
  ownerId: string;
  requestId: string;
  label: string;
  dataUrl: string;
  kind?: Database["public"]["Tables"]["assets"]["Insert"]["kind"];
  metadata?: Record<string, unknown>;
}) {
  const source = parseDataUrlImage(params.dataUrl);
  const image = sharp(source.buffer, {
    failOn: "none",
    limitInputPixels: 40_000_000,
  }).rotate();
  const metadata = await image.metadata();
  if (!metadata.width || !metadata.height || metadata.width > 8_000 || metadata.height > 8_000) {
    throw new Error("Inline image dimensions are invalid.");
  }

  const buffer = await image.webp({ quality: 90 }).toBuffer();
  if (buffer.length === 0 || buffer.length > 8 * 1024 * 1024) {
    throw new Error("Inline image is too large after processing.");
  }
  const parsed = {
    buffer,
    mimeType: "image/webp" as const,
    sizeBytes: buffer.length,
    width: metadata.width,
    height: metadata.height,
  };
  const assetId = randomUUID();
  const fileExtension = extensionForMimeType(parsed.mimeType);
  const storagePath = [
    "users",
    params.ownerId,
    "projects",
    params.projectId,
    "temp-ai-inputs",
    params.requestId,
    `${slugify(params.label)}-${assetId}.${fileExtension}`,
  ].join("/");

  await uploadR2Object({
    key: storagePath,
    body: parsed.buffer,
    contentType: parsed.mimeType,
  });

  const { data, error } = await params.supabase
    .from("assets")
    .insert({
      id: assetId,
      project_id: params.projectId,
      owner_id: params.ownerId,
      kind: params.kind ?? "upload",
      storage_bucket: getR2Bucket(),
      storage_path: storagePath,
      mime_type: parsed.mimeType,
      width: parsed.width,
      height: parsed.height,
      size_bytes: parsed.sizeBytes,
      source_job_id: null,
      metadata: {
        temporary: true,
        temporaryPurpose: "ai-job-input",
        sourceLabel: params.label,
        ...params.metadata,
      } as never,
    })
    .select("id, mime_type, size_bytes")
    .single();

  if (error || !data) {
    await deleteR2Objects([storagePath]).catch(() => undefined);
    throw new Error(error?.message || "Unable to persist AI input asset.");
  }

  return {
    assetId: data.id,
    storagePath,
    mimeType: data.mime_type,
    sizeBytes: data.size_bytes,
  };
}

/** Best-effort cleanup for inputs that never become part of a durable job. */
export async function deletePersistedProjectImageAssets(params: {
  supabase: SupabaseClient<Database>;
  projectId: string;
  ownerId: string;
  assets: Array<{ assetId: string; storagePath: string }>;
}) {
  if (params.assets.length === 0) {
    return;
  }

  const ids = [...new Set(params.assets.map((asset) => asset.assetId))];
  const { error } = await params.supabase
    .from("assets")
    .delete()
    .eq("project_id", params.projectId)
    .eq("owner_id", params.ownerId)
    .in("id", ids);
  if (error) {
    throw new Error("Unable to remove temporary AI input metadata.");
  }

  await deleteR2Objects([...new Set(params.assets.map((asset) => asset.storagePath))]);
}
