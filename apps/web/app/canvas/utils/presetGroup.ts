"use client";

import type {
  CanvasEdge,
  CanvasNode,
  CanvasPresetChild,
  CanvasPresetGroupNode,
  CanvasSourceImage,
} from "../types/canvas";

export const PRESET_GROUP_WIDTH = 248;
export const PRESET_GROUP_PADDING = 14;
export const PRESET_GROUP_THUMB_SIZE = 52;
export const PRESET_GROUP_THUMB_GAP = 8;
export const PRESET_GROUP_FOLDER_HEIGHT = 118;
export const PRESET_GROUP_SECTION_GAP = 14;
const PRESET_GROUP_MAX_COLUMNS = 4;

export function isPresetGroupNode(node: CanvasNode): node is CanvasPresetGroupNode {
  return node.kind === "presetGroup";
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

export function getPresetGroupColumns(childCount: number) {
  return Math.max(1, Math.min(PRESET_GROUP_MAX_COLUMNS, childCount));
}

export function getPresetGroupNodeSize(childCount: number) {
  const safeCount = Math.max(childCount, 1);
  const columns = getPresetGroupColumns(safeCount);
  const rows = Math.max(1, Math.ceil(safeCount / columns));
  const thumbsWidth =
    columns * PRESET_GROUP_THUMB_SIZE + Math.max(0, columns - 1) * PRESET_GROUP_THUMB_GAP;
  const thumbsHeight =
    rows * PRESET_GROUP_THUMB_SIZE + Math.max(0, rows - 1) * PRESET_GROUP_THUMB_GAP;

  return {
    width: Math.max(PRESET_GROUP_WIDTH, thumbsWidth + PRESET_GROUP_PADDING * 2),
    height:
      PRESET_GROUP_PADDING * 2 +
      thumbsHeight +
      PRESET_GROUP_SECTION_GAP +
      PRESET_GROUP_FOLDER_HEIGHT,
  };
}

export function getPresetChildRects(node: CanvasPresetGroupNode) {
  const children = sortPresetChildren(node.presetGroup.children);
  const columns = getPresetGroupColumns(children.length || 1);
  const rows = Math.max(1, Math.ceil(Math.max(children.length, 1) / columns));
  const thumbsWidth =
    columns * PRESET_GROUP_THUMB_SIZE + Math.max(0, columns - 1) * PRESET_GROUP_THUMB_GAP;
  const startX = node.x + (node.width - thumbsWidth) / 2;
  const startY = node.y + PRESET_GROUP_PADDING;

  return children.map((child, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    return {
      child,
      x: startX + column * (PRESET_GROUP_THUMB_SIZE + PRESET_GROUP_THUMB_GAP),
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
