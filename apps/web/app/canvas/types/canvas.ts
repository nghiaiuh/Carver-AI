/*
 * Shared canvas domain types.
 * All types that were previously embedded in CanvasWorkspace.tsx live here
 * so they can be imported by hooks, panels, and widgets without creating
 * a dependency on the component itself.
 */

// ImageHandlePosition and ImageConnectionRole are defined here (not in imageGraph.ts)
// to avoid a circular dependency: canvas.ts ← imageGraph.ts ← canvas.ts
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

// ── Tool & Selection ──────────────────────────────────────────────────────────

export type EditorTool =
  | "select"
  | "pen"
  | "eraser"
  | "mark-position"
  | "add-source"
  | "grid"
  | "text-note"
  | "add-object"
  | "generate"
  | "edit-elements"
  | "move-object"
  | "region";

export type RegionBrushMode = "add" | "subtract";
export type RegionSelectionTool = "brush" | "lasso";

export type SelectedItem =
  | { type: "none" }
  | { type: "image"; id: string; menu?: { x: number; y: number } }
  | { type: "reference"; id: string }
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
};



export type AddedObject = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  label: string;
  selectedAssetIds?: string[];
};

// ── Pen / Sketch ──────────────────────────────────────────────────────────────

export type SketchPoint = {
  x: number;
  y: number;
};

export type PenSettings = {
  color: string;
  opacity: number;
  strokeWidth: number;
};

export type PenStrokeObject = {
  id: string;
  type: "pen-stroke";
  points: SketchPoint[];
  color: string;
  opacity: number;
  strokeWidth: number;
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

export type CanvasNode = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  groupId?: string;
  scale?: number;
  imageUrl: string;
  sourceImage?: {
    url: string;
    width: number | null;
    height: number | null;
    mimeType?: string;
    sizeBytes?: number;
    name?: string;
    quality: "original";
  };
  title: string;
  prompt: string | null;
  role: "layout" | "style" | "material" | "object" | "mask" | "reference" | "output";
  model?: string;
  createdAt?: string;
  /** Ordered input ports for this node. */
  inputPorts: InputPort[];
  /** Region brush mask */
  regionMask?: MaskData;
  maskHistory?: MaskHistory;
};

export type CanvasEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  /** Which input port on the target node this edge connects to. */
  targetPortId: string;
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

export type LeftSidebarPanelId = "library" | "adjust-render";

// ── Constants ─────────────────────────────────────────────────────────────────

export const DEFAULT_CANVAS_THEME = "#F5F5F5";

export const DEFAULT_PEN_SETTINGS: PenSettings = {
  color: "#000000",
  opacity: 1,
  strokeWidth: 10,
};

export const LEFT_SIDEBAR_PANEL_LABELS: Record<LeftSidebarPanelId, string> = {
  library: "Library",
  "adjust-render": "Adjust render",
};

export const DEFAULT_LEFT_SIDEBAR_WIDTH = 304;
export const MIN_LEFT_SIDEBAR_WIDTH = 240;
export const MAX_LEFT_SIDEBAR_WIDTH = 480;
export const DEFAULT_RIGHT_PANEL_WIDTH = 380;
export const MIN_RIGHT_PANEL_WIDTH = 320;
export const MAX_RIGHT_PANEL_WIDTH = 560;
export const LEFT_SIDEBAR_WIDTH_STORAGE_KEY = "carver-ai:left-sidebar-width";
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
