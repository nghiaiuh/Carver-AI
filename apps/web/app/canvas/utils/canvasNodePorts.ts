import type { CanvasConnectionKind, CanvasEdge, CanvasNode, InputPort } from "../types/canvas";
import { getDefaultInputPorts } from "../types/canvas";

export type CanvasPortDirection = "input" | "output";
export type CanvasPortSide = "left" | "right";
export type CanvasPortConnectionLimit = number | "many";

/**
 * Port definitions are the source of truth for node connection behavior. The
 * persisted edge only stores stable IDs; this registry owns what those IDs mean.
 */
export type CanvasNodePortDefinition = {
  id: string;
  direction: CanvasPortDirection;
  kind: CanvasConnectionKind;
  side: CanvasPortSide;
  order: number;
  label: string;
  acceptedKinds: CanvasConnectionKind[];
  maxConnections: CanvasPortConnectionLimit;
  legacyInputIndex?: number;
};

export type CanvasNodePortSchema = {
  nodeKind: NonNullable<CanvasNode["kind"]>;
  visualScale?: number;
  ports: readonly CanvasNodePortDefinition[];
};

const MANY_CONNECTIONS: CanvasPortConnectionLimit = "many";

const IMAGE_NODE_PORT_SCHEMA: CanvasNodePortSchema = {
  nodeKind: "image",
  ports: [
    {
      id: "source-right-image",
      direction: "output",
      kind: "image",
      side: "right",
      order: 0,
      label: "Image output",
      acceptedKinds: ["image"],
      maxConnections: MANY_CONNECTIONS,
    },
  ],
};

const ASSISTANT_NODE_PORT_SCHEMA: CanvasNodePortSchema = {
  nodeKind: "assistant",
  visualScale: 2 / 3,
  ports: [
    {
      id: "assistant-input-text",
      direction: "input",
      kind: "text",
      side: "left",
      order: 0,
      label: "Prompt input",
      acceptedKinds: ["text"],
      maxConnections: MANY_CONNECTIONS,
      legacyInputIndex: 0,
    },
    {
      id: "assistant-input-image",
      direction: "input",
      kind: "image",
      side: "left",
      order: 1,
      label: "Image input",
      acceptedKinds: ["image"],
      maxConnections: MANY_CONNECTIONS,
      legacyInputIndex: 1,
    },
    {
      id: "assistant-output-text",
      direction: "output",
      kind: "text",
      side: "right",
      order: 0,
      label: "Text output",
      acceptedKinds: ["text"],
      maxConnections: MANY_CONNECTIONS,
    },
  ],
};

const TEXT_NODE_PORT_SCHEMA: CanvasNodePortSchema = {
  nodeKind: "text",
  ports: [
    {
      id: "text-node-input",
      direction: "input",
      kind: "text",
      side: "left",
      order: 0,
      label: "Text input",
      acceptedKinds: ["text"],
      maxConnections: MANY_CONNECTIONS,
      legacyInputIndex: 0,
    },
    {
      id: "text-node-output",
      direction: "output",
      kind: "text",
      side: "right",
      order: 0,
      label: "Text output",
      acceptedKinds: ["text"],
      maxConnections: MANY_CONNECTIONS,
    },
  ],
};

const IMAGE_GENERATOR_NODE_PORT_SCHEMA: CanvasNodePortSchema = {
  nodeKind: "image-generator",
  visualScale: 2 / 3,
  ports: [
    {
      id: "image-generator-input-text",
      direction: "input",
      kind: "text",
      side: "left",
      order: 0,
      label: "Text input",
      acceptedKinds: ["text"],
      maxConnections: MANY_CONNECTIONS,
      legacyInputIndex: 0,
    },
    {
      id: "image-generator-input-image",
      direction: "input",
      kind: "image",
      side: "left",
      order: 1,
      label: "Image input",
      acceptedKinds: ["image"],
      maxConnections: MANY_CONNECTIONS,
      legacyInputIndex: 1,
    },
    {
      id: "image-generator-output-image",
      direction: "output",
      kind: "image",
      side: "right",
      order: 0,
      label: "Generated image output",
      acceptedKinds: ["image"],
      maxConnections: MANY_CONNECTIONS,
    },
  ],
};

const IMAGE_OUTPUT_GALLERY_NODE_PORT_SCHEMA: CanvasNodePortSchema = {
  nodeKind: "image-output-gallery",
  visualScale: 2 / 3,
  ports: [
    {
      id: "image-output-gallery-input-image",
      direction: "input",
      kind: "image",
      side: "left",
      order: 0,
      label: "Generated image input",
      acceptedKinds: ["image"],
      maxConnections: 1,
      legacyInputIndex: 0,
    },
    {
      id: "image-output-gallery-output-image",
      direction: "output",
      kind: "image",
      side: "right",
      order: 0,
      label: "Selected image output",
      acceptedKinds: ["image"],
      maxConnections: MANY_CONNECTIONS,
    },
  ],
};

/**
 * Context groups are source-only aggregators. The group port represents all
 * registered child references, never a transient signed URL or copied bitmap.
 */
const CONTEXT_GROUP_NODE_PORT_SCHEMA: CanvasNodePortSchema = {
  nodeKind: "context-group",
  ports: [
    {
      id: "context-group-output-image",
      direction: "output",
      kind: "image",
      side: "right",
      order: 0,
      label: "Context image set output",
      acceptedKinds: ["image"],
      maxConnections: MANY_CONNECTIONS,
    },
  ],
};

const CAMERA_SHOT_SET_NODE_PORT_SCHEMA: CanvasNodePortSchema = {
  nodeKind: "camera-shot-set",
  ports: [
    {
      id: "camera-shot-set-input-image",
      direction: "input",
      kind: "image",
      side: "left",
      order: 0,
      label: "Input image",
      acceptedKinds: ["image"],
      maxConnections: 1,
      legacyInputIndex: 0,
    },
    {
      id: "camera-shot-set-output-text",
      direction: "output",
      kind: "text",
      side: "right",
      order: 0,
      label: "Camera plan output",
      acceptedKinds: ["text"],
      maxConnections: MANY_CONNECTIONS,
    },
  ],
};

const NODE_PORT_SCHEMAS: Partial<Record<NonNullable<CanvasNode["kind"]>, CanvasNodePortSchema>> = {
  image: IMAGE_NODE_PORT_SCHEMA,
  assistant: ASSISTANT_NODE_PORT_SCHEMA,
  text: TEXT_NODE_PORT_SCHEMA,
  "image-generator": IMAGE_GENERATOR_NODE_PORT_SCHEMA,
  "image-output-gallery": IMAGE_OUTPUT_GALLERY_NODE_PORT_SCHEMA,
  "context-group": CONTEXT_GROUP_NODE_PORT_SCHEMA,
  "camera-shot-set": CAMERA_SHOT_SET_NODE_PORT_SCHEMA,
};

function getSchemaNodeKind(node: CanvasNode): NonNullable<CanvasNode["kind"]> | null {
  return node.kind ?? "image";
}

function getRegisteredNodePortSchema(node: CanvasNode): CanvasNodePortSchema | null {
  const schemaNodeKind = getSchemaNodeKind(node);
  return schemaNodeKind ? (NODE_PORT_SCHEMAS[schemaNodeKind] ?? null) : null;
}

function sortPorts(ports: readonly CanvasNodePortDefinition[]) {
  return [...ports].sort((a, b) => {
    if (a.side !== b.side) return a.side.localeCompare(b.side);
    if (a.order !== b.order) return a.order - b.order;
    return a.id.localeCompare(b.id);
  });
}

function getConnectionCountForPort(
  nodeId: string,
  port: CanvasNodePortDefinition,
  edges: CanvasEdge[],
) {
  return edges.filter((edge) =>
    port.direction === "input"
      ? edge.targetId === nodeId && edge.targetPortId === port.id
      : edge.sourceId === nodeId && edge.sourcePortId === port.id,
  ).length;
}

function isWithinConnectionLimit(
  nodeId: string,
  port: CanvasNodePortDefinition,
  edges: CanvasEdge[],
) {
  if (port.maxConnections === "many") return true;
  return getConnectionCountForPort(nodeId, port, edges) < port.maxConnections;
}

function getLegacyInputPortDefinitions(node: CanvasNode): CanvasNodePortDefinition[] {
  const inputPorts = node.inputPorts?.length ? node.inputPorts : getDefaultInputPorts();
  return inputPorts.map((port) => ({
    id: port.id,
    direction: "input",
    kind: "image",
    side: "left",
    order: port.index,
    label: port.label,
    acceptedKinds: ["image"],
    maxConnections: 1,
    legacyInputIndex: port.index,
  }));
}

export function getNodePortSchema(node: CanvasNode): CanvasNodePortSchema {
  const registeredSchema = getRegisteredNodePortSchema(node);
  if (registeredSchema) return registeredSchema;

  return {
    nodeKind: node.kind ?? "image",
    ports: getLegacyInputPortDefinitions(node),
  };
}

export function getNodePortDefinitions(node: CanvasNode): CanvasNodePortDefinition[] {
  return sortPorts(getNodePortSchema(node).ports);
}

export function getAssistantInputPorts() {
  return getInputPortAdaptersForNodeKind("assistant");
}

export function getTextNodeInputPorts() {
  return getInputPortAdaptersForNodeKind("text");
}

export function getImageGeneratorInputPorts() {
  return getInputPortAdaptersForNodeKind("image-generator");
}

export function getImageOutputGalleryInputPorts() {
  return getInputPortAdaptersForNodeKind("image-output-gallery");
}

export function getContextGroupInputPorts() {
  return getInputPortAdaptersForNodeKind("context-group");
}

export function getCameraShotSetInputPorts() {
  return getInputPortAdaptersForNodeKind("camera-shot-set");
}

export function getCanvasNodeVisualScale(node: CanvasNode) {
  return (node.scale ?? 1) * (getNodePortSchema(node).visualScale ?? 1);
}

/** Image cards are source-only nodes with one image output on their right edge. */
export function isImageOutputOnlyNode(node: CanvasNode) {
  const ports = getNodePortDefinitions(node);
  return ports.some((port) => port.direction === "output" && port.kind === "image")
    && ports.every((port) => port.direction !== "input");
}

export function getNodeSemanticPorts(node: CanvasNode): CanvasNodePortDefinition[] {
  return getRegisteredNodePortSchema(node) ? getNodePortDefinitions(node) : [];
}

export function getNodeSemanticPort(node: CanvasNode, portId: string | undefined) {
  if (!portId) return undefined;
  return getNodePortDefinitions(node).find((port) => port.id === portId);
}

export function getInputPortDefinitions(node: CanvasNode) {
  return getNodePortDefinitions(node).filter((port) => port.direction === "input");
}

export function getOutputPortDefinitions(node: CanvasNode) {
  return getNodePortDefinitions(node).filter((port) => port.direction === "output");
}

export function getPortsBySide(node: CanvasNode, side: CanvasPortSide) {
  return getNodePortDefinitions(node)
    .filter((port) => port.side === side)
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export function getInputPortAdapters(node: CanvasNode): InputPort[] {
  return getInputPortDefinitions(node).map((port, index) => ({
    id: port.id,
    index: port.legacyInputIndex ?? index,
    label: port.label,
  }));
}

function getInputPortAdaptersForNodeKind(kind: NonNullable<CanvasNode["kind"]>): InputPort[] {
  const schema = NODE_PORT_SCHEMAS[kind];
  if (!schema) return getDefaultInputPorts();

  return schema.ports
    .filter((port) => port.direction === "input")
    .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id))
    .map((port, index) => ({
      id: port.id,
      index: port.legacyInputIndex ?? index,
      label: port.label,
    }));
}

export function getDefaultSourcePortId({ node, kind, side }: {
  node: CanvasNode;
  kind: CanvasConnectionKind;
  side: CanvasPortSide;
}) {
  const outputPort = getOutputPortDefinitions(node).find(
    (port) => port.kind === kind && port.side === side,
  ) ?? getOutputPortDefinitions(node).find(
    (port) => port.kind === kind,
  );

  return outputPort?.id ?? `source-${side}-${kind}`;
}

export function getTargetPortDefinitionForConnection({ node, kind, edges }: {
  node: CanvasNode;
  kind: CanvasConnectionKind;
  edges: CanvasEdge[];
}): CanvasNodePortDefinition | null {
  return getInputPortDefinitions(node).find((port) =>
    port.acceptedKinds.includes(kind) && isWithinConnectionLimit(node.id, port, edges),
  ) ?? null;
}

export function getTargetPortIdForConnection({ node, kind, edges }: {
  node: CanvasNode;
  kind: CanvasConnectionKind;
  edges: CanvasEdge[];
}): string | null {
  return getTargetPortDefinitionForConnection({ node, kind, edges })?.id ?? null;
}
