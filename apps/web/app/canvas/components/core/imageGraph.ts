import type { CanvasNode } from "./CanvasWorkspace";

export type ImageHandlePosition = "left" | "right";

export type ImageConnectionRole =
  | "material_reference"
  | "style_reference"
  | "architecture_reference"
  | "structure_reference"
  | "plant_reference"
  | "layout_reference"
  | "direct_edit_target"
  | "output_result"
  | "generic_reference";

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
