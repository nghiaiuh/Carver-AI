import {
  type CanvasAddedObjectSnapshot,
  coerceCanvasSnapshotDocument,
  type CanvasGraphEdgeSnapshot,
  type CanvasGraphNodeSnapshot,
  type CanvasMarkerSnapshot,
  type CanvasPenStrokeSnapshot,
  type CanvasPenSettingsSnapshot,
  type CanvasCameraState,
  type CanvasSketchGroupSnapshot,
  type CanvasSketchLineSnapshot,
  type CanvasSnapshotDocument,
} from "./snapshot";

type CanvasDraftOperationBase = {
  operationId: string;
  projectId: string;
  tabId: string;
  sequence: number;
  createdAt: string;
  baseRevision: number | null;
};

export type CanvasDraftNodeUpsertOperation = CanvasDraftOperationBase & {
  type: "node.upsert";
  nodeId: string;
  value: CanvasGraphNodeSnapshot;
};

export type CanvasDraftNodeDeleteOperation = CanvasDraftOperationBase & {
  type: "node.delete";
  nodeId: string;
};

export type CanvasDraftEdgeUpsertOperation = CanvasDraftOperationBase & {
  type: "edge.upsert";
  edgeId: string;
  value: CanvasGraphEdgeSnapshot;
};

export type CanvasDraftEdgeDeleteOperation = CanvasDraftOperationBase & {
  type: "edge.delete";
  edgeId: string;
};

export type CanvasDraftTargetSetOperation = CanvasDraftOperationBase & {
  type: "target.set";
  nodeId: string | null;
};

export type CanvasDraftMarkersSetOperation = CanvasDraftOperationBase & {
  type: "markers.set";
  value: CanvasMarkerSnapshot[];
};

export type CanvasDraftAddedObjectsSetOperation = CanvasDraftOperationBase & {
  type: "added-objects.set";
  value: CanvasAddedObjectSnapshot[];
};

export type CanvasDraftSketchLinesSetOperation = CanvasDraftOperationBase & {
  type: "sketch-lines.set";
  value: CanvasSketchLineSnapshot[];
};

export type CanvasDraftSketchGroupsSetOperation = CanvasDraftOperationBase & {
  type: "sketch-groups.set";
  value: CanvasSketchGroupSnapshot[];
};

export type CanvasDraftPenStrokesSetOperation = CanvasDraftOperationBase & {
  type: "pen-strokes.set";
  value: CanvasPenStrokeSnapshot[];
};

export type CanvasDraftPenSettingsSetOperation = CanvasDraftOperationBase & {
  type: "pen-settings.set";
  value: CanvasPenSettingsSnapshot;
};

export type CanvasDraftCameraSetOperation = CanvasDraftOperationBase & {
  type: "camera.set";
  value: CanvasCameraState;
};

export type CanvasDraftOperation =
  | CanvasDraftNodeUpsertOperation
  | CanvasDraftNodeDeleteOperation
  | CanvasDraftEdgeUpsertOperation
  | CanvasDraftEdgeDeleteOperation
  | CanvasDraftTargetSetOperation
  | CanvasDraftMarkersSetOperation
  | CanvasDraftAddedObjectsSetOperation
  | CanvasDraftSketchLinesSetOperation
  | CanvasDraftSketchGroupsSetOperation
  | CanvasDraftPenStrokesSetOperation
  | CanvasDraftPenSettingsSetOperation
  | CanvasDraftCameraSetOperation;

export type CanvasDraftCheckpoint = {
  document: CanvasSnapshotDocument;
  documentHash: string;
  createdAt: string;
};

export function applyCanvasDraftOperations(
  document: CanvasSnapshotDocument,
  operations: CanvasDraftOperation[],
) {
  const nextDocument = coerceCanvasSnapshotDocument(document);
  const nodes = new Map(nextDocument.graph.nodes.map((node) => [node.id, node]));
  const edges = new Map(nextDocument.graph.edges.map((edge) => [edge.id, edge]));
  let activeGenerationTargetId = nextDocument.graph.activeGenerationTargetId;

  const sortedOperations = [...operations].sort((left, right) => left.sequence - right.sequence);

  for (const operation of sortedOperations) {
    switch (operation.type) {
      case "node.upsert":
        nodes.set(operation.nodeId, operation.value);
        break;
      case "node.delete":
        nodes.delete(operation.nodeId);
        if (activeGenerationTargetId === operation.nodeId) {
          activeGenerationTargetId = null;
        }
        for (const [edgeId, edge] of edges.entries()) {
          if (edge.sourceId === operation.nodeId || edge.targetId === operation.nodeId) {
            edges.delete(edgeId);
          }
        }
        break;
      case "edge.upsert":
        edges.set(operation.edgeId, operation.value);
        break;
      case "edge.delete":
        edges.delete(operation.edgeId);
        break;
      case "target.set":
        activeGenerationTargetId = operation.nodeId;
        break;
      case "markers.set":
        nextDocument.markers = operation.value;
        break;
      case "added-objects.set":
        nextDocument.addedObjects = operation.value;
        break;
      case "sketch-lines.set":
        nextDocument.sketchLines = operation.value;
        break;
      case "sketch-groups.set":
        nextDocument.sketchGroups = operation.value;
        break;
      case "pen-strokes.set":
        nextDocument.penStrokes = operation.value;
        break;
      case "pen-settings.set":
        nextDocument.penSettings = operation.value;
        break;
      case "camera.set":
        nextDocument.camera = operation.value;
        break;
      default:
        break;
    }
  }

  return {
    ...nextDocument,
    graph: {
      ...nextDocument.graph,
      nodes: [...nodes.values()],
      edges: [...edges.values()],
      activeGenerationTargetId,
    },
  } satisfies CanvasSnapshotDocument;
}

function shallowNodeEqual(
  left: CanvasGraphNodeSnapshot | undefined,
  right: CanvasGraphNodeSnapshot | undefined,
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function shallowEdgeEqual(
  left: CanvasGraphEdgeSnapshot | undefined,
  right: CanvasGraphEdgeSnapshot | undefined,
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function shallowArrayEqual(left: unknown, right: unknown) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function shallowCameraEqual(left: CanvasCameraState, right: CanvasCameraState) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function buildCanvasDraftOperations(params: {
  previousDocument: CanvasSnapshotDocument;
  nextDocument: CanvasSnapshotDocument;
  projectId: string;
  tabId: string;
  baseRevision: number | null;
  sequenceStart: number;
}) {
  let nextSequence = params.sequenceStart;
  const createdAt = new Date().toISOString();
  const operations: CanvasDraftOperation[] = [];
  const previousNodes = new Map(
    params.previousDocument.graph.nodes.map((node) => [node.id, node]),
  );
  const nextNodes = new Map(
    params.nextDocument.graph.nodes.map((node) => [node.id, node]),
  );
  const previousEdges = new Map(
    params.previousDocument.graph.edges.map((edge) => [edge.id, edge]),
  );
  const nextEdges = new Map(
    params.nextDocument.graph.edges.map((edge) => [edge.id, edge]),
  );

  const createBase = (): CanvasDraftOperationBase => ({
    operationId:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `draft-op-${Date.now()}-${nextSequence + 1}`,
    projectId: params.projectId,
    tabId: params.tabId,
    sequence: ++nextSequence,
    createdAt,
    baseRevision: params.baseRevision,
  });

  for (const [nodeId, node] of previousNodes.entries()) {
    if (!nextNodes.has(nodeId)) {
      operations.push({
        ...createBase(),
        type: "node.delete",
        nodeId,
      });
    }
  }

  for (const [nodeId, node] of nextNodes.entries()) {
    if (!shallowNodeEqual(previousNodes.get(nodeId), node)) {
      operations.push({
        ...createBase(),
        type: "node.upsert",
        nodeId,
        value: node,
      });
    }
  }

  for (const [edgeId] of previousEdges.entries()) {
    if (!nextEdges.has(edgeId)) {
      operations.push({
        ...createBase(),
        type: "edge.delete",
        edgeId,
      });
    }
  }

  for (const [edgeId, edge] of nextEdges.entries()) {
    if (!shallowEdgeEqual(previousEdges.get(edgeId), edge)) {
      operations.push({
        ...createBase(),
        type: "edge.upsert",
        edgeId,
        value: edge,
      });
    }
  }

  if (
    params.previousDocument.graph.activeGenerationTargetId !==
    params.nextDocument.graph.activeGenerationTargetId
  ) {
    operations.push({
      ...createBase(),
      type: "target.set",
      nodeId: params.nextDocument.graph.activeGenerationTargetId,
    });
  }

  if (!shallowArrayEqual(params.previousDocument.markers, params.nextDocument.markers)) {
    operations.push({
      ...createBase(),
      type: "markers.set",
      value: params.nextDocument.markers,
    });
  }

  if (!shallowArrayEqual(params.previousDocument.addedObjects, params.nextDocument.addedObjects)) {
    operations.push({
      ...createBase(),
      type: "added-objects.set",
      value: params.nextDocument.addedObjects,
    });
  }

  if (!shallowArrayEqual(params.previousDocument.sketchLines, params.nextDocument.sketchLines)) {
    operations.push({
      ...createBase(),
      type: "sketch-lines.set",
      value: params.nextDocument.sketchLines,
    });
  }

  if (!shallowArrayEqual(params.previousDocument.sketchGroups, params.nextDocument.sketchGroups)) {
    operations.push({
      ...createBase(),
      type: "sketch-groups.set",
      value: params.nextDocument.sketchGroups,
    });
  }

  if (!shallowArrayEqual(params.previousDocument.penStrokes, params.nextDocument.penStrokes)) {
    operations.push({
      ...createBase(),
      type: "pen-strokes.set",
      value: params.nextDocument.penStrokes,
    });
  }

  if (!shallowArrayEqual(params.previousDocument.penSettings, params.nextDocument.penSettings)) {
    operations.push({
      ...createBase(),
      type: "pen-settings.set",
      value: params.nextDocument.penSettings ?? {
        color: "#000000",
        opacity: 1,
        strokeWidth: 10,
        drawingMode: "freehand",
        geometryShape: "rectangle",
      },
    });
  }

  if (!shallowCameraEqual(params.previousDocument.camera, params.nextDocument.camera)) {
    operations.push({
      ...createBase(),
      type: "camera.set",
      value: params.nextDocument.camera,
    });
  }

  return {
    operations,
    nextSequence,
  };
}
