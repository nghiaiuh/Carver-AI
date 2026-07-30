/*
 * Flow: Defines the canonical canvas snapshot document.
 * 1. Capture the canvas state that AI and versioning depend on.
 * 2. Keep spatial locks and reference roles serializable.
 * 3. Provide a single source of truth for snapshot-shaped JSON.
 */

export type SerializableJson =
  | string
  | number
  | boolean
  | null
  | SerializableJson[]
  | { [key: string]: SerializableJson | undefined };

export type CanvasReferenceRole =
  | "direct_edit_target"
  | "layout_reference"
  | "style_reference"
  | "material_reference"
  | "plant_reference"
  | "architecture_reference"
  | "generic_reference";

export type SpatialLockStrength = "hard" | "soft";

export type SpatialLockType =
  | "layout"
  | "position"
  | "scale"
  | "perspective"
  | "camera"
  | "shape"
  | "region";

export type CanvasBoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CanvasPoint = {
  x: number;
  y: number;
};

export type SpatialLock = {
  id: string;
  targetType: "object" | "region" | "camera" | "global";
  targetId?: string;
  type: SpatialLockType;
  strength: SpatialLockStrength;
  reason?: string;
};

export type CanvasReferenceImage = {
  assetId?: string;
  label: string;
  role: CanvasReferenceRole;
  objectId?: string;
  regionId?: string;
  notes?: string;
};

export type CanvasCameraState = {
  angle?: string;
  perspective?: string;
  zoom?: number;
};

export type CanvasSelectionState = {
  objectIds: string[];
  regionIds: string[];
  activeAssetIds: string[];
};

export type CanvasAssetPlacement = {
  id: string;
  assetId?: string;
  kind: string;
  bounds?: CanvasBoundingBox;
  rotation?: number;
  label?: string;
  metadata?: { [key: string]: SerializableJson | undefined };
};

export type CanvasRegion = {
  id: string;
  label: string;
  bounds?: CanvasBoundingBox;
  polygon?: CanvasPoint[];
  maskAssetId?: string;
  editable?: boolean;
  metadata?: { [key: string]: SerializableJson | undefined };
};

export type CanvasGraphSourceImage = {
  assetId?: string;
  url?: string;
  width?: number | null;
  height?: number | null;
  mimeType?: string;
  sizeBytes?: number;
  name?: string;
  quality?: "original";
};

export type CanvasMaskDataSnapshot = {
  width: number;
  height: number;
  dataUrl: string;
  selectionRatio: number;
  updatedAt: number;
};

export type CanvasMaskHistorySnapshot = {
  past: Array<CanvasMaskDataSnapshot | null>;
  future: Array<CanvasMaskDataSnapshot | null>;
};

export type CanvasGraphPresetChild = {
  id: string;
  slot: string;
  label: string;
  imageSrc: string;
  prompt?: string | null;
  order: number;
  assetId?: string;
  sourceFolderId?: string;
  sourceImage?: CanvasGraphSourceImage;
  metadata?: { [key: string]: SerializableJson | undefined };
};

export type CanvasGraphNodeSnapshot = {
  id: string;
  kind: "image" | "presetGroup";
  title: string;
  role: string;
  imageUrl: string;
  prompt?: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  scale?: number;
  sourceImage?: CanvasGraphSourceImage;
  regionMask?: CanvasMaskDataSnapshot;
  maskHistory?: CanvasMaskHistorySnapshot;
  presetGroup?: {
    category: string;
    activeChildId?: string | null;
    sourceFolderId?: string;
    children: CanvasGraphPresetChild[];
  };
};

export type CanvasGraphEdgeSnapshot = {
  id: string;
  sourceId: string;
  targetId: string;
  kind?: "text" | "image";
  targetPortId: string;
  targetPresetChildId?: string | null;
  sourcePresetChildId?: string | null;
  label: string;
  role?: CanvasReferenceRole | string;
  fromHandle?: "left" | "right";
  toHandle?: "left" | "right";
  createdAt?: string;
};

export type CanvasGraphSnapshot = {
  nodes: CanvasGraphNodeSnapshot[];
  edges: CanvasGraphEdgeSnapshot[];
  activeGenerationTargetId: string | null;
};

export type CanvasMarkerSnapshot = {
  id: string;
  x: number;
  y: number;
  label: string;
  targetNodeId?: string;
};

export type CanvasAddedObjectSnapshot = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  label: string;
  targetNodeId?: string;
  selectedAssetIds?: string[];
};

export type CanvasSketchPointSnapshot = {
  x: number;
  y: number;
};

export type CanvasPenStrokeSnapshot = {
  id: string;
  type: "pen-stroke";
  points: CanvasSketchPointSnapshot[];
  color: string;
  opacity: number;
  strokeWidth: number;
  createdAt: string;
};

export type CanvasSketchLineSnapshot = {
  id: string;
  points: CanvasSketchPointSnapshot[];
  color: string;
  width: number;
  groupId?: string;
};

export type CanvasSketchGroupSnapshot = {
  id: string;
  nameTag: string;
  objectType: string;
  lineIds: string[];
  bounds: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  selectedAssetIds: string[];
};

export const CURRENT_CANVAS_SNAPSHOT_SCHEMA = "carver-canvas-v4";
export const CURRENT_CANVAS_SNAPSHOT_SCHEMA_VERSION = 4;
export const CURRENT_CANVAS_SNAPSHOT_VERSION = 4;

export type CanvasSnapshotDocument = {
  schema: typeof CURRENT_CANVAS_SNAPSHOT_SCHEMA;
  schemaVersion: typeof CURRENT_CANVAS_SNAPSHOT_SCHEMA_VERSION;
  snapshotVersion: typeof CURRENT_CANVAS_SNAPSHOT_VERSION;
  backgroundAssetId?: string;
  camera: CanvasCameraState;
  objects: CanvasAssetPlacement[];
  regions: CanvasRegion[];
  locks: SpatialLock[];
  references: CanvasReferenceImage[];
  selection: CanvasSelectionState;
  graph: CanvasGraphSnapshot;
  markers: CanvasMarkerSnapshot[];
  addedObjects: CanvasAddedObjectSnapshot[];
  sketchLines: CanvasSketchLineSnapshot[];
  sketchGroups: CanvasSketchGroupSnapshot[];
  penStrokes: CanvasPenStrokeSnapshot[];
  metadata: { [key: string]: SerializableJson | undefined };
};

export const createEmptyCanvasSnapshotDocument = (): CanvasSnapshotDocument => ({
  schema: CURRENT_CANVAS_SNAPSHOT_SCHEMA,
  schemaVersion: CURRENT_CANVAS_SNAPSHOT_SCHEMA_VERSION,
  snapshotVersion: CURRENT_CANVAS_SNAPSHOT_VERSION,
  camera: {},
  objects: [],
  regions: [],
  locks: [],
  references: [],
  selection: {
    objectIds: [],
    regionIds: [],
    activeAssetIds: [],
  },
  graph: {
    nodes: [],
    edges: [],
    activeGenerationTargetId: null,
  },
  markers: [],
  addedObjects: [],
  sketchLines: [],
  sketchGroups: [],
  penStrokes: [],
  metadata: {},
});

export const isCanvasSnapshotDocument = (value: unknown): value is CanvasSnapshotDocument => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const snapshot = value as Partial<CanvasSnapshotDocument>;
  return (
    snapshot.schema === CURRENT_CANVAS_SNAPSHOT_SCHEMA &&
    snapshot.schemaVersion === CURRENT_CANVAS_SNAPSHOT_SCHEMA_VERSION &&
    snapshot.snapshotVersion === CURRENT_CANVAS_SNAPSHOT_VERSION
  );
};

export const coerceCanvasSnapshotDocument = (value: unknown): CanvasSnapshotDocument => {
  if (isCanvasSnapshotDocument(value)) {
    return value;
  }

  const fallback = createEmptyCanvasSnapshotDocument();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }

  const legacy = value as {
    schema?: string;
    schemaVersion?: number;
    snapshotVersion?: number;
    backgroundAssetId?: string;
    camera?: CanvasCameraState;
    objects?: CanvasAssetPlacement[];
    regions?: CanvasRegion[];
    locks?: SpatialLock[];
    references?: CanvasReferenceImage[];
    selection?: Partial<CanvasSelectionState>;
    graph?: Partial<CanvasGraphSnapshot>;
    markers?: CanvasMarkerSnapshot[];
    addedObjects?: CanvasAddedObjectSnapshot[];
    sketchLines?: CanvasSketchLineSnapshot[];
    sketchGroups?: CanvasSketchGroupSnapshot[];
    penStrokes?: CanvasPenStrokeSnapshot[];
    metadata?: { [key: string]: SerializableJson | undefined };
  };

  return {
    ...fallback,
    schema: CURRENT_CANVAS_SNAPSHOT_SCHEMA,
    schemaVersion: CURRENT_CANVAS_SNAPSHOT_SCHEMA_VERSION,
    snapshotVersion: CURRENT_CANVAS_SNAPSHOT_VERSION,
    backgroundAssetId: legacy.backgroundAssetId,
    camera: legacy.camera ?? fallback.camera,
    objects: legacy.objects ?? fallback.objects,
    regions: legacy.regions ?? fallback.regions,
    locks: legacy.locks ?? fallback.locks,
    references: legacy.references ?? fallback.references,
    selection: {
      objectIds: legacy.selection?.objectIds ?? fallback.selection.objectIds,
      regionIds: legacy.selection?.regionIds ?? fallback.selection.regionIds,
      activeAssetIds: legacy.selection?.activeAssetIds ?? fallback.selection.activeAssetIds,
    },
    graph: {
      nodes: Array.isArray(legacy.graph?.nodes) ? legacy.graph.nodes : fallback.graph.nodes,
      edges: Array.isArray(legacy.graph?.edges) ? legacy.graph.edges : fallback.graph.edges,
      activeGenerationTargetId:
        typeof legacy.graph?.activeGenerationTargetId === "string"
          ? legacy.graph.activeGenerationTargetId
          : fallback.graph.activeGenerationTargetId,
    },
    markers: Array.isArray(legacy.markers) ? legacy.markers : fallback.markers,
    addedObjects: Array.isArray(legacy.addedObjects) ? legacy.addedObjects : fallback.addedObjects,
    sketchLines: Array.isArray(legacy.sketchLines) ? legacy.sketchLines : fallback.sketchLines,
    sketchGroups: Array.isArray(legacy.sketchGroups) ? legacy.sketchGroups : fallback.sketchGroups,
    penStrokes: Array.isArray(legacy.penStrokes) ? legacy.penStrokes : fallback.penStrokes,
    metadata: legacy.metadata ?? {
      legacyCanvas: value as SerializableJson,
    },
  };
};
