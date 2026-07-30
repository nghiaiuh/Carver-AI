import type { CanvasConnectionKind, CanvasEdge, CanvasNode } from "../../types/canvas";

// Re-export from the canonical type module so existing callers of canvasConnectionGeometry
// that import ImageHandlePosition / ImageConnectionRole continue to work.
export type { ImageHandlePosition, ImageConnectionRole } from "../../types/canvas";
import type { ImageHandlePosition, ImageConnectionRole } from "../../types/canvas";

export const INPUT_PORT_HANDLE_CENTER_OFFSET = 6;
export const INPUT_PORT_GAP = 38;
export const AGGREGATE_HANDLE_OFFSET = 32;
export const AGGREGATE_HANDLE_GAP = 40;
export const AGGREGATE_HANDLE_Y_RATIO = 0.25;

const MATERIAL_PATTERN = /(material|tile|texture|gach|da|vat lieu|limestone|stone)/i;
const ARCHITECTURE_PATTERN = /(house|architecture|structure|nha|mai|cot|kien truc|roof|building)/i;
const PLANT_PATTERN = /(plant|tree|cay|bonsai|bamboo|truc|cau|shrub|fern|palm)/i;
const STYLE_PATTERN = /(style|mood|concept|phong cach)/i;

export function inferConnectionRoleFromNode(node: CanvasNode): ImageConnectionRole {
  const text = `${node.title} ${node.prompt ?? ""}`;

  if (MATERIAL_PATTERN.test(text)) return "material_reference";
  if (ARCHITECTURE_PATTERN.test(text)) return "architecture_reference";
  if (PLANT_PATTERN.test(text)) return "plant_reference";
  if (STYLE_PATTERN.test(text)) return "style_reference";

  return "generic_reference";
}

export function getEdgeConnectionKind(edge: Pick<CanvasEdge, "kind" | "label" | "role">): CanvasConnectionKind {
  if (edge.kind === "text" || edge.kind === "image") {
    return edge.kind;
  }

  const label = edge.label.toLowerCase();
  if (
    label.includes("prompt") ||
    label.includes("text") ||
    label.includes("instruction") ||
    label.includes("note")
  ) {
    return "text";
  }

  return "image";
}

export function getNodeConnectionCounts(nodeId: string, edges: CanvasEdge[]) {
  return edges.reduce(
    (counts, edge) => {
      if (edge.sourceId !== nodeId && edge.targetId !== nodeId) {
        return counts;
      }

      counts[getEdgeConnectionKind(edge)] += 1;
      return counts;
    },
    { text: 0, image: 0 } satisfies Record<CanvasConnectionKind, number>,
  );
}

export function getNodeConnectionCountsBySide(nodeId: string, edges: CanvasEdge[]) {
  return edges.reduce(
    (counts, edge) => {
      const kind = getEdgeConnectionKind(edge);
      if (edge.sourceId === nodeId) {
        counts[edge.fromHandle ?? "right"][kind] += 1;
      }
      if (edge.targetId === nodeId) {
        counts[edge.toHandle ?? "left"][kind] += 1;
      }
      return counts;
    },
    {
      left: { text: 0, image: 0 },
      right: { text: 0, image: 0 },
    } satisfies Record<ImageHandlePosition, Record<CanvasConnectionKind, number>>,
  );
}

export function getVisibleConnectionKinds(counts: Record<CanvasConnectionKind, number>) {
  return (["text", "image"] as const).filter((kind) => counts[kind] > 0);
}

export function getAggregateHandleCenterY(baseY: number, height: number) {
  return baseY + height * AGGREGATE_HANDLE_Y_RATIO;
}

export function getAggregateHandlePoint(
  node: CanvasNode,
  side: ImageHandlePosition,
  kind: CanvasConnectionKind,
  edges: CanvasEdge[],
) {
  const scale = node.scale ?? 1;
  const width = node.width * scale;
  const height = node.height * scale;
  const countsBySide = getNodeConnectionCountsBySide(node.id, edges);
  const visibleKinds = getVisibleConnectionKinds(countsBySide[side]);
  const visibleIndex = visibleKinds.indexOf(kind);
  const centerY = getAggregateHandleCenterY(node.y, height);

  let y = centerY;
  if (visibleIndex !== -1 && visibleKinds.length > 1) {
    const clusterHeight = (visibleKinds.length - 1) * AGGREGATE_HANDLE_GAP;
    const startY = centerY - clusterHeight / 2;
    y = startY + visibleIndex * AGGREGATE_HANDLE_GAP;
  }

  return {
    x: side === "left" ? node.x - AGGREGATE_HANDLE_OFFSET : node.x + width + AGGREGATE_HANDLE_OFFSET,
    y,
  };
}

export function getImageHandlePoint(node: CanvasNode, handle: ImageHandlePosition) {
  const scale = node.scale ?? 1;
  const width = node.width * scale;
  const height = node.height * scale;

  return {
    x: handle === "left" ? node.x : node.x + width,
    y: node.y + height / 2,
  };
}

export function buildBezierPath(start: { x: number; y: number }, end: { x: number; y: number }) {
  const dx = Math.abs(end.x - start.x);
  const curveOffset = Math.max(80, dx * 0.5);
  const direction = end.x >= start.x ? 1 : -1;
  const c1 = { x: start.x + curveOffset * direction, y: start.y };
  const c2 = { x: end.x - curveOffset * direction, y: end.y };

  return `M ${start.x} ${start.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`;
}

/**
 * Calculate the anchor point for a specific input port on the left side of a node.
 * Ports are clustered vertically in the center.
 * @param node      The canvas node
 * @param portIndex Index of this port among the visible ports (0-based)
 * @param totalVisiblePorts Total number of visible ports (from getVisibleInputPorts)
 */
export function getInputPortHandlePoint(
  node: CanvasNode,
  portIndex: number,
  totalVisiblePorts: number,
): { x: number; y: number } {
  const scale = node.scale ?? 1;
  const height = node.height * scale;
  const centerY = node.y + height / 2;

  // If only 1 port, center it vertically
  if (totalVisiblePorts <= 1) {
    return { x: node.x - INPUT_PORT_HANDLE_CENTER_OFFSET, y: centerY };
  }

  // Cluster ports tightly in the center, using the fixed gap
  const clusterHeight = (totalVisiblePorts - 1) * INPUT_PORT_GAP;
  const startY = centerY - clusterHeight / 2;
  const y = startY + portIndex * INPUT_PORT_GAP;

  return { x: node.x - INPUT_PORT_HANDLE_CENTER_OFFSET, y };
}
