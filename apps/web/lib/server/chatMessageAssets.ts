import "server-only";

import type { ProjectChatHistoryRecord } from "./projectChatHistory";
import { buildAssetContentUrl } from "./assetDelivery";

export function resolveProjectChatMessageAssetUrls(
  requestUrl: string,
  messages: ProjectChatHistoryRecord[],
): ProjectChatHistoryRecord[] {
  return messages.map((message) => ({
    ...message,
    generatedImages: message.generatedImages?.map((image) => {
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
    }),
  }));
}
