"use client";

import type {
  CanvasEdge,
  CanvasNode,
  CanvasAssistantNode,
  CanvasImageGeneratorNode,
  CanvasPresetChild,
  CanvasPresetGroupNode,
  CanvasSourceImage,
} from "../types/canvas";

export const PRESET_GROUP_PADDING = 10;
export const PRESET_GROUP_THUMB_SIZE = 52;
export const PRESET_GROUP_THUMB_GAP = 6;
export const PRESET_GROUP_TITLE_HEIGHT = 28; // space below box for the title label
const PRESET_GROUP_MAX_ROWS = 5;

export function isPresetGroupNode(node: CanvasNode): node is CanvasPresetGroupNode {
  return node.kind === "presetGroup";
}

export function isAssistantNode(node: CanvasNode): node is CanvasAssistantNode {
  return node.kind === "assistant";
}

export function isImageGeneratorNode(node: CanvasNode): node is CanvasImageGeneratorNode {
  return node.kind === "image-generator";
}

export function buildPresetSourceImage(imageUrl: string, name: string): CanvasSourceImage {
  return {
    url: imageUrl,
    width: null,
    height: null,
    name,
    quality: "original",
  };
}

export function sortPresetChildren(children: CanvasPresetChild[]) {
  return [...children].sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

/** Number of rows in a column before spilling into the next column. Max 5. */
export function getPresetGroupRows(childCount: number) {
  return Math.min(childCount, PRESET_GROUP_MAX_ROWS);
}

/** Number of columns needed for a given child count (column-first, max 5 rows). */
export function getPresetGroupColumns(childCount: number) {
  return Math.max(1, Math.ceil(childCount / PRESET_GROUP_MAX_ROWS));
}

/**
 * Returns the pixel size of the gray box (thumbnails area only).
 * The title label is rendered below the box and is NOT included in height.
 */
export function getPresetGroupNodeSize(childCount: number) {
  const safeCount = Math.max(childCount, 1);
  const rows = getPresetGroupRows(safeCount);
  const columns = getPresetGroupColumns(safeCount);
  const thumbsWidth =
    columns * PRESET_GROUP_THUMB_SIZE + Math.max(0, columns - 1) * PRESET_GROUP_THUMB_GAP;
  const thumbsHeight =
    rows * PRESET_GROUP_THUMB_SIZE + Math.max(0, rows - 1) * PRESET_GROUP_THUMB_GAP;

  return {
    width: thumbsWidth + PRESET_GROUP_PADDING * 2,
    // box height = thumbnails + padding; title sits outside below
    height: thumbsHeight + PRESET_GROUP_PADDING * 2 + PRESET_GROUP_TITLE_HEIGHT,
  };
}

/**
 * Column-first layout: items fill down each column (max 5 rows) before moving
 * to the next column. The thumbnails area sits at the top of the box with
 * PRESET_GROUP_PADDING inset on all sides.
 */
export function getPresetChildRects(node: CanvasPresetGroupNode) {
  const children = sortPresetChildren(node.presetGroup.children);
  const count = Math.max(children.length, 1);
  const rows = getPresetGroupRows(count);
  const columns = getPresetGroupColumns(count);
  const thumbsWidth =
    columns * PRESET_GROUP_THUMB_SIZE + Math.max(0, columns - 1) * PRESET_GROUP_THUMB_GAP;
  const startX = node.x + (node.width - thumbsWidth) / 2;
  const startY = node.y + PRESET_GROUP_PADDING;

  return children.map((child, index) => {
    // column-first: col advances every MAX_ROWS items
    const col = Math.floor(index / PRESET_GROUP_MAX_ROWS);
    const row = index % PRESET_GROUP_MAX_ROWS;
    return {
      child,
      x: startX + col * (PRESET_GROUP_THUMB_SIZE + PRESET_GROUP_THUMB_GAP),
      y: startY + row * (PRESET_GROUP_THUMB_SIZE + PRESET_GROUP_THUMB_GAP),
      width: PRESET_GROUP_THUMB_SIZE,
      height: PRESET_GROUP_THUMB_SIZE,
    };
  });
}

export function getPresetChildAnchor(node: CanvasPresetGroupNode, childId: string) {
  const rect = getPresetChildRects(node).find((item) => item.child.id === childId);
  if (!rect) return null;

  return {
    x: rect.x,
    y: rect.y + rect.height / 2,
  };
}

/**
 * Returns the right-center anchor of a preset child thumbnail.
 * Used as the origin point when the user drags a connection line from a preset child.
 */
export function getPresetChildRightAnchor(node: CanvasPresetGroupNode, childId: string) {
  const rect = getPresetChildRects(node).find((item) => item.child.id === childId);
  if (!rect) return null;

  return {
    x: rect.x + rect.width,
    y: rect.y + rect.height / 2,
  };
}

export function resolvePresetGroupDropTarget(
  node: CanvasPresetGroupNode,
  point: { x: number; y: number },
) {
  const childRect = getPresetChildRects(node).find(
    (item) =>
      point.x >= item.x &&
      point.x <= item.x + item.width &&
      point.y >= item.y &&
      point.y <= item.y + item.height,
  );

  return childRect?.child.id ?? null;
}

export function syncPresetGroupPreview(node: CanvasPresetGroupNode): CanvasPresetGroupNode {
  const children = sortPresetChildren(node.presetGroup.children);
  const activeChild =
    children.find((child) => child.id === node.presetGroup.activeChildId) ?? children[0] ?? null;
  const { width, height } = getPresetGroupNodeSize(children.length);

  return {
    ...node,
    width,
    height,
    imageUrl: activeChild?.imageSrc ?? node.imageUrl,
    sourceImage: activeChild?.sourceImage ?? node.sourceImage,
    title: activeChild ? node.title : node.title,
    prompt: activeChild?.prompt ?? node.prompt ?? null,
    presetGroup: {
      ...node.presetGroup,
      activeChildId: activeChild?.id ?? null,
      children,
    },
  };
}

export function upsertPresetChild(
  children: CanvasPresetChild[],
  nextChild: CanvasPresetChild,
  matchBySlot = true,
) {
  const existingIndex = children.findIndex((child) =>
    matchBySlot ? child.slot === nextChild.slot : child.id === nextChild.id,
  );

  if (existingIndex === -1) {
    return sortPresetChildren([
      ...children,
      { ...nextChild, order: children.length },
    ]).map((child, index) => ({ ...child, order: index }));
  }

  return sortPresetChildren(
    children.map((child, index) =>
      index === existingIndex
        ? { ...nextChild, order: child.order }
        : child,
    ),
  ).map((child, index) => ({ ...child, order: index }));
}

export function reorderPresetChildren(children: CanvasPresetChild[], orderedIds: string[]) {
  const map = new Map(children.map((child) => [child.id, child]));
  return orderedIds
    .map((id) => map.get(id))
    .filter((child): child is CanvasPresetChild => Boolean(child))
    .map((child, index) => ({ ...child, order: index }));
}

export function removePresetChildAndCleanupEdges(
  node: CanvasPresetGroupNode,
  childId: string,
  edges: CanvasEdge[],
) {
  const remainingChildren = node.presetGroup.children
    .filter((child) => child.id !== childId)
    .map((child, index) => ({ ...child, order: index }));
  const nextEdges = edges.filter(
    (edge) => !(edge.targetId === node.id && edge.targetPresetChildId === childId),
  );

  return {
    children: remainingChildren,
    edges: nextEdges,
  };
}
