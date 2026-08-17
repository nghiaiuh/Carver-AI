import type { CanvasConnectionKind, CanvasEdge } from "../types/canvas";
import type { CanvasNodePortDefinition } from "./canvasNodePorts";
import {
  CANVAS_PORT_HANDLE_CENTER_OUTSET,
  CANVAS_PORT_HANDLE_SIZE,
  getImageOutputPortOffsetY,
} from "./canvasPortLayout";
import type { CanvasNodeGroup } from "./canvasNodeGroups";

export const GROUP_OUTPUT_IMAGE_PORT_ID = "group-output-image";

/**
 * A group is a computed canvas frame rather than a persisted CanvasNode. It
 * still exposes this typed virtual port so UI, edges, and AI context share one contract.
 */
export const GROUP_OUTPUT_IMAGE_PORT: CanvasNodePortDefinition = {
  id: GROUP_OUTPUT_IMAGE_PORT_ID,
  direction: "output",
  kind: "image",
  side: "right",
  order: 0,
  label: "Grouped image output",
  acceptedKinds: ["image"],
  maxConnections: "many",
};

export function getGroupSemanticPort(
  portId: string | undefined,
): CanvasNodePortDefinition | undefined {
  return portId === GROUP_OUTPUT_IMAGE_PORT_ID ? GROUP_OUTPUT_IMAGE_PORT : undefined;
}

/** Returns the world-space center of a virtual group port, like getSemanticPortPoint for cards. */
export function getGroupSemanticPortPoint(
  group: CanvasNodeGroup,
  portId: string | undefined,
) {
  const port = getGroupSemanticPort(portId);
  if (!port) return null;

  return {
    x: group.bounds.x + group.bounds.width + CANVAS_PORT_HANDLE_CENTER_OUTSET,
    y: group.bounds.y + getImageOutputPortOffsetY(group.bounds.height),
  };
}

/** Converts a virtual group port center into local CSS coordinates for its button. */
export function getGroupPortButtonLayout(group: CanvasNodeGroup, portId: string | undefined) {
  const point = getGroupSemanticPortPoint(group, portId);
  if (!point) return null;

  return {
    left: point.x - group.bounds.x,
    top: point.y - group.bounds.y,
    size: CANVAS_PORT_HANDLE_SIZE,
  };
}

export function isGroupPortCompatibleWithConnection(
  portId: string | undefined,
  kind: CanvasConnectionKind,
) {
  return getGroupSemanticPort(portId)?.acceptedKinds.includes(kind) ?? false;
}

/** Returns the number of edges emitted by a virtual group output port. */
export function getGroupPortConnectionCount(edges: CanvasEdge[], groupId: string, portId: string) {
  return edges.filter(
    (edge) => edge.sourceGroupId === groupId && edge.sourcePortId === portId,
  ).length;
}
