/**
 * portUtils.ts
 *
 * Port-related utilities for the named-port connection system.
 * All functions are pure and side-effect-free.
 */

import type { CanvasEdge, CanvasNode, InputPort } from "../../types/canvas";
import { getDefaultInputPorts, getVisibleInputPorts } from "../../types/canvas";
import { getInputPortHandlePoint } from "./imageGraph";

// ── Port Resolution ──────────────────────────────────────────────────────────

/**
 * Given a drop point in world coordinates, find the closest visible input port
 * within `hitRadiusPx` world-units. Returns null if no port is close enough
 * (prevents false-snap when the cursor is between ports or far from any handle).
 */
export function resolveTargetPort(
  node: CanvasNode,
  worldPoint: { x: number; y: number },
  edges: CanvasEdge[],
  hitRadiusPx = 24,
): InputPort | null {
  const visiblePorts = getVisibleInputPorts(node.inputPorts, edges, node.id);
  if (visiblePorts.length === 0) return null;

  let bestPort: InputPort | null = null;
  let bestDist = Infinity;

  for (let i = 0; i < visiblePorts.length; i++) {
    const anchor = getInputPortHandlePoint(node, i, visiblePorts.length);
    const dx = worldPoint.x - anchor.x;
    const dy = worldPoint.y - anchor.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < bestDist) {
      bestDist = dist;
      bestPort = visiblePorts[i];
    }
  }

  return bestDist <= hitRadiusPx ? bestPort : null;
}

export function resolveConnectionTarget(
  nodes: CanvasNode[],
  sourceNodeId: string,
  worldPoint: { x: number; y: number },
  edges: CanvasEdge[],
  hitRadiusPx = 32,
): { node: CanvasNode; port: InputPort } | null {
  let bestMatch: { node: CanvasNode; port: InputPort; distance: number } | null = null;

  for (const node of nodes) {
    if (node.id === sourceNodeId) continue;

    // Rule: only 1 connection line between any 2 images — skip if already connected
    if (hasEdgeBetween(edges, sourceNodeId, node.id)) continue;

    const visiblePorts = getVisibleInputPorts(node.inputPorts, edges, node.id);
    for (let i = 0; i < visiblePorts.length; i++) {
      const anchor = getInputPortHandlePoint(node, i, visiblePorts.length);
      const dx = worldPoint.x - anchor.x;
      const dy = worldPoint.y - anchor.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance <= hitRadiusPx && (!bestMatch || distance < bestMatch.distance)) {
        bestMatch = { node, port: visiblePorts[i], distance };
      }
    }
  }

  return bestMatch ? { node: bestMatch.node, port: bestMatch.port } : null;
}

// ── Port Occupation ──────────────────────────────────────────────────────────

/** Check if a specific port on a node already has an inbound edge. */
export function isPortOccupied(
  edges: CanvasEdge[],
  nodeId: string,
  portId: string,
): boolean {
  return edges.some((e) => e.targetId === nodeId && e.targetPortId === portId);
}

/**
 * Check if any edge already exists between two nodes (in either direction).
 * Used to enforce the "only 1 connection line between any 2 images" rule.
 */
export function hasEdgeBetween(
  edges: CanvasEdge[],
  nodeIdA: string,
  nodeIdB: string,
): boolean {
  return edges.some(
    (e) =>
      (e.sourceId === nodeIdA && e.targetId === nodeIdB) ||
      (e.sourceId === nodeIdB && e.targetId === nodeIdA),
  );
}

/** Get the edge connected to a specific port (or undefined). */
export function getPortConnectedEdge(
  edges: CanvasEdge[],
  nodeId: string,
  portId: string,
): CanvasEdge | undefined {
  return edges.find((e) => e.targetId === nodeId && e.targetPortId === portId);
}

// ── Image Collection (Port-Ordered) ──────────────────────────────────────────

export type PortImage = {
  portIndex: number;
  portId: string;
  portLabel: string;
  sourceNodeId: string;
  sourceImageUrl: string;
  sourceTitle: string;
};

/**
 * Gather all connected source images for a target node, sorted by port.index.
 * This is the canonical ordering used when building AI payloads — never rely
 * on edge insertion order or pixel position.
 */
export function collectImagesInPortOrder(
  targetNode: CanvasNode,
  edges: CanvasEdge[],
  allNodes: CanvasNode[],
): PortImage[] {
  const inboundEdges = edges.filter((e) => e.targetId === targetNode.id);

  const portImages: PortImage[] = [];

  for (const edge of inboundEdges) {
    const port = targetNode.inputPorts.find((p) => p.id === edge.targetPortId);
    if (!port) continue;

    const sourceNode = allNodes.find((n) => n.id === edge.sourceId);
    if (!sourceNode) continue;

    portImages.push({
      portIndex: port.index,
      portId: port.id,
      portLabel: port.label,
      sourceNodeId: sourceNode.id,
      sourceImageUrl: sourceNode.sourceImage?.url ?? sourceNode.imageUrl,
      sourceTitle: sourceNode.title,
    });
  }

  // Sort by port index — this is the deterministic ordering guarantee
  portImages.sort((a, b) => a.portIndex - b.portIndex);

  return portImages;
}

// ── Prompt Reference Parsing ─────────────────────────────────────────────────

export type PromptImageRef = {
  rawMatch: string;
  /** 1-based index as the user wrote it ("image 1" → 1) */
  index: number;
  /** 0-based port index for internal lookup */
  portIndex: number;
};

/**
 * Parse prompt text for image references.
 *
 * Supported patterns (MVP scoped grammar):
 * - English: "image 1", "image N", "Image 1" (case-insensitive, digit only)
 * - Vietnamese: "ảnh 1", "ảnh thứ 1", "ảnh số 1" (digit only)
 *
 * Explicitly out of scope for MVP (documented, not silently missed):
 * - Written-out numbers: "ảnh thứ hai", "image one"
 * - Ordinal words: "the second image", "ảnh cuối"
 */
export function parsePromptImageReferences(prompt: string): PromptImageRef[] {
  const refs: PromptImageRef[] = [];
  // English: "image N"
  const enPattern = /\bimage\s+(\d+)\b/gi;
  // Vietnamese: "ảnh (thứ|số)? N"
  const viPattern = /\bảnh\s+(?:thứ\s+|số\s+)?(\d+)\b/gi;

  let match: RegExpExecArray | null;

  while ((match = enPattern.exec(prompt)) !== null) {
    const index = parseInt(match[1], 10);
    if (index > 0) {
      refs.push({ rawMatch: match[0], index, portIndex: index - 1 });
    }
  }

  while ((match = viPattern.exec(prompt)) !== null) {
    const index = parseInt(match[1], 10);
    if (index > 0) {
      // Avoid duplicates if the same number was already matched
      const alreadyFound = refs.some((r) => r.index === index);
      if (!alreadyFound) {
        refs.push({ rawMatch: match[0], index, portIndex: index - 1 });
      }
    }
  }

  return refs.sort((a, b) => a.index - b.index);
}

export type PromptValidationResult = {
  valid: boolean;
  errors: string[];
  warnings: string[];
  refs: PromptImageRef[];
};

/**
 * Validate that all image references in a prompt have matching connected ports.
 */
export function validatePromptImageReferences(
  prompt: string,
  ports: InputPort[],
  edges: CanvasEdge[],
  targetNodeId: string,
): PromptValidationResult {
  const refs = parsePromptImageReferences(prompt);
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const ref of refs) {
    const port = ports.find((p) => p.index === ref.portIndex);
    if (!port) {
      errors.push(
        `Prompt references "${ref.rawMatch}" but this node only has ${ports.length} input port${ports.length === 1 ? "" : "s"}.`,
      );
      continue;
    }

    const hasConnection = edges.some(
      (e) => e.targetId === targetNodeId && e.targetPortId === port.id,
    );
    if (!hasConnection) {
      errors.push(
        `Prompt references "${ref.rawMatch}" but port "${port.label}" has no connection.`,
      );
    }
  }

  // Soft warning: prompt contains "image"/"ảnh" but no digit pattern matched
  if (refs.length === 0 && prompt.trim().length > 0) {
    const looksLikeImageRef = /\b(image|ảnh)\b/i.test(prompt);
    if (looksLikeImageRef) {
      warnings.push(
        "Could not detect which image this refers to — try writing 'image 1', 'image 2', etc.",
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    refs,
  };
}

// ── Revalidation After Port Changes ──────────────────────────────────────────

/**
 * Called after any edge is added, replaced, or removed on a node.
 * Re-runs validation against the node's current prompt and returns warnings.
 * The caller decides what to do with the result (e.g., show toast/warning).
 */
export function revalidateAfterPortChange(
  node: CanvasNode,
  edges: CanvasEdge[],
): PromptValidationResult {
  if (!node.prompt) {
    return { valid: true, errors: [], warnings: [], refs: [] };
  }

  return validatePromptImageReferences(
    node.prompt,
    node.inputPorts,
    edges,
    node.id,
  );
}

// ── Backward Compatibility Migration ─────────────────────────────────────────

/**
 * Migrate a node that lacks `inputPorts` — assigns default ports based on role.
 * Returns the node unchanged if it already has ports.
 */
export function migrateNodePorts(node: CanvasNode): CanvasNode {
  if (node.inputPorts && node.inputPorts.length > 0) return node;
  return { ...node, inputPorts: getDefaultInputPorts() };
}

/**
 * Migrate an edge that lacks `targetPortId` — assigns to the first available
 * port on the target node. Returns the edge unchanged if it already has one.
 */
export function migrateEdgePort(
  edge: CanvasEdge,
  targetNode: CanvasNode | undefined,
  existingEdges: CanvasEdge[],
): CanvasEdge {
  if (edge.targetPortId) return edge;

  if (!targetNode || !targetNode.inputPorts || targetNode.inputPorts.length === 0) {
    // Fallback: assign to port-img-0
    return { ...edge, targetPortId: "port-img-0" };
  }

  // Find the first port not occupied by another edge
  const occupiedPortIds = new Set(
    existingEdges
      .filter((e) => e.targetId === edge.targetId && e.id !== edge.id && e.targetPortId)
      .map((e) => e.targetPortId),
  );

  const freePort = targetNode.inputPorts.find((p) => !occupiedPortIds.has(p.id));
  return { ...edge, targetPortId: freePort?.id ?? targetNode.inputPorts[0].id };
}
