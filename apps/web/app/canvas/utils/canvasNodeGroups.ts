import type { CanvasGroupColor } from "@carver/shared";
import type { CanvasEdge, CanvasNode } from "../types/canvas";
import { getCanvasNodeVisualScale } from "./canvasNodePorts";

export type CanvasNodeGroup = {
  id: string;
  label: string;
  color: CanvasGroupColor;
  nodeIds: string[];
  bounds: { x: number; y: number; width: number; height: number };
};

// Keep a comfortable clear area around members for selecting and dragging the group frame.
const GROUP_PADDING = 50;
const GROUP_GAP = 48;

export type CanvasGroupArrangeMode = "row" | "grid" | "stack";

export const CANVAS_GROUP_COLOR_OPTIONS: Array<{
  id: CanvasGroupColor;
  label: string;
  accent: string;
}> = [
  { id: "neutral", label: "Neutral", accent: "#94A3B8" },
  { id: "sage", label: "Sage", accent: "#5F9A75" },
  { id: "sky", label: "Sky", accent: "#4F8FCE" },
  { id: "amber", label: "Amber", accent: "#C98A2E" },
  { id: "rose", label: "Rose", accent: "#C76A7C" },
];

export function getCanvasNodeGroups(nodes: CanvasNode[]): CanvasNodeGroup[] {
  const membersByGroupId = new Map<string, CanvasNode[]>();
  for (const node of nodes) {
    if (!node.groupId) continue;
    const members = membersByGroupId.get(node.groupId) ?? [];
    members.push(node);
    membersByGroupId.set(node.groupId, members);
  }

  return [...membersByGroupId.entries()].flatMap(([id, members]) => {
    if (members.length < 2) return [];
    const left = Math.min(...members.map((node) => node.x));
    const top = Math.min(...members.map((node) => node.y));
    const right = Math.max(...members.map((node) => node.x + node.width * getCanvasNodeVisualScale(node)));
    const bottom = Math.max(...members.map((node) => node.y + node.height * getCanvasNodeVisualScale(node)));
    return [{
      id,
      label: members.find((node) => node.groupLabel?.trim())?.groupLabel?.trim() || "Group",
      color: members.find((node) => node.groupColor)?.groupColor ?? "neutral",
      nodeIds: members.map((node) => node.id),
      bounds: {
        x: left - GROUP_PADDING,
        y: top - GROUP_PADDING,
        width: right - left + GROUP_PADDING * 2,
        height: bottom - top + GROUP_PADDING * 2,
      },
    }];
  });
}

export function getCanvasNodeGroup(nodes: CanvasNode[], groupId: string | undefined) {
  return groupId ? getCanvasNodeGroups(nodes).find((group) => group.id === groupId) ?? null : null;
}

/** Resolves an edge source without persisting a synthetic group node. */
export function getCanvasEdgeSourceNodes(nodes: CanvasNode[], edge: Pick<CanvasEdge, "sourceId" | "sourceGroupId">) {
  if (edge.sourceGroupId) {
    return nodes.filter((node) => node.groupId === edge.sourceGroupId);
  }

  const sourceNode = nodes.find((node) => node.id === edge.sourceId);
  return sourceNode ? [sourceNode] : [];
}

export function getNextCanvasGroupLabel(nodes: CanvasNode[]) {
  return `Group ${getCanvasNodeGroups(nodes).length + 1}`;
}

/** Moves group members into a stable layout using their real canvas coordinates. */
export function arrangeCanvasNodeGroup(
  nodes: CanvasNode[],
  groupId: string,
  mode: CanvasGroupArrangeMode,
) {
  const members = nodes.filter((node) => node.groupId === groupId);
  if (members.length < 2) return nodes;

  const originX = Math.min(...members.map((node) => node.x));
  const originY = Math.min(...members.map((node) => node.y));
  const nextPositions = new Map<string, { x: number; y: number }>();
  const visualWidth = (node: CanvasNode) => node.width * getCanvasNodeVisualScale(node);
  const visualHeight = (node: CanvasNode) => node.height * getCanvasNodeVisualScale(node);

  if (mode === "row") {
    let x = originX;
    for (const node of members) {
      nextPositions.set(node.id, { x, y: originY });
      x += visualWidth(node) + GROUP_GAP;
    }
  } else if (mode === "stack") {
    let y = originY;
    for (const node of members) {
      nextPositions.set(node.id, { x: originX, y });
      y += visualHeight(node) + GROUP_GAP;
    }
  } else {
    const columns = Math.ceil(Math.sqrt(members.length));
    const columnWidths = Array.from({ length: columns }, (_, column) =>
      Math.max(...members.filter((_, index) => index % columns === column).map(visualWidth)),
    );
    const rows = Math.ceil(members.length / columns);
    const rowHeights = Array.from({ length: rows }, (_, row) =>
      Math.max(...members.slice(row * columns, row * columns + columns).map(visualHeight)),
    );

    for (const [index, node] of members.entries()) {
      const column = index % columns;
      const row = Math.floor(index / columns);
      nextPositions.set(node.id, {
        x: originX + columnWidths.slice(0, column).reduce((total, width) => total + width + GROUP_GAP, 0),
        y: originY + rowHeights.slice(0, row).reduce((total, height) => total + height + GROUP_GAP, 0),
      });
    }
  }

  return nodes.map((node) => {
    const nextPosition = nextPositions.get(node.id);
    return nextPosition ? { ...node, ...nextPosition } : node;
  });
}
