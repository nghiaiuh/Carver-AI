import type { CanvasNode } from "../../types/canvas";

// Re-export from the canonical type module so existing callers of canvasConnectionGeometry
// that import ImageHandlePosition / ImageConnectionRole continue to work.
export type { ImageHandlePosition, ImageConnectionRole } from "../../types/canvas";
import type { ImageHandlePosition, ImageConnectionRole } from "../../types/canvas";

export const INPUT_PORT_HANDLE_CENTER_OFFSET = 6;
export const INPUT_PORT_GAP = 38;

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
