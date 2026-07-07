import "server-only";

import type { CanvasSnapshotDocument } from "@carver/shared";
import { buildAssetContentUrl } from "./assetDelivery";

type MaybeAssetRef = {
  assetId?: string;
};

function resolveAssetUrl(requestUrl: string, assetId: string) {
  return buildAssetContentUrl(requestUrl, {
    assetId,
    variant: "original",
  }).url;
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
        const nodeAssetId = (node as MaybeAssetRef).assetId;
        const nextNode = {
          ...node,
          imageUrl: nodeAssetId ? resolveAssetUrl(requestUrl, nodeAssetId) : node.imageUrl,
          sourceImage: node.sourceImage
            ? {
                ...node.sourceImage,
                url: (node.sourceImage as MaybeAssetRef).assetId
                  ? resolveAssetUrl(requestUrl, (node.sourceImage as MaybeAssetRef).assetId!)
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
            children: node.presetGroup.children.map((child) => ({
              ...child,
              imageSrc: child.assetId ? resolveAssetUrl(requestUrl, child.assetId) : child.imageSrc,
              sourceImage: child.sourceImage
                ? {
                    ...child.sourceImage,
                    url: child.assetId ? resolveAssetUrl(requestUrl, child.assetId) : child.sourceImage.url,
                  }
                : undefined,
            })),
          },
        };
      }),
    },
  };
}
