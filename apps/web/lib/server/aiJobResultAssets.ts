import "server-only";

import type { CarverAiJobResult } from "@carver/shared";
import { buildAssetContentUrl } from "./assetDelivery";

export function resolveAiJobResultAssetUrls(
  requestUrl: string,
  result: CarverAiJobResult | null,
  jobStatus?: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "enqueue_failed",
): CarverAiJobResult | null {
  if (!result) {
    return null;
  }

  if (jobStatus && jobStatus !== "succeeded") {
    return result;
  }

  const resolveImage = <T extends { assetId?: string; imageUrl: string }>(image: T): T => {
    if (!image.assetId) {
      return image;
    }

    const signed = buildAssetContentUrl(requestUrl, {
      assetId: image.assetId,
      variant: "original",
    });

    return {
      ...image,
      imageUrl: signed.url,
      expiresAt: signed.expiresAt,
    };
  };

  return {
    ...result,
    generatedImages: result.generatedImages.map(resolveImage),
    assistantMessage: result.assistantMessage
      ? {
          ...result.assistantMessage,
          generatedImages: result.assistantMessage.generatedImages.map(resolveImage),
        }
      : null,
  };
}
