import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";
import type { Database } from "@carver/db";
import type { SupabaseClient } from "@supabase/supabase-js";
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
  const secret = process.env.ASSET_GATEWAY_SIGNING_SECRET;
  if (!secret) {
    throw new Error("Missing ASSET_GATEWAY_SIGNING_SECRET.");
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

export type AssetDeliveryUrls = {
  thumbUrl: string;
  previewUrl: string;
  originalUrl: string;
  expiresAt: string;
};

type OwnedAssetUrlParams = {
  requestUrl: string;
  supabase: SupabaseClient<Database>;
  userId: string;
  projectId?: string;
  assetIds: Iterable<string | null | undefined>;
};

const uniqueAssetIds = (assetIds: Iterable<string | null | undefined>) =>
  [...new Set([...assetIds].filter((assetId): assetId is string => Boolean(assetId && /^[0-9a-f-]{36}$/i.test(assetId))))]
    .slice(0, 200);

/**
 * Mint runtime URLs only after the metadata row proves ownership. JSON embedded
 * in snapshots, chat messages, and job results is untrusted until this lookup.
 */
export async function resolveOwnedAssetUrls(params: OwnedAssetUrlParams) {
  const assetIds = uniqueAssetIds(params.assetIds);
  const resolved = new Map<string, AssetDeliveryUrls>();
  if (assetIds.length === 0) {
    return resolved;
  }

  let projectAssetsQuery = params.supabase
    .from("assets")
    .select("id")
    .eq("owner_id", params.userId)
    .in("id", assetIds);

  if (params.projectId) {
    projectAssetsQuery = projectAssetsQuery.eq("project_id", params.projectId);
  }

  const [{ data: projectAssets, error: projectAssetsError }, { data: libraryAssets, error: libraryAssetsError }] =
    await Promise.all([
      projectAssetsQuery,
      params.supabase
        .from("library_assets")
        .select("id")
        .eq("owner_id", params.userId)
        .in("id", assetIds),
    ]);

  if (projectAssetsError || libraryAssetsError) {
    throw new Error("Unable to verify asset ownership.");
  }

  const ownedIds = new Set([
    ...(projectAssets ?? []).map((asset) => asset.id),
    ...(libraryAssets ?? []).map((asset) => asset.id),
  ]);

  for (const assetId of ownedIds) {
    const thumb = buildAssetContentUrl(params.requestUrl, { assetId, variant: "thumb" });
    const preview = buildAssetContentUrl(params.requestUrl, { assetId, variant: "preview" });
    const original = buildAssetContentUrl(params.requestUrl, { assetId, variant: "original" });
    resolved.set(assetId, {
      thumbUrl: thumb.url,
      previewUrl: preview.url,
      originalUrl: original.url,
      expiresAt: original.expiresAt,
    });
  }

  return resolved;
}

export function extractAssetIdFromGatewayUrl(value: string | undefined) {
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

export async function resolveCanvasSnapshotAssetUrls(params: {
  requestUrl: string;
  document: CanvasSnapshotDocument;
  supabase: SupabaseClient<Database>;
  userId: string;
  projectId: string;
}): Promise<CanvasSnapshotDocument> {
  const { document } = params;
  // Legacy snapshots may only contain an older gateway URL. Recover its stable
  // asset reference before resolving fresh, short-lived delivery URLs.
  const assetIds = document.graph.nodes.flatMap((node) => [
    (node as MaybeAssetRef).assetId,
    extractAssetIdFromGatewayUrl((node as MaybeAssetRef).imageUrl),
    node.sourceImage?.assetId,
    extractAssetIdFromGatewayUrl(node.sourceImage?.url),
    ...(node.presetGroup?.children.flatMap((child) => [
      child.assetId,
      extractAssetIdFromGatewayUrl(child.imageSrc),
      child.sourceImage?.assetId,
      extractAssetIdFromGatewayUrl(child.sourceImage?.url),
    ]) ?? []),
  ]);
  const resolvedUrls = await resolveOwnedAssetUrls({ ...params, assetIds });

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
          extractAssetIdFromGatewayUrl(node.sourceImage?.url) ??
          nodeAssetId;
        const nextNode = {
          ...node,
          imageUrl: nodeAssetId
            ? (resolvedUrls.get(nodeAssetId)?.originalUrl ?? "")
            : sourceAssetId
              ? (resolvedUrls.get(sourceAssetId)?.originalUrl ?? "")
              : node.imageUrl,
          sourceImage: node.sourceImage
            ? {
                ...node.sourceImage,
                assetId: sourceAssetId,
                url: sourceAssetId
                  ? (resolvedUrls.get(sourceAssetId)?.originalUrl ?? "")
                  : node.sourceImage.url,
              }
            : sourceAssetId
              ? {
                  assetId: sourceAssetId,
                  url: resolvedUrls.get(sourceAssetId)?.originalUrl ?? "",
                  quality: "original" as const,
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
                imageSrc: childAssetId
                  ? (resolvedUrls.get(childAssetId)?.originalUrl ?? "")
                  : childSourceAssetId
                    ? (resolvedUrls.get(childSourceAssetId)?.originalUrl ?? "")
                    : child.imageSrc,
                sourceImage: child.sourceImage
                  ? {
                      ...child.sourceImage,
                      assetId: childSourceAssetId,
                      url: childSourceAssetId
                        ? (resolvedUrls.get(childSourceAssetId)?.originalUrl ?? "")
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

export async function resolveAiJobResultAssetUrls(params: {
  requestUrl: string;
  result: CarverAiJobResult | null;
  jobStatus?: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "enqueue_failed";
  supabase: SupabaseClient<Database>;
  userId: string;
  projectId: string;
}): Promise<CarverAiJobResult | null> {
  const { result, jobStatus } = params;
  if (!result) {
    return null;
  }

  if (jobStatus && jobStatus !== "succeeded") {
    return result;
  }

  const assetIds = [
    ...result.generatedImages.map((image) => image.assetId),
    ...(result.assistantMessage?.generatedImages.map((image) => image.assetId) ?? []),
  ];
  const resolvedUrls = await resolveOwnedAssetUrls({ ...params, assetIds });

  const resolveImage = <T extends { assetId?: string; imageUrl: string }>(image: T): T => {
    if (!image.assetId) {
      return image;
    }
    const signed = resolvedUrls.get(image.assetId);
    if (!signed) {
      return { ...image, imageUrl: "" };
    }

    return {
      ...image,
      imageUrl: signed.originalUrl,
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

export async function resolveProjectChatMessageAssetUrls(params: {
  requestUrl: string;
  messages: ProjectChatHistoryRecord[];
  supabase: SupabaseClient<Database>;
  userId: string;
  projectId: string;
}): Promise<ProjectChatHistoryRecord[]> {
  const { messages } = params;
  const assetIds = messages.flatMap((message) => message.generatedImages?.map((image) => image.assetId) ?? []);
  const resolvedUrls = await resolveOwnedAssetUrls({ ...params, assetIds });

  return messages.map((message) => ({
    ...message,
    generatedImages: message.generatedImages?.map((image) => {
      if (!image.assetId) {
        return image;
      }

      const signed = resolvedUrls.get(image.assetId);
      if (!signed) {
        return { ...image, imageUrl: "" };
      }

      return {
        ...image,
        imageUrl: signed.originalUrl,
        expiresAt: signed.expiresAt,
      };
    }),
  }));
}
