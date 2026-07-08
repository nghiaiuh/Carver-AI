/*
 * Flow: Uploads generated images and persists linked asset rows.
 * 1. Store the generated image in R2.
 * 2. Create the matching assets row for project ownership and history.
 * 3. Return a web-friendly generated image payload.
 */

import type { GeneratedCanvasImage } from "@carver/shared";
import { createGeneratedAsset } from "../repositories/asset-repository";
import { extensionForMimeType, getR2Bucket, uploadR2Object } from "@carver/storage";

const slugifyFileBase = (value: string) =>
  value
    .replace(/\.[^.]+$/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "generated-concept";

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
}) => {
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

  const generatedImage: GeneratedCanvasImage = {
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
