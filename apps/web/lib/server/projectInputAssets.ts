import "server-only";

import { randomUUID } from "node:crypto";
import type { Database } from "@carver/db";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
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
  const parsed = parseDataUrlImage(params.dataUrl);
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
      width: null,
      height: null,
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
    throw new Error(error?.message || "Unable to persist AI input asset.");
  }

  return {
    assetId: data.id,
    mimeType: data.mime_type,
    sizeBytes: data.size_bytes,
  };
}
