/*
 * Flow: Renders one interactive canvas workspace component.
 * 1. Receive canvas state and callbacks from the workspace.
 * 2. Render the focused control, overlay, or board UI.
 * 3. Send user actions back up through typed handlers.
 */

"use client";

import { useRef, useState } from "react";
import { MessageSquare, PanelLeftOpen } from "lucide-react";
import { gsap, useGSAP } from "../../../components/gsapSetup";
import { useCanvasLibrary } from "../../hooks/useCanvasLibrary";
import type { LibraryAsset as CanvasLibraryAsset } from "../../types/library";
import AddObjectMenu from "../panels/AddObjectMenu";
import CanvasBoard from "./CanvasBoard";
import { buildCanvasThemeStyle } from "./canvasTheme";
import EditorLeftSidebar from "../panels/EditorLeftSidebar";
import EditorRightPanel from "../panels/EditorRightPanel";
import GroupNameTagModal from "../panels/GroupNameTagModal";
import MultiAngleModal from "../panels/MultiAngleModal";
import QuickEditModal from "../panels/QuickEditModal";
import RealityCheckPanel from "../panels/RealityCheckPanel";
import ResizeHandle from "../widgets/ResizeHandle";
import useResizablePanel from "../../hooks/useResizablePanel";
import type { ImageConnectionRole, ImageHandlePosition } from "./imageGraph";

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

export type LibraryAssetCategory = "plant" | "stone" | "rockery" | "water" | "hardscape" | "unknown";

export type LibraryAsset = {
  id: string;
  name: string;
  category: LibraryAssetCategory;
  tags: string[];
  imageUrl: string;
  sourceType: "project" | "saved";
  savedAt: string;
};

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

export type LeftSidebarPanelId = "library" | "adjust-render";

const initialMarkers: Marker[] = [{ id: "marker-1", x: 58, y: 56, label: "Place koi pond here" }];
const initialRegions: Region[] = [
  { id: "region-lock-1", x: 9, y: 10, w: 34, h: 19, label: "Keep unchanged", kind: "locked" },
  { id: "region-edit-1", x: 48, y: 58, w: 34, h: 21, label: "Editable Zone", kind: "editable" },
];

const initialNodes: CanvasNode[] = [];
const initialEdges: CanvasEdge[] = [];
const DEFAULT_CANVAS_THEME = "#F5F5F5";
const DEFAULT_PEN_SETTINGS: PenSettings = {
  color: "#000000",
  opacity: 1,
  strokeWidth: 10,
};
const LEFT_SIDEBAR_PANEL_LABELS: Record<LeftSidebarPanelId, string> = {
  library: "Library",
  "adjust-render": "Adjust render",
};
const DEFAULT_LEFT_SIDEBAR_WIDTH = 304;
const MIN_LEFT_SIDEBAR_WIDTH = 240;
const MAX_LEFT_SIDEBAR_WIDTH = 480;
const DEFAULT_RIGHT_PANEL_WIDTH = 380;
const MIN_RIGHT_PANEL_WIDTH = 320;
const MAX_RIGHT_PANEL_WIDTH = 560;
const LEFT_SIDEBAR_WIDTH_STORAGE_KEY = "carver-ai:left-sidebar-width";
const RIGHT_PANEL_WIDTH_STORAGE_KEY = "carver-ai:right-panel-width";

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

export default function CanvasWorkspace() {
  const rootRef = useRef<HTMLDivElement>(null);
  const leftSidebarPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const [selectedItem, setSelectedItem] = useState<SelectedItem>({ type: "none" });
  const [activeTool, setActiveTool] = useState<EditorTool>("select");
  const [gridVisible, setGridVisible] = useState(true);
  const [showQuickEditModal, setShowQuickEditModal] = useState(false);
  const [showMultiAngleModal, setShowMultiAngleModal] = useState(false);
  const [showAddObjectMenu, setShowAddObjectMenu] = useState(false);
  const [showRealityCheckPanel, setShowRealityCheckPanel] = useState(false);
  const [markers, setMarkers] = useState<Marker[]>(initialMarkers);
  const [regions, setRegions] = useState<Region[]>(initialRegions);
  const [addedObjects, setAddedObjects] = useState<AddedObject[]>([
    { id: "object-1", x: 62, y: 58, w: 17, h: 10, rotation: -5, label: "Koi Pond" },
  ]);
  const [sketchLines, setSketchLines] = useState<SketchLine[]>([]);
  const [sketchGroups, setSketchGroups] = useState<SketchGroup[]>([]);
  const [penStrokes, setPenStrokes] = useState<PenStrokeObject[]>([]);
  const [penSettings, setPenSettings] = useState<PenSettings>(DEFAULT_PEN_SETTINGS);
  const [selectedSketchLineIds, setSelectedSketchLineIds] = useState<string[]>([]);
  const [showGroupNameModal, setShowGroupNameModal] = useState(false);
  const [nodes, setNodes] = useState<CanvasNode[]>(initialNodes);
  const [edges, setEdges] = useState<CanvasEdge[]>(initialEdges);
  const [promptText, setPromptText] = useState("");
  const [mockConcepts, setMockConcepts] = useState<string[]>([]);
  const [outputAngles, setOutputAngles] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [activeNodeId, setActiveNodeId] = useState<string>("node-3");
  const [leftSidebar, setLeftSidebar] = useState<{ open: boolean; panel: LeftSidebarPanelId }>({
    open: true,
    panel: "library",
  });
  const [miniMapOpen, setMiniMapOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [canvasThemeColor, setCanvasThemeColor] = useState(DEFAULT_CANVAS_THEME);
  const [selectedLibraryAssetId, setSelectedLibraryAssetId] = useState<string | null>(null);
  const [pendingLibraryInsertAsset, setPendingLibraryInsertAsset] = useState<CanvasLibraryAsset | null>(null);
  const leftSidebarResize = useResizablePanel({
    panelRef: leftSidebarPanelRef,
    side: "left",
    defaultWidth: DEFAULT_LEFT_SIDEBAR_WIDTH,
    minWidth: MIN_LEFT_SIDEBAR_WIDTH,
    maxWidth: MAX_LEFT_SIDEBAR_WIDTH,
    storageKey: LEFT_SIDEBAR_WIDTH_STORAGE_KEY,
  });
  const rightPanelResize = useResizablePanel({
    panelRef: rightPanelRef,
    side: "right",
    defaultWidth: DEFAULT_RIGHT_PANEL_WIDTH,
    minWidth: MIN_RIGHT_PANEL_WIDTH,
    maxWidth: MAX_RIGHT_PANEL_WIDTH,
    storageKey: RIGHT_PANEL_WIDTH_STORAGE_KEY,
  });
  const library = useCanvasLibrary();
  const allLibraryAssets = library.allAssets;
  const canvasThemeStyle = buildCanvasThemeStyle(canvasThemeColor);
  const isResizingPanel = leftSidebarResize.isResizing || rightPanelResize.isResizing;

  useGSAP(
    () => {
      if (!rootRef.current || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      gsap.from(rootRef.current.querySelectorAll("[data-enter]"), {
        y: 16,
        autoAlpha: 0,
        duration: 0.55,
        stagger: 0.06,
        ease: "power3.out",
      });
    },
    { scope: rootRef },
  );

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 1800);
  };

  const toggleLeftSidebarPanel = (panel: LeftSidebarPanelId) => {
    setLeftSidebar((current) =>
      current.open && current.panel === panel
        ? { ...current, open: false }
        : {
            open: true,
            panel,
          },
    );
  };

  const openLeftSidebar = () => {
    setLeftSidebar((current) => ({ ...current, open: true }));
  };

  const handleTool = (tool: EditorTool) => {
    setActiveTool(tool);
    if (tool === "add-object") setShowAddObjectMenu(true);
  };

  const handleSelectItem = (item: SelectedItem) => {
    setSelectedItem(item);
    if (item.type !== "sketchLine") {
      setSelectedSketchLineIds([]);
    }
  };

  const addPenStroke = (stroke: PenStrokeObject) => {
    setPenStrokes((items) => [...items, stroke]);
    setSelectedItem({ type: "pen-stroke", id: stroke.id });
    setSelectedSketchLineIds([]);
  };

  const replacePenStrokes = (nextStrokes: PenStrokeObject[]) => {
    setPenStrokes(nextStrokes);
    setSelectedItem((current) => {
      if (current.type !== "pen-stroke") {
        return current;
      }

      return nextStrokes.some((stroke) => stroke.id === current.id) ? current : { type: "none" };
    });
  };

  const deletePenStroke = (strokeId: string) => {
    setPenStrokes((items) => items.filter((stroke) => stroke.id !== strokeId));
    setSelectedItem((current) => (current.type === "pen-stroke" && current.id === strokeId ? { type: "none" } : current));
  };

  const handleImageAction = (x: number, y: number) => {
    if (activeTool === "mark-position") {
      const id = `marker-${markers.length + 1}`;
      setMarkers((items) => [...items, { id, x, y, label: "Place koi pond here" }]);
      setSelectedItem({ type: "marker", id });
      animateIn(".marker-pin");
    }
    if (activeTool === "draw-region" || activeTool === "lock-area") {
      const locked = activeTool === "lock-area";
      const id = `${locked ? "locked" : "region"}-${regions.length + 1}`;
      setRegions((items) => [
        ...items,
        {
          id,
          x: Math.min(x, 68),
          y: Math.min(y, 70),
          w: locked ? 28 : 32,
          h: locked ? 15 : 19,
          label: locked ? "Keep unchanged" : "Editable Zone",
          kind: locked ? "locked" : "editable",
        },
      ]);
      setSelectedItem({ type: "region", id });
      animateIn(".region-overlay");
    }
  };

  const addObject = (label: string) => {
    const id = `object-${addedObjects.length + 1}`;
    setAddedObjects((items) => [
      ...items,
      {
        id,
        x: 44 + items.length * 4,
        y: 45 + items.length * 3,
        w: label === "People" ? 10 : 18,
        h: label === "Waterfall" ? 17 : 11,
        rotation: label === "Pathway" ? -10 : -4,
        label,
      },
    ]);
    setSelectedItem({ type: "object", id });
    setShowAddObjectMenu(false);
    setActiveTool("select");
    animateIn(".added-object");
  };

  const uploadAssetsToFolder = (folderId: string, files: FileList | File[]) => {
    Array.from(files)
      .filter((file) => file.type.startsWith("image/"))
      .forEach((file) => {
        const objectUrl = URL.createObjectURL(file);
        library.addAssetToFolder(folderId, {
          id: `asset_${Date.now()}_${file.name}`,
          src: objectUrl,
          thumbnailSrc: objectUrl,
          title: file.name.replace(/\.[^.]+$/, ""),
          source: "upload",
          createdAt: new Date().toISOString(),
          metadata: {
            originalWidth: undefined,
            originalHeight: undefined,
          },
        });
      });

    showToast("Images added to Library");
  };

  const addSketchLine = (line: SketchLine) => {
    setSketchLines((items) => [...items, line]);
    setSelectedSketchLineIds([line.id]);
    setSelectedItem({ type: "sketchLine", id: line.id });
  };

  const selectSketchLine = (id: string, additive: boolean) => {
    setSelectedSketchLineIds((items) => {
      const next = additive ? (items.includes(id) ? items.filter((item) => item !== id) : [...items, id]) : [id];
      return next;
    });
    setSelectedItem({ type: "sketchLine", id });
  };

  const groupSelectedSketchLines = (nameTag: string) => {
    const lineIds = selectedSketchLineIds.filter((id) => sketchLines.some((line) => line.id === id));
    if (lineIds.length === 0) return;

    const selectedLines = sketchLines.filter((line) => lineIds.includes(line.id));
    const points = selectedLines.flatMap((line) => line.points);
    const minX = Math.min(...points.map((point) => point.x));
    const minY = Math.min(...points.map((point) => point.y));
    const maxX = Math.max(...points.map((point) => point.x));
    const maxY = Math.max(...points.map((point) => point.y));
    const groupId = `sketch-group-${Date.now()}`;
    const objectType = inferObjectTypeFromTag(nameTag);

    const group: SketchGroup = {
      id: groupId,
      nameTag,
      objectType,
      lineIds,
      bounds: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
      selectedAssetIds: [],
    };

    setSketchLines((items) => items.map((line) => (lineIds.includes(line.id) ? { ...line, groupId } : line)));
    setSketchGroups((items) => [...items, group]);
    setSelectedSketchLineIds([]);
    setSelectedItem({ type: "sketchGroup", id: groupId });
    setShowGroupNameModal(false);
    showToast(`${nameTag} group created`);
  };

  const buildGenerationContext = () => {
    const selectedRegion = selectedItem.type === "region" ? regions.find((region) => region.id === selectedItem.id) : undefined;
    const selectedGroup = selectedItem.type === "sketchGroup" ? sketchGroups.find((group) => group.id === selectedItem.id) : undefined;
    const selectedObject = selectedItem.type === "object" ? addedObjects.find((object) => object.id === selectedItem.id) : undefined;
    const selectedTarget = selectedRegion ?? selectedGroup ?? selectedObject;
    const assetIds =
      selectedRegion?.selectedAssetIds ??
      selectedGroup?.selectedAssetIds ??
      selectedObject?.selectedAssetIds ??
      [];
    const assets = allLibraryAssets.filter((asset) => assetIds.includes(asset.id));

    if (!selectedTarget) {
      return {
        targetSummary: "No explicit region or sketch group selected.",
        referenceSummary: "No local library references selected.",
      };
    }

    const targetSummary =
      "nameTag" in selectedTarget
        ? `Target group: ${selectedTarget.nameTag}; object type: ${selectedTarget.objectType}; bounds: ${JSON.stringify(selectedTarget.bounds)}.`
        : "kind" in selectedTarget
          ? `Target region: ${selectedTarget.label}; kind: ${selectedTarget.kind}; bounds: ${JSON.stringify({ x: selectedTarget.x, y: selectedTarget.y, w: selectedTarget.w, h: selectedTarget.h })}.`
          : `Target object: ${selectedTarget.label}; bounds: ${JSON.stringify({ x: selectedTarget.x, y: selectedTarget.y, w: selectedTarget.w, h: selectedTarget.h })}.`;

    const referenceSummary =
      assets.length > 0
        ? `Use local library references: ${assets.map((asset) => `${asset.title ?? "Untitled"} (${asset.metadata?.categoryHint ?? "asset"})`).join("; ")}.`
        : "No local library references selected.";

    return { targetSummary, referenceSummary };
  };

  const generateConcept = () => {
    const generationContext = buildGenerationContext();
    setMockConcepts([]);
    setNodes((items) =>
      items.map((node) =>
        node.role === "output"
          ? {
              ...node,
              prompt: [promptText || "Canvas generation request", generationContext.targetSummary, generationContext.referenceSummary].join("\n"),
            }
          : node,
      ),
    );
    window.setTimeout(() => {
      setMockConcepts(["Concept A", "Concept B", "Concept C"]);
      animateIn(".output-thumb");
    }, 850);
  };

  const generateAngles = () => {
    setShowMultiAngleModal(false);
    setOutputAngles(["Angle A", "Angle B", "Top View", "Night View"]);
    showToast("Angle set created");
    animateIn(".output-thumb");
  };

  const applyQuickEdit = () => {
    setShowQuickEditModal(false);
    showToast("Edit instruction added");
  };

  return (
    <div ref={rootRef} className="min-h-screen bg-[var(--canvas-theme-surface)] text-[var(--canvas-theme-text)]" style={canvasThemeStyle}>
      <div className="hidden h-screen w-screen flex-col overflow-hidden bg-[var(--canvas-theme-surface)] xl:flex">
        <div data-enter className="relative flex min-h-0 flex-1">
          {leftSidebar.open ? (
            <div
              ref={leftSidebarPanelRef}
              className="relative h-full shrink-0"
              style={{ width: leftSidebarResize.width }}
              data-canvas-ui="true"
            >
              <EditorLeftSidebar
                panel={leftSidebar.panel}
                folders={library.folders}
                activeFolderId={library.activeFolderId}
                selectedAssetId={selectedLibraryAssetId}
                onSelectFolder={library.setActiveFolderId}
                onSelectAsset={setSelectedLibraryAssetId}
                onCreateFolder={library.createFolder}
                onRenameFolder={library.renameFolder}
                onDeleteFolder={library.deleteFolder}
                onDeleteAsset={library.removeAssetFromFolder}
                onAddAssetToCanvas={(asset) => {
                  setSelectedLibraryAssetId(asset.id);
                  setPendingLibraryInsertAsset(asset);
                }}
                onUploadAssets={uploadAssetsToFolder}
                onToast={showToast}
                onClose={() => setLeftSidebar((current) => ({ ...current, open: false }))}
              />
              <ResizeHandle
                side="right"
                ariaLabel="Resize left sidebar"
                isResizing={leftSidebarResize.isResizing}
                onPointerDown={leftSidebarResize.startResize}
                onDoubleClick={leftSidebarResize.resetWidth}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={openLeftSidebar}
              className="absolute left-3 top-3 z-[70] grid h-10 w-10 place-items-center rounded-full border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] text-[var(--canvas-theme-icon)] shadow-lg shadow-[var(--canvas-theme-shadow)]"
              title={`Open ${LEFT_SIDEBAR_PANEL_LABELS[leftSidebar.panel]}`}
            >
              <PanelLeftOpen className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
          <CanvasBoard
            selectedItem={selectedItem}
            activeTool={activeTool}
            gridVisible={gridVisible}
            markers={markers}
            regions={regions}
            addedObjects={addedObjects}
            nodes={nodes}
            edges={edges}
            mockConcepts={mockConcepts}
            angleResults={outputAngles}
            onSelect={handleSelectItem}
            onImageAction={handleImageAction}
            sketchLines={sketchLines}
            sketchGroups={sketchGroups}
            penStrokes={penStrokes}
            penSettings={penSettings}
            selectedSketchLineIds={selectedSketchLineIds}
            onAddSketchLine={addSketchLine}
            onAddPenStroke={addPenStroke}
            onDeletePenStroke={deletePenStroke}
            onReplacePenStrokes={replacePenStrokes}
            onPenSettingsChange={setPenSettings}
            onSelectSketchLine={selectSketchLine}
            onSelectSketchGroup={(id) => handleSelectItem({ type: "sketchGroup", id })}
            onTool={handleTool}
            onToggleGrid={() => setGridVisible((value) => !value)}
            onQuickEdit={() => setShowQuickEditModal(true)}
            onMultiAngle={() => setShowMultiAngleModal(true)}
            onAddObject={() => setShowAddObjectMenu(true)}
            onRealityCheck={() => setShowRealityCheckPanel(true)}
            onGenerate={generateConcept}
            onToast={showToast}
            onNodesChange={setNodes}
            onEdgesChange={setEdges}
            activeNodeId={activeNodeId}
            onSetActiveNode={setActiveNodeId}
            canvasThemeColor={canvasThemeColor}
            onCanvasThemeChange={setCanvasThemeColor}
            activeLeftSidebarPanel={leftSidebar.open ? leftSidebar.panel : null}
            onToggleLeftSidebarPanel={toggleLeftSidebarPanel}
            miniMapOpen={miniMapOpen}
            onToggleMiniMap={() => setMiniMapOpen((current) => !current)}
            pendingLibraryInsertAsset={pendingLibraryInsertAsset}
            onConsumePendingLibraryInsert={() => setPendingLibraryInsertAsset(null)}
            isResizingPanel={isResizingPanel}
          />
          {rightPanelOpen ? (
            <div
              ref={rightPanelRef}
              className="relative h-full shrink-0"
              style={{ width: rightPanelResize.width }}
              data-canvas-ui="true"
            >
              <EditorRightPanel
                canvasId="canvas-main"
                draft={promptText}
                onDraftChange={setPromptText}
                onClose={() => setRightPanelOpen(false)}
                onToast={showToast}
              />
              <ResizeHandle
                side="left"
                ariaLabel="Resize right panel"
                isResizing={rightPanelResize.isResizing}
                onPointerDown={rightPanelResize.startResize}
                onDoubleClick={rightPanelResize.resetWidth}
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setRightPanelOpen(true)}
              className="absolute right-3 top-3 z-[70] grid h-10 w-10 place-items-center rounded-full border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] text-[var(--canvas-theme-icon)] shadow-lg shadow-[var(--canvas-theme-shadow)]"
              title="Open chat"
            >
              <MessageSquare className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>
        <QuickEditModal open={showQuickEditModal} promptText={promptText} onPromptChange={setPromptText} onClose={() => setShowQuickEditModal(false)} onApply={applyQuickEdit} />
        {selectedSketchLineIds.length > 0 ? (
          <div className="fixed bottom-28 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] px-4 py-3 shadow-2xl shadow-[var(--canvas-theme-shadow)] backdrop-blur">
            <span className="text-xs font-black text-[var(--canvas-theme-text-muted)]">{selectedSketchLineIds.length} sketch line{selectedSketchLineIds.length === 1 ? "" : "s"} selected</span>
            <button
              type="button"
              onClick={() => setShowGroupNameModal(true)}
              className="rounded-xl bg-[var(--canvas-theme-active)] px-3 py-2 text-xs font-black text-[var(--canvas-theme-active-text)] shadow-lg shadow-[var(--canvas-theme-shadow)]"
            >
              Group + Name Tag
            </button>
          </div>
        ) : null}
        <GroupNameTagModal
          open={showGroupNameModal}
          lineCount={selectedSketchLineIds.length}
          onClose={() => setShowGroupNameModal(false)}
          onCreate={groupSelectedSketchLines}
        />
        <MultiAngleModal open={showMultiAngleModal} onClose={() => setShowMultiAngleModal(false)} onGenerate={generateAngles} />
        <AddObjectMenu open={showAddObjectMenu} onClose={() => setShowAddObjectMenu(false)} onAdd={addObject} />
        <RealityCheckPanel open={showRealityCheckPanel} onClose={() => setShowRealityCheckPanel(false)} />
        {toast ? (
          <div className="toast-message fixed left-1/2 top-20 z-[120] -translate-x-1/2 rounded-full border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] px-4 py-2 text-sm font-black text-[var(--canvas-theme-text)] shadow-2xl shadow-[var(--canvas-theme-shadow)]">
            {toast}
          </div>
        ) : null}
      </div>
      <div className="grid min-h-screen place-items-center bg-[#F7F8FA] p-8 xl:hidden">
        <div className="max-w-md rounded-3xl border border-[#E5E7EB] bg-white p-8 text-center shadow-xl shadow-black/8">
          <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#111827] text-lg font-black text-white">C</div>
          <h1 className="mt-6 text-2xl font-black text-[#0A0A0A]">Canvas is best on desktop.</h1>
          <p className="mt-3 text-sm leading-6 text-[#667085]">Open this workspace on a larger screen to use object selection, contextual tools, markers, regions, and AI actions.</p>
        </div>
      </div>
    </div>
  );
}

function animateIn(selector: string) {
  window.setTimeout(() => {
    const items = document.querySelectorAll(selector);
    gsap.fromTo(items, { y: 10, scale: 0.96, autoAlpha: 0 }, { y: 0, scale: 1, autoAlpha: 1, duration: 0.38, stagger: 0.05, ease: "power3.out" });
  }, 20);
}
