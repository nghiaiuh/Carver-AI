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
    add(node.sourceImage?.assetId);

    if (!node.presetGroup) {
      continue;
    }

    for (const child of node.presetGroup.children) {
      add(child.assetId);
      add(child.sourceImage?.assetId);
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
        const nextNode = {
          ...node,
          imageUrl:
            node.sourceImage?.assetId && assets[node.sourceImage.assetId]?.originalUrl
              ? assets[node.sourceImage.assetId]!.originalUrl!
              : node.imageUrl,
          sourceImage: node.sourceImage
            ? {
                ...node.sourceImage,
                url:
                  node.sourceImage.assetId && assets[node.sourceImage.assetId]?.originalUrl
                    ? assets[node.sourceImage.assetId]!.originalUrl!
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
              const resolvedChildAssetId = child.assetId ?? child.sourceImage?.assetId;
              const resolvedChildUrl =
                resolvedChildAssetId && assets[resolvedChildAssetId]?.originalUrl
                  ? assets[resolvedChildAssetId]!.originalUrl!
                  : undefined;

              return {
                ...child,
                imageSrc: resolvedChildUrl ?? child.imageSrc,
                sourceImage: child.sourceImage
                  ? {
                      ...child.sourceImage,
                      url: resolvedChildUrl ?? child.sourceImage.url,
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
