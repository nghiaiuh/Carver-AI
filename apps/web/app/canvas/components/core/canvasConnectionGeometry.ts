import type { CanvasConnectionKind, CanvasEdge, CanvasNode } from "../../types/canvas";
import {
  getCanvasNodeVisualScale,
  isImageOutputOnlyNode,
  getNodeSemanticPort,
  getPortsBySide,
} from "../../utils/canvasNodePorts";
import {
  getCornerAnchoredPortOffsetY,
  getGenericNodePortOffsetY,
  getImageOutputPortOffsetY,
} from "../../utils/canvasPortLayout";

// Re-export from the canonical type module so existing callers of canvasConnectionGeometry
// that import ImageHandlePosition / ImageConnectionRole continue to work.
export type { ImageHandlePosition, ImageConnectionRole } from "../../types/canvas";
import type { ImageHandlePosition, ImageConnectionRole } from "../../types/canvas";

export const INPUT_PORT_HANDLE_CENTER_OFFSET = 6;
/** Full handle box offset from the card edge, used by the DOM layout. */
export const AGGREGATE_HANDLE_OFFSET = 32;
/** SVG edges must end at the center of the 32px handle, not its outer edge. */
export const AGGREGATE_HANDLE_CENTER_OFFSET = AGGREGATE_HANDLE_OFFSET / 2;

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

export function getAggregateHandlePoint(
  node: CanvasNode,
  side: ImageHandlePosition,
  kind: CanvasConnectionKind,
) {
  const scale = getCanvasNodeVisualScale(node);
  const width = node.width * scale;
  const height = node.height * scale;
  const resolvedSide = isImageOutputOnlyNode(node) ? "right" : side;
  const resolvedKind = isImageOutputOnlyNode(node) ? "image" : kind;

  return {
    x:
      resolvedSide === "left"
        ? node.x - AGGREGATE_HANDLE_CENTER_OFFSET
        : node.x + width + AGGREGATE_HANDLE_CENTER_OFFSET,
    y:
      node.y +
      (isImageOutputOnlyNode(node)
        ? getImageOutputPortOffsetY(height)
        : getGenericNodePortOffsetY(height, resolvedKind, resolvedSide)),
  };
}

export function getImageHandlePoint(node: CanvasNode, handle: ImageHandlePosition) {
  const scale = getCanvasNodeVisualScale(node);
  const width = node.width * scale;
  const height = node.height * scale;

  return {
    x: handle === "left" ? node.x : node.x + width,
    y: node.y + height / 2,
  };
}

/** Resolve a persisted semantic port into its stable point on the rendered node. */
export function getSemanticPortPoint(node: CanvasNode, portId: string | undefined) {
  const port = getNodeSemanticPort(node, portId);
  if (!port) return null;

  const scale = getCanvasNodeVisualScale(node);
  const width = node.width * scale;
  const height = node.height * scale;
  const sameSidePorts = getPortsBySide(node, port.side);
  const portIndex = sameSidePorts.findIndex((candidate) => candidate.id === port.id);

  return {
    x:
      port.side === "left"
        ? node.x - AGGREGATE_HANDLE_CENTER_OFFSET
        : node.x + width + AGGREGATE_HANDLE_CENTER_OFFSET,
    y: node.y + getCornerAnchoredPortOffsetY({
      height,
      index: Math.max(portIndex, 0),
      total: sameSidePorts.length,
      side: port.side,
    }),
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
 * Calculate the anchor point for a specific input port near a node's left-bottom corner.
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

  return {
    x: node.x - INPUT_PORT_HANDLE_CENTER_OFFSET,
    y: node.y + getCornerAnchoredPortOffsetY({
      height,
      index: portIndex,
      total: totalVisiblePorts,
      side: "left",
    }),
  };
}
