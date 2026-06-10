/*
 * Flow: Renders one interactive canvas workspace component.
 * 1. Receive canvas state and callbacks from the workspace.
 * 2. Render the focused control, overlay, or board UI.
 * 3. Send user actions back up through typed handlers.
 */

"use client";

import { useRef, useState } from "react";
import { MessageSquare, PanelLeftOpen } from "lucide-react";
import { gsap, useGSAP } from "../../components/gsapSetup";
import AddObjectMenu from "./AddObjectMenu";
import CanvasBoard from "./CanvasBoard";
import EditorLeftSidebar from "./EditorLeftSidebar";
import EditorRightPanel from "./EditorRightPanel";
import GroupNameTagModal from "./GroupNameTagModal";
import MultiAngleModal from "./MultiAngleModal";
import QuickEditModal from "./QuickEditModal";
import RealityCheckPanel from "./RealityCheckPanel";

export type EditorTool =
  | "select"
  | "pen"
  | "mark-position"
  | "add-source"
  | "grid"
  | "draw-region"
  | "lock-area"
  | "text-note"
  | "add-object"
  | "generate"
  | "erase"
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
  imageUrl: string;
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
};

const initialMarkers: Marker[] = [{ id: "marker-1", x: 58, y: 56, label: "Place koi pond here" }];
const initialRegions: Region[] = [
  { id: "region-lock-1", x: 9, y: 10, w: 34, h: 19, label: "Keep unchanged", kind: "locked" },
  { id: "region-edit-1", x: 48, y: 58, w: 34, h: 21, label: "Editable Zone", kind: "editable" },
];

const initialNodes: CanvasNode[] = [];
const initialEdges: CanvasEdge[] = [];
const DEFAULT_CANVAS_BACKGROUND = "#F5F5F5";

const initialLibraryAssets: LibraryAsset[] = [
  {
    id: "asset-tung-la-han",
    name: "Tung la han",
    category: "plant",
    tags: ["bonsai", "formal", "evergreen"],
    imageUrl: "/assets/garden_3d_render.png",
    sourceType: "saved",
    savedAt: "2026-06-09T00:00:00.000Z",
  },
  {
    id: "asset-fern-cluster",
    name: "Fern cluster",
    category: "plant",
    tags: ["shade", "pond edge", "soft"],
    imageUrl: "/assets/mark_generation.png",
    sourceType: "project",
    savedAt: "2026-06-09T00:00:00.000Z",
  },
  {
    id: "asset-co-thach",
    name: "Da co thach",
    category: "stone",
    tags: ["limestone", "pond edge", "natural"],
    imageUrl: "/assets/canvas_texture.png",
    sourceType: "saved",
    savedAt: "2026-06-09T00:00:00.000Z",
  },
  {
    id: "asset-rockery-waterfall",
    name: "Hon non bo waterfall",
    category: "rockery",
    tags: ["waterfall", "vertical rock", "moss"],
    imageUrl: "/assets/mark_generation.png",
    sourceType: "project",
    savedAt: "2026-06-09T00:00:00.000Z",
  },
  {
    id: "asset-stepping-stone",
    name: "Stepping stone path",
    category: "hardscape",
    tags: ["path", "courtyard", "stone"],
    imageUrl: "/assets/canvas_texture.png",
    sourceType: "project",
    savedAt: "2026-06-09T00:00:00.000Z",
  },
];

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
  const [selectedSketchLineIds, setSelectedSketchLineIds] = useState<string[]>([]);
  const [showGroupNameModal, setShowGroupNameModal] = useState(false);
  const [libraryAssets, setLibraryAssets] = useState<LibraryAsset[]>(initialLibraryAssets);
  const [nodes, setNodes] = useState<CanvasNode[]>(initialNodes);
  const [edges, setEdges] = useState<CanvasEdge[]>(initialEdges);
  const [promptText, setPromptText] = useState("");
  const [mockConcepts, setMockConcepts] = useState<string[]>([]);
  const [outputAngles, setOutputAngles] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [activeNodeId, setActiveNodeId] = useState<string>("node-3");
  const [leftSidebarOpen, setLeftSidebarOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [canvasBackgroundColor, setCanvasBackgroundColor] = useState(DEFAULT_CANVAS_BACKGROUND);

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

  const attachAssetToSelection = (assetId: string) => {
    if (selectedItem.type === "region") {
      setRegions((items) =>
        items.map((region) =>
          region.id === selectedItem.id
            ? { ...region, selectedAssetIds: Array.from(new Set([...(region.selectedAssetIds ?? []), assetId])) }
            : region,
        ),
      );
      showToast("Asset attached to region");
    }

    if (selectedItem.type === "sketchGroup") {
      setSketchGroups((items) =>
        items.map((group) =>
          group.id === selectedItem.id
            ? { ...group, selectedAssetIds: Array.from(new Set([...group.selectedAssetIds, assetId])) }
            : group,
        ),
      );
      showToast("Asset attached to sketch group");
    }

    if (selectedItem.type === "object") {
      setAddedObjects((items) =>
        items.map((object) =>
          object.id === selectedItem.id
            ? { ...object, selectedAssetIds: Array.from(new Set([...(object.selectedAssetIds ?? []), assetId])) }
            : object,
        ),
      );
      showToast("Asset attached to object");
    }
  };

  const saveLibraryAsset = (assetId: string) => {
    setLibraryAssets((items) => items.map((asset) => (asset.id === assetId ? { ...asset, sourceType: "saved" } : asset)));
    showToast("Asset saved");
  };

  const removeLibraryAsset = (assetId: string) => {
    setLibraryAssets((items) => items.filter((asset) => asset.id !== assetId));
    setRegions((items) => items.map((region) => ({ ...region, selectedAssetIds: region.selectedAssetIds?.filter((id) => id !== assetId) })));
    setSketchGroups((items) => items.map((group) => ({ ...group, selectedAssetIds: group.selectedAssetIds.filter((id) => id !== assetId) })));
    setAddedObjects((items) => items.map((object) => ({ ...object, selectedAssetIds: object.selectedAssetIds?.filter((id) => id !== assetId) })));
    showToast("Asset removed");
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
    const assets = libraryAssets.filter((asset) => assetIds.includes(asset.id));

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
        ? `Use local library references: ${assets.map((asset) => `${asset.name} (${asset.tags.join(", ")})`).join("; ")}.`
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
    <div ref={rootRef} className="min-h-screen bg-white text-[#0A0A0A]">
      <div className="hidden h-screen w-screen flex-col overflow-hidden bg-white xl:flex">
        <div data-enter className="relative flex min-h-0 flex-1">
          {leftSidebarOpen ? (
            <EditorLeftSidebar
              selectedItem={selectedItem}
              regions={regions}
              addedObjects={addedObjects}
              sketchGroups={sketchGroups}
              libraryAssets={libraryAssets}
              onSelectReference={() => handleSelectItem({ type: "reference", id: "reference-1" })}
              onUseAsset={attachAssetToSelection}
              onSaveAsset={saveLibraryAsset}
              onRemoveAsset={removeLibraryAsset}
              onToast={showToast}
              onClose={() => setLeftSidebarOpen(false)}
            />
          ) : (
            <button
              type="button"
              onClick={() => setLeftSidebarOpen(true)}
              className="absolute left-3 top-3 z-[70] grid h-10 w-10 place-items-center rounded-full border border-[#E5E7EB] bg-white text-[#111827] shadow-lg shadow-black/10"
              title="Open layers"
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
            selectedSketchLineIds={selectedSketchLineIds}
            onAddSketchLine={addSketchLine}
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
            canvasBackgroundColor={canvasBackgroundColor}
            onCanvasBackgroundChange={setCanvasBackgroundColor}
          />
          {rightPanelOpen ? (
            <EditorRightPanel
              draft={promptText}
              onDraftChange={setPromptText}
              onClose={() => setRightPanelOpen(false)}
              onToast={showToast}
            />
          ) : (
            <button
              type="button"
              onClick={() => setRightPanelOpen(true)}
              className="absolute right-3 top-3 z-[70] grid h-10 w-10 place-items-center rounded-full border border-[#E5E7EB] bg-white text-[#111827] shadow-lg shadow-black/10"
              title="Open chat"
            >
              <MessageSquare className="h-5 w-5" aria-hidden="true" />
            </button>
          )}
        </div>
        <QuickEditModal open={showQuickEditModal} promptText={promptText} onPromptChange={setPromptText} onClose={() => setShowQuickEditModal(false)} onApply={applyQuickEdit} />
        {selectedSketchLineIds.length > 0 ? (
          <div className="fixed bottom-28 left-1/2 z-[80] flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-[#E5E7EB] bg-white/95 px-4 py-3 shadow-2xl shadow-black/15 backdrop-blur">
            <span className="text-xs font-black text-[#667085]">{selectedSketchLineIds.length} sketch line{selectedSketchLineIds.length === 1 ? "" : "s"} selected</span>
            <button
              type="button"
              onClick={() => setShowGroupNameModal(true)}
              className="rounded-xl bg-[#111827] px-3 py-2 text-xs font-black text-white shadow-lg shadow-black/15"
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
          <div className="toast-message fixed left-1/2 top-20 z-[120] -translate-x-1/2 rounded-full border border-[#E5E7EB] bg-white px-4 py-2 text-sm font-black text-[#111827] shadow-2xl shadow-black/12">
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
