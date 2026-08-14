import type { ImageGeneratorAspectRatio } from "@carver/shared";

/*
 * Shared canvas domain types.
 * All types that were previously embedded in CanvasWorkspace.tsx live here
 * so they can be imported by hooks, panels, and widgets without creating
 * a dependency on the component itself.
 */

// ImageHandlePosition and ImageConnectionRole are defined here (not in canvasConnectionGeometry.ts)
// to avoid a circular dependency: canvas.ts ← canvasConnectionGeometry.ts ← canvas.ts
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

export type CanvasConnectionKind = "text" | "image";

// ── Tool & Selection ──────────────────────────────────────────────────────────

export type EditorTool =
  | "select"
  | "pen"
  | "eraser"
  | "assistant"
  | "mark-position"
  | "add-source"
  | "grid"
  | "text-note"
  | "add-object"
  | "generate"
  | "edit-elements"
  | "cut"
  | "connection"
  | "move-object"
  | "region";

export type RegionBrushMode = "add" | "subtract";
export type RegionSelectionTool = "brush" | "lasso";

export type SelectedItem =
  | { type: "none" }
  | { type: "image"; id: string; menu?: { x: number; y: number } }
  | { type: "reference"; id: string }
  | { type: "presetChild"; nodeId: string; childId: string }
  | { type: "marker"; id: string }
  | { type: "object"; id: string }
  | { type: "sketchLine"; id: string }
  | { type: "sketchGroup"; id: string }
  | { type: "pen-stroke"; id: string }
  | { type: "libraryAsset"; id: string }
  | { type: "node"; id: string; menu?: { x: number; y: number } }
  | { type: "edge"; id: string };

// ── Canvas Entities ───────────────────────────────────────────────────────────

export type Marker = {
  id: string;
  x: number;
  y: number;
  label: string;
  targetNodeId?: string;
};



export type AddedObject = {
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

// ── Pen / Sketch ──────────────────────────────────────────────────────────────

export type SketchPoint = {
  x: number;
  y: number;
};

export type PenGeometryShape = "rectangle" | "square" | "circle" | "triangle" | "arrow" | "line";

export type PenDrawingMode = "freehand" | "geometry";

export type PenSettings = {
  color: string;
  opacity: number;
  strokeWidth: number;
  drawingMode: PenDrawingMode;
  geometryShape: PenGeometryShape;
};

export type PenStrokeObject = {
  id: string;
  type: "pen-stroke";
  points: SketchPoint[];
  color: string;
  opacity: number;
  strokeWidth: number;
  /** Geometry strokes store their drag start/end points and render as primitives. */
  drawingMode?: PenDrawingMode;
  geometryShape?: PenGeometryShape;
  createdAt: string;
};

export type SketchLine = {
  id: string;
  points: SketchPoint[];
  color: string;
  width: number;
  groupId?: string;
};

// ── Library Assets ────────────────────────────────────────────────────────────

export type LibraryAssetCategory =
  | "plant"
  | "stone"
  | "rockery"
  | "water"
  | "hardscape"
  | "unknown";

export type LibraryAsset = {
  id: string;
  name: string;
  category: LibraryAssetCategory;
  tags: string[];
  imageUrl: string;
  sourceType: "project" | "saved";
  savedAt: string;
};

// ── Sketch Groups ─────────────────────────────────────────────────────────────

export type SketchGroup = {
  id: string;
  nameTag: string;
  objectType: LibraryAssetCategory;
  lineIds: string[];
  bounds: {
    x: number;
    y: number;
    w: number;
    h: number;
  };
  selectedAssetIds: string[];
};

// ── Masks ─────────────────────────────────────────────────────────────────────

export type MaskData = {
  width: number;
  height: number;
  dataUrl: string;
  selectionRatio: number;
  updatedAt: number;
};

export type MaskHistory = {
  past: (MaskData | undefined)[];
  future: (MaskData | undefined)[];
};

export type CanvasSourceImage = {
  assetId?: string;
  url: string;
  width: number | null;
  height: number | null;
  mimeType?: string;
  sizeBytes?: number;
  name?: string;
  quality: "original";
};

export type PresetGroupCategory =
  | "environment"
  | "material"
  | "garden-styles"
  | "plants"
  | "water-features"
  | "hardscape"
  | "rocks-terrain"
  | "decor"
  | "lighting"
  | "planting-zones";

export type CanvasPresetChild = {
  id: string;
  slot: string;
  label: string;
  imageSrc: string;
  prompt: string | null;
  order: number;
  assetId?: string;
  sourceFolderId?: string;
  sourceImage?: CanvasSourceImage;
  createdAt?: string;
  updatedAt?: string;
  metadata?: {
    notes?: string;
    roleHint?: ImageConnectionRole;
    [key: string]: string | number | boolean | null | undefined;
  };
};

export type CanvasPresetGroup = {
  category: PresetGroupCategory;
  activeChildId: string | null;
  children: CanvasPresetChild[];
  sourceFolderId?: string;
};

// ── Canvas Graph (Nodes & Edges) ──────────────────────────────────────────────

/**
 * Named input port on a canvas node.
 * Ports are intentionally generic: every connection is treated as an image input.
 * The stable `index` determines ordering in AI payloads.
 */
export type InputPort = {
  id: string;            // e.g. "port-img-0"
  index: number;         // 0-based, stable ordering — never changes once created
  label: string;         // "Image 1", "Image 2", etc. (1-based for display)
};

/** Max input ports per node. One shared image-input model keeps the UX simple. */
export const MAX_INPUT_PORTS_PER_NODE = 5;

type CanvasNodeBase = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  groupId?: string;
  scale?: number;
  imageUrl: string;
  sourceImage?: CanvasSourceImage;
  title: string;
  prompt: string | null;
  role:
    | "layout"
    | "style"
    | "material"
    | "object"
    | "mask"
    | "reference"
    | "output"
    | "assistant"
    | "text"
    | "generator";
  model?: string;
  createdAt?: string;
  /** Ordered input ports for this node. */
  inputPorts: InputPort[];
  /** Region brush mask */
  regionMask?: MaskData;
  maskHistory?: MaskHistory;
};

export type CanvasAssistantOutputFormat = "list" | "text";
export type CanvasImageGeneratorAspectRatio = ImageGeneratorAspectRatio;
export type CanvasImageGeneratorStatus =
  | "idle"
  | "queued"
  | "generating"
  | "completed"
  | "error";

export type CanvasImageGeneratorOutput = {
  assetId?: string;
  title: string;
  prompt: string;
  imageUrl: string;
  width: number | null;
  height: number | null;
  mimeType?: string;
  provider?: string;
};

export type CanvasAssistantState = {
  mode: "prompt" | "result";
  prompt: string;
  response: string;
  model: string;
  outputFormat: CanvasAssistantOutputFormat;
  status: "idle" | "generating" | "completed" | "error";
  errorMessage?: string;
  lastRunAt?: string;
  lastUsedContextSummary?: string;
};

export type CanvasTextNodeState = {
  content: string;
};

export type CanvasImageGeneratorState = {
  prompt: string;
  model: "auto" | string;
  aspectRatio: CanvasImageGeneratorAspectRatio;
  outputCount: number;
  status: CanvasImageGeneratorStatus;
  outputAssetIds: string[];
  outputs: CanvasImageGeneratorOutput[];
  selectedOutputAssetId?: string;
  errorMessage?: string;
  lastRunAt?: string;
  activeJobId?: string;
};

export type CanvasImageOutputGalleryState = {
  generatorNodeId: string;
  selectedOutputAssetId?: string;
};

export type CanvasImageNode = CanvasNodeBase & {
  kind?: "image";
  presetGroup?: never;
  assistant?: never;
};

export type CanvasPresetGroupNode = CanvasNodeBase & {
  kind: "presetGroup";
  presetGroup: CanvasPresetGroup;
  assistant?: never;
};

export type CanvasAssistantNode = CanvasNodeBase & {
  kind: "assistant";
  assistant: CanvasAssistantState;
  presetGroup?: never;
  text?: never;
  imageGenerator?: never;
};

export type CanvasTextNode = CanvasNodeBase & {
  kind: "text";
  text: CanvasTextNodeState;
  presetGroup?: never;
  assistant?: never;
  imageGenerator?: never;
};

export type CanvasImageGeneratorNode = CanvasNodeBase & {
  kind: "image-generator";
  imageGenerator: CanvasImageGeneratorState;
  presetGroup?: never;
  assistant?: never;
  text?: never;
};

export type CanvasImageOutputGalleryNode = CanvasNodeBase & {
  kind: "image-output-gallery";
  imageOutputGallery: CanvasImageOutputGalleryState;
  presetGroup?: never;
  assistant?: never;
  text?: never;
  imageGenerator?: never;
};

export type CanvasNode =
  | CanvasImageNode
  | CanvasPresetGroupNode
  | CanvasAssistantNode
  | CanvasTextNode
  | CanvasImageGeneratorNode
  | CanvasImageOutputGalleryNode;

export function isCanvasTextNode(node: CanvasNode): node is CanvasTextNode {
  return node.kind === "text";
}

export function isCanvasImageGeneratorNode(node: CanvasNode): node is CanvasImageGeneratorNode {
  return node.kind === "image-generator";
}

export function isCanvasImageOutputGalleryNode(node: CanvasNode): node is CanvasImageOutputGalleryNode {
  return node.kind === "image-output-gallery";
}

export type CanvasEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  kind?: CanvasConnectionKind;
  /** Stable semantic output port on the source node, when the node defines one. */
  sourcePortId?: string;
  /** Which input port on the target node this edge connects to. */
  targetPortId: string;
  targetPresetChildId?: string | null;
  /** Set when the source is a specific preset child thumbnail. */
  sourcePresetChildId?: string | null;
  label: string;
  fromHandle?: ImageHandlePosition;
  toHandle?: ImageHandlePosition;
  role?: ImageConnectionRole;
  createdAt?: string;
};

// ── Port Helpers ──────────────────────────────────────────────────────────────

/**
 * Generate the full set of input ports for a node.
 * All nodes use the same generic image-input ports.
 */
export function getDefaultInputPorts(): InputPort[] {
  const max = MAX_INPUT_PORTS_PER_NODE;
  return Array.from({ length: max }, (_, i) => ({
    id: `port-img-${i}`,
    index: i,
    label: `Image ${i + 1}`,
  }));
}

/**
 * Compute which ports should be rendered in the UI (Q1 resolution).
 * Returns: all ports that have an inbound edge + the first empty port (if any
 * remain under maxPorts). If all ports are connected, no empty slot is shown.
 */
export function getVisibleInputPorts(
  ports: InputPort[],
  edges: CanvasEdge[],
  nodeId: string,
): InputPort[] {
  const safePorts = ports || getDefaultInputPorts();
  const connectedPortIds = new Set(
    edges
      .filter((e) => e.targetId === nodeId)
      .map((e) => e.targetPortId),
  );
  const connected = safePorts.filter((p) => connectedPortIds.has(p.id));
  const firstEmpty = safePorts.find((p) => !connectedPortIds.has(p.id));
  if (firstEmpty) {
    return [...connected, firstEmpty].sort((a, b) => a.index - b.index);
  }
  return connected.sort((a, b) => a.index - b.index);
}

// ── UI Layout ─────────────────────────────────────────────────────────────────

// ── Constants ─────────────────────────────────────────────────────────────────

export const DEFAULT_CANVAS_THEME = "#F5F5F5";
export const DEFAULT_ASSISTANT_NODE_WIDTH = 540;
export const DEFAULT_ASSISTANT_NODE_HEIGHT = 520;
export const MIN_ASSISTANT_NODE_WIDTH = 540;
export const MIN_ASSISTANT_NODE_HEIGHT = 520;
export const MAX_ASSISTANT_NODE_WIDTH = 850;
export const MAX_ASSISTANT_NODE_HEIGHT = 800;
export const DEFAULT_IMAGE_GENERATOR_NODE_WIDTH = DEFAULT_ASSISTANT_NODE_WIDTH;
export const DEFAULT_IMAGE_GENERATOR_NODE_HEIGHT = DEFAULT_ASSISTANT_NODE_HEIGHT;
export const MIN_IMAGE_GENERATOR_NODE_WIDTH = MIN_ASSISTANT_NODE_WIDTH;
export const MIN_IMAGE_GENERATOR_NODE_HEIGHT = MIN_ASSISTANT_NODE_HEIGHT;
export const MAX_IMAGE_GENERATOR_NODE_WIDTH = MAX_ASSISTANT_NODE_WIDTH;
export const MAX_IMAGE_GENERATOR_NODE_HEIGHT = MAX_ASSISTANT_NODE_HEIGHT;
export const DEFAULT_IMAGE_OUTPUT_GALLERY_NODE_WIDTH = 300;
export const DEFAULT_IMAGE_OUTPUT_GALLERY_NODE_HEIGHT = 340;
export const MIN_IMAGE_OUTPUT_GALLERY_NODE_WIDTH = 500;
export const MIN_IMAGE_OUTPUT_GALLERY_NODE_HEIGHT = 320;
export const MAX_IMAGE_OUTPUT_GALLERY_NODE_WIDTH = 720;
export const MAX_IMAGE_OUTPUT_GALLERY_NODE_HEIGHT = 560;
export const IMAGE_GENERATOR_MIN_OUTPUT_COUNT = 1;
export const IMAGE_GENERATOR_MAX_OUTPUT_COUNT = 4;

export const DEFAULT_PEN_SETTINGS: PenSettings = {
  color: "#000000",
  opacity: 1,
  strokeWidth: 10,
  drawingMode: "freehand",
  geometryShape: "rectangle",
};

export const DEFAULT_RIGHT_PANEL_WIDTH = 320;
export const MIN_RIGHT_PANEL_WIDTH = 280;
export const MAX_RIGHT_PANEL_WIDTH = 480;
export const RIGHT_PANEL_WIDTH_STORAGE_KEY = "carver-ai:right-panel-width";

// ── Pure Utilities ────────────────────────────────────────────────────────────

export function inferObjectTypeFromTag(nameTag: string): LibraryAssetCategory {
  const normalized = nameTag
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");

  if (/(cay|tung|truc|bonsai|co|fern|plant|tree|shrub|palm)/.test(normalized)) return "plant";
  if (/(da|stone|rock|co thach|limestone)/.test(normalized)) return "stone";
  if (/(hon non bo|non bo|rockery|thac|waterfall)/.test(normalized)) return "rockery";
  if (/(nuoc|water|pond|ho koi|koi)/.test(normalized)) return "water";
  if (/(san|gach|path|paving|hardscape|wall|fence)/.test(normalized)) return "hardscape";

  return "unknown";
}
