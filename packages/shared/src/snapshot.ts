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

export type CanvasSnapshotDocument = {
  schema: "carver-canvas-v2";
  snapshotVersion: 2;
  backgroundAssetId?: string;
  camera: CanvasCameraState;
  objects: CanvasAssetPlacement[];
  regions: CanvasRegion[];
  locks: SpatialLock[];
  references: CanvasReferenceImage[];
  selection: CanvasSelectionState;
  metadata: { [key: string]: SerializableJson | undefined };
};

export const createEmptyCanvasSnapshotDocument = (): CanvasSnapshotDocument => ({
  schema: "carver-canvas-v2",
  snapshotVersion: 2,
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
  metadata: {},
});

export const isCanvasSnapshotDocument = (value: unknown): value is CanvasSnapshotDocument => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return false;
  }

  const snapshot = value as Partial<CanvasSnapshotDocument>;
  return snapshot.schema === "carver-canvas-v2" && snapshot.snapshotVersion === 2;
};

export const coerceCanvasSnapshotDocument = (value: unknown): CanvasSnapshotDocument => {
  if (isCanvasSnapshotDocument(value)) {
    return value;
  }

  const fallback = createEmptyCanvasSnapshotDocument();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return fallback;
  }

  return {
    ...fallback,
    metadata: {
      legacyCanvas: value as SerializableJson,
    },
  };
};
