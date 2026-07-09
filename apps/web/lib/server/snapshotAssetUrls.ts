import "server-only";

import type { CanvasSnapshotDocument } from "@carver/shared";
import { buildAssetContentUrl } from "./assetDelivery";

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
