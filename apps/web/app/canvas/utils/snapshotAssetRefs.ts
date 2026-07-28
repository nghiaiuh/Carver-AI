import type { CanvasSnapshotDocument } from "@carver/shared";

type ResolvedAssetUrlMap = Record<
  string,
  {
    originalUrl?: string;
    previewUrl?: string;
    thumbUrl?: string;
    expiresAt?: string;
  }
>;

type MaybeAssetRef = {
  assetId?: string | null;
};

function extractAssetIdFromGatewayUrl(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = new URL(value, "https://carver.local");
    return parsed.pathname.match(/^\/api\/assets\/([0-9a-f-]{36})\/content$/i)?.[1];
  } catch {
    return undefined;
  }
}

export function collectSnapshotAssetIds(document: CanvasSnapshotDocument) {
  const assetIds = new Set<string>();

  const add = (assetId: string | undefined | null) => {
    if (typeof assetId === "string" && assetId.trim().length > 0) {
      assetIds.add(assetId.trim());
    }
  };

  add(document.backgroundAssetId);

  for (const object of document.objects) {
    add(object.assetId);
  }

  for (const region of document.regions) {
    add(region.maskAssetId);
  }

  for (const node of document.graph.nodes) {
    add((node as MaybeAssetRef).assetId);
    add(node.sourceImage?.assetId);
    add(extractAssetIdFromGatewayUrl(node.imageUrl));
    add(extractAssetIdFromGatewayUrl(node.sourceImage?.url));

    if (!node.presetGroup) {
      continue;
    }

    for (const child of node.presetGroup.children) {
      add(child.assetId);
      add(child.sourceImage?.assetId);
      add(extractAssetIdFromGatewayUrl(child.imageSrc));
      add(extractAssetIdFromGatewayUrl(child.sourceImage?.url));
    }
  }

  return [...assetIds];
}

export function applyResolvedAssetUrlsToSnapshot(
  document: CanvasSnapshotDocument,
  assets: ResolvedAssetUrlMap,
) {
  return {
    ...document,
    graph: {
      ...document.graph,
      nodes: document.graph.nodes.map((node) => {
        const nodeAssetId =
          (node as MaybeAssetRef).assetId ??
          node.sourceImage?.assetId ??
          extractAssetIdFromGatewayUrl(node.sourceImage?.url) ??
          extractAssetIdFromGatewayUrl(node.imageUrl);
        const resolvedNodeUrl = nodeAssetId ? assets[nodeAssetId]?.originalUrl : undefined;
        const nextNode = {
          ...node,
          imageUrl: resolvedNodeUrl ?? (nodeAssetId ? "" : node.imageUrl),
          sourceImage: node.sourceImage
            ? {
                ...node.sourceImage,
                assetId: nodeAssetId,
                url: resolvedNodeUrl ?? (nodeAssetId ? "" : node.sourceImage.url),
              }
            : nodeAssetId
              ? {
                  assetId: nodeAssetId,
                  url: resolvedNodeUrl ?? "",
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
              const resolvedChildAssetId =
                child.assetId ??
                child.sourceImage?.assetId ??
                extractAssetIdFromGatewayUrl(child.sourceImage?.url) ??
                extractAssetIdFromGatewayUrl(child.imageSrc);
              const resolvedChildUrl =
                resolvedChildAssetId && assets[resolvedChildAssetId]?.originalUrl
                  ? assets[resolvedChildAssetId]!.originalUrl!
                  : undefined;

              return {
                ...child,
                assetId: resolvedChildAssetId,
                imageSrc: resolvedChildUrl ?? (resolvedChildAssetId ? "" : child.imageSrc),
                sourceImage: child.sourceImage
                  ? {
                      ...child.sourceImage,
                      assetId: resolvedChildAssetId,
                      url: resolvedChildUrl ?? (resolvedChildAssetId ? "" : child.sourceImage.url),
                    }
                  : undefined,
              };
            }),
          },
        };
      }),
    },
  } satisfies CanvasSnapshotDocument;
}
