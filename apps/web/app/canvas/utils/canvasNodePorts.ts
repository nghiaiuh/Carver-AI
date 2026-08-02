import type { CanvasConnectionKind, CanvasEdge, CanvasNode, InputPort } from "../types/canvas";
import { getDefaultInputPorts } from "../types/canvas";

export type CanvasPortDirection = "input" | "output";

/**
 * A semantic port describes what a connection means, independently from the
 * card layout that renders it. New node types can register their own ports here.
 */
export type CanvasSemanticPort = {
  id: string;
  direction: CanvasPortDirection;
  kind: CanvasConnectionKind;
  side: "left" | "right";
  yRatio: number;
  label: string;
};

export const ASSISTANT_INPUT_PORTS: InputPort[] = [
  { id: "assistant-input-text", index: 0, label: "Prompt input" },
  { id: "assistant-input-image", index: 1, label: "Image input" },
];

export const TEXT_NODE_INPUT_PORTS: InputPort[] = [
  { id: "text-node-input", index: 0, label: "Text input" },
];

const ASSISTANT_SEMANTIC_PORTS: CanvasSemanticPort[] = [
  { id: "assistant-input-text", direction: "input", kind: "text", side: "left", yRatio: 0.76, label: "Prompt input" },
  { id: "assistant-input-image", direction: "input", kind: "image", side: "left", yRatio: 0.93, label: "Image input" },
  { id: "assistant-output-text", direction: "output", kind: "text", side: "right", yRatio: 0.12, label: "Text output" },
];

const TEXT_NODE_SEMANTIC_PORTS: CanvasSemanticPort[] = [
  { id: "text-node-input", direction: "input", kind: "text", side: "left", yRatio: 0.5, label: "Text input" },
  { id: "text-node-output", direction: "output", kind: "text", side: "right", yRatio: 0.5, label: "Text output" },
];

export function getAssistantInputPorts() {
  return ASSISTANT_INPUT_PORTS.map((port) => ({ ...port }));
}

export function getTextNodeInputPorts() {
  return TEXT_NODE_INPUT_PORTS.map((port) => ({ ...port }));
}

export function getCanvasNodeVisualScale(node: CanvasNode) {
  // Assistant cards intentionally render smaller than their persisted layout box.
  return (node.scale ?? 1) * (node.kind === "assistant" ? 2 / 3 : 1);
}

export function getNodeSemanticPorts(node: CanvasNode): CanvasSemanticPort[] {
  if (node.kind === "assistant") return ASSISTANT_SEMANTIC_PORTS;
  if (node.kind === "text") return TEXT_NODE_SEMANTIC_PORTS;
  return [];
}

export function getNodeSemanticPort(node: CanvasNode, portId: string | undefined) {
  if (!portId) return undefined;
  return getNodeSemanticPorts(node).find((port) => port.id === portId);
}

export function getDefaultSourcePortId({ node, kind, side }: {
  node: CanvasNode;
  kind: CanvasConnectionKind;
  side: "left" | "right";
}) {
  const semanticPort = getNodeSemanticPorts(node).find(
    (port) => port.direction === "output" && port.kind === kind,
  );

  return semanticPort?.id ?? `source-${side}-${kind}`;
}

export function getTargetPortIdForConnection({ node, kind, edges }: {
  node: CanvasNode;
  kind: CanvasConnectionKind;
  edges: CanvasEdge[];
}): string | null {
  const semanticInput = getNodeSemanticPorts(node).find(
    (port) => port.direction === "input" && port.kind === kind,
  );
  if (semanticInput) return semanticInput.id;
  if (getNodeSemanticPorts(node).length > 0) return null;

  const targetPorts = node.inputPorts?.length ? node.inputPorts : getDefaultInputPorts();
  const occupiedPortIds = new Set(
    edges.filter((edge) => edge.targetId === node.id).map((edge) => edge.targetPortId),
  );
  return targetPorts.find((port) => !occupiedPortIds.has(port.id))?.id ?? targetPorts[0].id;
}
