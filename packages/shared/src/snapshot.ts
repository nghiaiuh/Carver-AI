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
  url: string;
  width?: number | null;
  height?: number | null;
  mimeType?: string;
  sizeBytes?: number;
  name?: string;
  quality?: "original";
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

export type CanvasSnapshotDocument = {
  schema: "carver-canvas-v3";
  snapshotVersion: 3;
  backgroundAssetId?: string;
  camera: CanvasCameraState;
  objects: CanvasAssetPlacement[];
  regions: CanvasRegion[];
  locks: SpatialLock[];
  references: CanvasReferenceImage[];
  selection: CanvasSelectionState;
  graph: CanvasGraphSnapshot;
  metadata: { [key: string]: SerializableJson | undefined };
};

export const createEmptyCanvasSnapshotDocument = (): CanvasSnapshotDocument => ({
  schema: "carver-canvas-v3",
  snapshotVersion: 3,
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
  metadata: {},
});

export const isCanvasSnapshotDocument = (value: unknown): value is CanvasSnapshotDocument => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const snapshot = value as Partial<CanvasSnapshotDocument>;
  return snapshot.schema === "carver-canvas-v3" && snapshot.snapshotVersion === 3;
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
    snapshotVersion?: number;
    backgroundAssetId?: string;
    camera?: CanvasCameraState;
    objects?: CanvasAssetPlacement[];
    regions?: CanvasRegion[];
    locks?: SpatialLock[];
    references?: CanvasReferenceImage[];
    selection?: Partial<CanvasSelectionState>;
    metadata?: { [key: string]: SerializableJson | undefined };
  };

  return {
    ...fallback,
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
    metadata: legacy.metadata ?? {
      legacyCanvas: value as SerializableJson,
    },
  };
};
