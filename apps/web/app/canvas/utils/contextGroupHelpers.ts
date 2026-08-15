import type {
  CanvasContextGroupItem,
  CanvasContextGroupKind,
  CanvasContextGroupNode,
  CanvasNode,
  ImageConnectionRole,
} from "../types/canvas";
import { isCanvasContextGroupNode, isCanvasImageOutputGalleryNode } from "../types/canvas";

export const CONTEXT_GROUP_LABELS: Record<CanvasContextGroupKind, string> = {
  "site-set": "Site Set",
  "sketch-layer": "Sketch Layer",
  "material-board": "Material Board",
};

export const CONTEXT_GROUP_ROLE_DEFAULTS: Record<CanvasContextGroupKind, ImageConnectionRole> = {
  "site-set": "layout_reference",
  "sketch-layer": "structure_reference",
  "material-board": "material_reference",
};

export function isContextGroupNode(node: CanvasNode): node is CanvasContextGroupNode {
  return isCanvasContextGroupNode(node);
}

/** Creates durable group entries from existing canvas image-like nodes. */
export function createContextGroupItems(nodes: CanvasNode[], kind: CanvasContextGroupKind) {
  const role = CONTEXT_GROUP_ROLE_DEFAULTS[kind];
  return nodes.flatMap((node): CanvasContextGroupItem[] => {
    if (isCanvasContextGroupNode(node)) return [];

    const source = isCanvasImageOutputGalleryNode(node)
      ? undefined
      : node.sourceImage;
    const assetId = source?.assetId;
    const imageUrl = source?.url || node.imageUrl;
    if (!assetId && !imageUrl) return [];

    return [{
      id: `context-item-${node.id}`,
      nodeId: node.id,
      assetId,
      // Asset-backed canvas nodes can be resolved to a fresh gateway URL at
      // runtime. Do not persist a short-lived signed URL inside the group.
      imageUrl: assetId ? "" : imageUrl,
      title: node.title,
      role,
    }];
  });
}

export type ResolvedContextGroupItem = {
  id: string;
  sourceNodeId?: string;
  title: string;
  assetId?: string;
  imageUrl: string;
  role: ImageConnectionRole;
};

/**
 * Resolves a group at use-time so an updated image node automatically becomes
 * the current reference. Static asset fields are only a recovery fallback.
 */
export function resolveContextGroupItems(
  group: CanvasContextGroupNode,
  nodes: CanvasNode[],
): ResolvedContextGroupItem[] {
  const fallbackRole = CONTEXT_GROUP_ROLE_DEFAULTS[group.contextGroup.kind];
  const seen = new Set<string>();

  return group.contextGroup.items.flatMap((item) => {
    const linkedNode = item.nodeId ? nodes.find((node) => node.id === item.nodeId) : undefined;
    const source = linkedNode && !isCanvasImageOutputGalleryNode(linkedNode)
      ? linkedNode.sourceImage
      : undefined;
    const assetId = source?.assetId ?? item.assetId;
    const imageUrl = source?.url || linkedNode?.imageUrl || item.imageUrl || "";
    const key = assetId ?? imageUrl;
    if (!key || seen.has(key)) return [];

    seen.add(key);
    return [{
      id: item.id,
      sourceNodeId: item.nodeId,
      title: linkedNode?.title ?? item.title,
      assetId,
      imageUrl,
      role: item.role ?? fallbackRole,
    }];
  });
}

export function getContextGroupDescription(group: CanvasContextGroupNode) {
  const count = group.contextGroup.items.length;
  const label = CONTEXT_GROUP_LABELS[group.contextGroup.kind];
  return group.contextGroup.description?.trim() || `${label} with ${count} reference${count === 1 ? "" : "s"}.`;
}
