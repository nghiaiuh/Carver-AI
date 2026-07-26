/*
 * Flow: Uploads generated images and persists linked asset rows.
 * 1. Store the generated image in R2.
 * 2. Create the matching assets row for project ownership and history.
 * 3. Return a web-friendly generated image payload.
 */

import type { PersistedGeneratedImage } from "@carver/shared";
import { createGeneratedAsset } from "../repositories/asset-repository";
import { getSupabaseAdmin } from "@carver/db/server";
import {
  extensionForMimeType,
  getR2Bucket,
  getR2ObjectBuffer,
  uploadR2Object,
} from "@carver/storage";

const slugifyFileBase = (value: string) =>
  value
    .replace(/\.[^.]+$/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "generated-concept";

type PersistedGeneratedAsset = {
  id: string;
  storage_path: string;
  mime_type: string | null;
  width: number | null;
  height: number | null;
  metadata: unknown;
};

export type PersistedGeneratedOutput = {
  assetId: string;
  generatedImage: PersistedGeneratedImage;
};

const imageMimeType = (value: string | null): "image/png" | "image/jpeg" | "image/webp" | null =>
  value === "image/png" || value === "image/jpeg" || value === "image/webp" ? value : null;

const generatedMetadata = (value: unknown) =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

/**
 * Provider calls are not transactional with R2 or Postgres. When an earlier
 * attempt persisted a deterministic output successfully but failed later in
 * the chat/job-status flow, reuse that verified output rather than paying for
 * another generation on BullMQ retry.
 */
export const findReusableGeneratedImageAsset = async (params: {
  jobId: string;
  projectId: string;
  ownerId: string;
}): Promise<PersistedGeneratedOutput | null> => {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("assets")
    .select("id, storage_path, mime_type, width, height, metadata")
    .eq("id", params.jobId)
    .eq("source_job_id", params.jobId)
    .eq("project_id", params.projectId)
    .eq("owner_id", params.ownerId)
    .eq("kind", "generated")
    .maybeSingle();

  if (error) {
    throw error;
  }
  if (!data?.storage_path) {
    return null;
  }

  const mimeType = imageMimeType(data.mime_type);
  if (!mimeType || !data.width || !data.height) {
    return null;
  }

  try {
    // Verify R2 object existence before trusting metadata left by a partial write.
    await getR2ObjectBuffer(data.storage_path);
  } catch {
    return null;
  }

  const metadata = generatedMetadata((data as PersistedGeneratedAsset).metadata);
  const title = typeof metadata.title === "string" && metadata.title.trim()
    ? metadata.title
    : "Generated concept";
  const prompt = typeof metadata.prompt === "string" ? metadata.prompt : "";
  const provider = typeof metadata.provider === "string" && metadata.provider.trim()
    ? metadata.provider
    : "carver-worker";

  return {
    assetId: data.id,
    generatedImage: {
      id: data.id,
      title,
      imageUrl: "",
      width: data.width,
      height: data.height,
      prompt,
      assetId: data.id,
      mimeType,
      provider,
    } satisfies PersistedGeneratedImage,
  };
};

export const persistGeneratedImageAsset = async (params: {
  jobId: string;
  projectId: string;
  ownerId: string;
  prompt: string;
  title: string;
  buffer: Buffer;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  width: number;
  height: number;
  provider: string;
}): Promise<PersistedGeneratedOutput> => {
  const assetId = params.jobId;
  const fileExtension = extensionForMimeType(params.mimeType);
  const storagePath = [
    "users",
    params.ownerId,
    "projects",
    params.projectId,
    "jobs",
    params.jobId,
    `${slugifyFileBase(params.title)}.${fileExtension}`,
  ].join("/");

  await uploadR2Object({
    key: storagePath,
    body: params.buffer,
    contentType: params.mimeType,
  });

  const asset = await createGeneratedAsset({
    assetId,
    projectId: params.projectId,
    ownerId: params.ownerId,
    storageBucket: getR2Bucket(),
    storagePath,
    mimeType: params.mimeType,
    width: params.width,
    height: params.height,
    sizeBytes: params.buffer.length,
    sourceJobId: params.jobId,
    metadata: {
      title: params.title,
      prompt: params.prompt,
      provider: params.provider,
    },
  });

  const generatedImage: PersistedGeneratedImage = {
    id: asset.id ?? assetId,
    title: params.title,
    imageUrl: "",
    width: params.width,
    height: params.height,
    prompt: params.prompt,
    assetId: asset.id,
    mimeType: params.mimeType,
    provider: params.provider,
  };

  return {
    assetId: asset.id,
    generatedImage,
  };
};
