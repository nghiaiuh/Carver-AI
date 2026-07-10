import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import type { CanvasSnapshotDocument, CarverAiJobResult } from "@carver/shared";
import type { ProjectChatHistoryRecord } from "./chatService";

export type AssetDeliveryVariant = "thumb" | "preview" | "original";

type MaybeAssetRef = {
  assetId?: string;
  imageUrl?: string;
  imageSrc?: string;
  url?: string;
  sourceImage?: {
    assetId?: string;
    url?: string;
  };
};

const DEFAULT_TTL_SECONDS = 15 * 60;
const VARIANTS = new Set<AssetDeliveryVariant>(["thumb", "preview", "original"]);

const getSigningSecret = () => {
  const secret = process.env.ASSET_GATEWAY_SIGNING_SECRET ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) {
    throw new Error("Missing ASSET_GATEWAY_SIGNING_SECRET or SUPABASE_SERVICE_ROLE_KEY.");
  }

  return secret;
};

const signPayload = (payload: string) =>
  createHmac("sha256", getSigningSecret()).update(payload).digest("base64url");

const buildPayload = (params: {
  assetId: string;
  variant: AssetDeliveryVariant;
  expiresAt: number;
}) => `${params.assetId}.${params.variant}.${params.expiresAt}`;

export const normalizeAssetDeliveryVariant = (value: string | null): AssetDeliveryVariant =>
  value && VARIANTS.has(value as AssetDeliveryVariant)
    ? (value as AssetDeliveryVariant)
    : "original";

export function createAssetDeliveryToken(params: {
  assetId: string;
  variant?: AssetDeliveryVariant;
  ttlSeconds?: number;
}) {
  const variant = params.variant ?? "original";
  const expiresAt = Math.floor(Date.now() / 1000) + (params.ttlSeconds ?? DEFAULT_TTL_SECONDS);
  const payload = buildPayload({
    assetId: params.assetId,
    variant,
    expiresAt,
  });

  return {
    expiresAt,
    token: signPayload(payload),
    variant,
  };
}

export function verifyAssetDeliveryToken(params: {
  assetId: string;
  variant: AssetDeliveryVariant;
  expiresAt: number;
  token: string;
}) {
  if (!Number.isFinite(params.expiresAt) || params.expiresAt < Math.floor(Date.now() / 1000)) {
    return false;
  }

  const expected = signPayload(buildPayload(params));
  const actualBuffer = Buffer.from(params.token);
  const expectedBuffer = Buffer.from(expected);

  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

export function buildAssetContentUrl(
  requestUrl: string,
  params: {
    assetId: string;
    variant?: AssetDeliveryVariant;
    ttlSeconds?: number;
  },
) {
  const signed = createAssetDeliveryToken(params);
  const url = new URL(`/api/assets/${params.assetId}/content`, requestUrl);
  url.searchParams.set("variant", signed.variant);
  url.searchParams.set("exp", String(signed.expiresAt));
  url.searchParams.set("token", signed.token);

  return {
    url: url.toString(),
    expiresAt: new Date(signed.expiresAt * 1000).toISOString(),
  };
}

function resolveAssetUrl(requestUrl: string, assetId: string) {
  return buildAssetContentUrl(requestUrl, {
    assetId,
    variant: "original",
  }).url;
}

function extractAssetIdFromGatewayUrl(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = new URL(value, "https://carver.local");
    const match = parsed.pathname.match(/^\/api\/assets\/([0-9a-f-]{36})\/content$/i);
    return match?.[1];
  } catch {
    return undefined;
  }
}

export function resolveCanvasSnapshotAssetUrls(
  requestUrl: string,
  document: CanvasSnapshotDocument,
): CanvasSnapshotDocument {
  return {
    ...document,
    graph: {
      ...document.graph,
      nodes: document.graph.nodes.map((node) => {
        const nodeAssetId =
          (node as MaybeAssetRef).assetId ??
          extractAssetIdFromGatewayUrl((node as MaybeAssetRef).imageUrl);
        const sourceAssetId =
          (node.sourceImage as MaybeAssetRef | undefined)?.assetId ??
          extractAssetIdFromGatewayUrl(node.sourceImage?.url);
        const nextNode = {
          ...node,
          imageUrl:
            nodeAssetId
              ? resolveAssetUrl(requestUrl, nodeAssetId)
              : sourceAssetId
                ? resolveAssetUrl(requestUrl, sourceAssetId)
                : node.imageUrl,
          sourceImage: node.sourceImage
            ? {
                ...node.sourceImage,
                url: sourceAssetId
                  ? resolveAssetUrl(requestUrl, sourceAssetId)
                  : node.sourceImage.url,
              }
            : undefined,
        };

        if (!node.presetGroup) {
          return nextNode;
        }

        return {
          ...nextNode,
          presetGroup: {
            ...node.presetGroup,
            children: node.presetGroup.children.map((child) => {
              const childAssetId =
                child.assetId ??
                extractAssetIdFromGatewayUrl(child.imageSrc) ??
                extractAssetIdFromGatewayUrl(child.sourceImage?.url);
              const childSourceAssetId =
                child.sourceImage?.assetId ??
                childAssetId ??
                extractAssetIdFromGatewayUrl(child.sourceImage?.url);

              return {
                ...child,
                assetId: childAssetId,
                imageSrc:
                  childAssetId
                    ? resolveAssetUrl(requestUrl, childAssetId)
                    : childSourceAssetId
                      ? resolveAssetUrl(requestUrl, childSourceAssetId)
                      : child.imageSrc,
                sourceImage: child.sourceImage
                  ? {
                      ...child.sourceImage,
                      assetId: childSourceAssetId,
                      url:
                        childSourceAssetId
                          ? resolveAssetUrl(requestUrl, childSourceAssetId)
                          : child.sourceImage.url,
                    }
                  : undefined,
              };
            }),
          },
        };
      }),
    },
  };
}

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
