import "server-only";

import type { CarverAiJobResult } from "@carver/shared";
import { buildAssetContentUrl } from "./assetDelivery";

export function resolveAiJobResultAssetUrls(
  requestUrl: string,
  result: CarverAiJobResult | null,
): CarverAiJobResult | null {
  if (!result) {
    return null;
  }

  const resolveImage = <T extends { assetId?: string; imageUrl: string }>(image: T): T => {
    if (!image.assetId) {
      return image;
    }

    return {
      ...image,
      imageUrl: buildAssetContentUrl(requestUrl, {
        assetId: image.assetId,
        variant: "original",
      }).url,
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
