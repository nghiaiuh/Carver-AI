import type { CanvasConnectionKind } from "../types/canvas";

/** Shared hit target used by semantic card and virtual-group connection ports. */
export const CANVAS_PORT_HANDLE_SIZE = 32;
/** Distance from a node edge to the outer edge of its port hit target. */
export const CANVAS_PORT_HANDLE_OUTSET = 38;
/** Distance from a node edge to the visual center of its port hit target. */
export const CANVAS_PORT_HANDLE_CENTER_OUTSET =
  CANVAS_PORT_HANDLE_OUTSET - CANVAS_PORT_HANDLE_SIZE / 2;

/** Preferred spacing between neighboring ports, measured in canvas world units. */
export const CANVAS_PORT_GAP_WORLD = 45;
/**
 * Both port clusters share this inset so left-bottom and right-top anchors
 * stay visually symmetric around their respective node corners.
 */
export const CANVAS_PORT_CORNER_INSET_WORLD = 45;
export type CanvasPortSide = "left" | "right";

/**
 * Anchors left-side port clusters from the bottom corner and right-side clusters
 * from the top corner. Extra ports grow inward with a stable order and gap.
 */
export function getCornerAnchoredPortOffsetY({
  height,
  index,
  total,
  side,
}: {
  height: number;
  index: number;
  total: number;
  side: CanvasPortSide;
}) {
  const safeTotal = Math.max(total, 1);
  const safeIndex = Math.min(Math.max(index, 0), safeTotal - 1);
  const cornerInset = Math.min(CANVAS_PORT_CORNER_INSET_WORLD, height / 2);
  if (safeTotal === 1) return side === "left" ? height - cornerInset : cornerInset;

  const availableGap = Math.max(0, (height - cornerInset * 2) / (safeTotal - 1));
  const gap = Math.min(CANVAS_PORT_GAP_WORLD, availableGap);
  return side === "left"
    ? height - cornerInset - (safeTotal - 1 - safeIndex) * gap
    : cornerInset + safeIndex * gap;
}

const GENERIC_NODE_PORT_ORDER: readonly CanvasConnectionKind[] = ["text", "image"];

export function getGenericNodePortOffsetY(
  height: number,
  kind: CanvasConnectionKind,
  side: CanvasPortSide,
) {
  const index = GENERIC_NODE_PORT_ORDER.indexOf(kind);
  return getCornerAnchoredPortOffsetY({
    height,
    index: Math.max(index, 0),
    total: GENERIC_NODE_PORT_ORDER.length,
    side,
  });
}

/** A source-only image card has one port, aligned with an assistant's top-right output. */
export function getImageOutputPortOffsetY(height: number) {
  return getCornerAnchoredPortOffsetY({
    height,
    index: 0,
    total: 1,
    side: "right",
  });
}
