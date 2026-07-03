/*
 * Flow: Uploads generated images and persists linked asset rows.
 * 1. Store the generated image in R2.
 * 2. Create the matching assets row for project ownership and history.
 * 3. Return a web-friendly generated image payload.
 */

import { randomUUID } from "node:crypto";
import type { GeneratedCanvasImage } from "@carver/shared";
import { createGeneratedAsset } from "../repositories/asset-repository";
import { createR2ObjectKey, getR2Bucket, uploadR2Object } from "@carver/storage";

export const persistGeneratedImageAsset = async (params: {
  jobId: string;
  projectId: string;
  ownerId: string;
  prompt: string;
  title: string;
  buffer: Buffer;
  mimeType: "image/png";
  width: number;
  height: number;
  provider: string;
}) => {
  const assetId = randomUUID();
  const storagePath = createR2ObjectKey(
    [params.ownerId, "projects", params.projectId, "generated", params.jobId],
    `${params.title || "generated-concept"}.png`,
  );
  const imageUrl = await uploadR2Object({
    key: storagePath,
    body: params.buffer,
    contentType: params.mimeType,
  });

  const asset = await createGeneratedAsset({
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
      imageUrl,
    },
  });

  const generatedImage: GeneratedCanvasImage = {
    id: asset.id ?? assetId,
    title: params.title,
    imageUrl,
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
