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
  | "draw-region"
  | "lock-area"
  | "text-note"
  | "add-object"
  | "generate"
  | "edit-elements"
  | "move-object";

export type SelectedItem =
  | { type: "none" }
  | { type: "image"; id: string; menu?: { x: number; y: number } }
  | { type: "reference"; id: string }
  | { type: "marker"; id: string }
  | { type: "region"; id: string }
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

export type Region = {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  kind: "editable" | "locked";
  selectedAssetIds?: string[];
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

// ── Canvas Graph (Nodes & Edges) ──────────────────────────────────────────────

export type CanvasNode = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
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
};

export type CanvasEdge = {
  id: string;
  sourceId: string;
  targetId: string;
  label: string;
  fromHandle?: ImageHandlePosition;
  toHandle?: ImageHandlePosition;
  role?: ImageConnectionRole;
  createdAt?: string;
};

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
