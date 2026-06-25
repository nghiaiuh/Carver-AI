/*
 * useCanvasWorkspace
 *
 * Coordinator hook for the canvas editor.
 * Owns all canvas state, derived values, and action callbacks.
 * CanvasWorkspace.tsx consumes this hook and renders pure JSX only.
 */

"use client";

import { useRef, useState } from "react";
import { useCanvasLibrary } from "./useCanvasLibrary";
import { buildCanvasThemeStyle } from "../components/core/canvasTheme";
import useResizablePanel from "./useResizablePanel";
import { gsap } from "../../components/gsapSetup";
import type { LibraryAsset as CanvasLibraryAsset } from "../types/library";
import {
  type CanvasPresetChild,
  type CanvasPresetGroupNode,
  DEFAULT_CANVAS_THEME,
  DEFAULT_LEFT_SIDEBAR_WIDTH,
  DEFAULT_PEN_SETTINGS,
  DEFAULT_RIGHT_PANEL_WIDTH,
  type PresetGroupCategory,
  LEFT_SIDEBAR_WIDTH_STORAGE_KEY,
  MAX_LEFT_SIDEBAR_WIDTH,
  MAX_RIGHT_PANEL_WIDTH,
  MIN_LEFT_SIDEBAR_WIDTH,
  MIN_RIGHT_PANEL_WIDTH,
  RIGHT_PANEL_WIDTH_STORAGE_KEY,
  inferObjectTypeFromTag,
} from "../types/canvas";
import { MAX_MASK_HISTORY } from "../utils/regionMask";
import type {
  AddedObject,
  CanvasEdge,
  MaskData,
  CanvasNode,
  EditorTool,
  LeftSidebarPanelId,
  Marker,
  PenSettings,
  PenStrokeObject,
  RegionBrushMode,
  RegionSelectionTool,
  SelectedItem,
  SketchGroup,
  SketchLine,
} from "../types/canvas";
import {
  isPresetGroupNode,
  removePresetChildAndCleanupEdges,
  reorderPresetChildren,
  syncPresetGroupPreview,
  upsertPresetChild,
} from "../utils/presetGroup";

function getSelectedNodeFromSelection(nodes: CanvasNode[], selectedItem: SelectedItem) {
  if (selectedItem.type !== "node" && selectedItem.type !== "image" && selectedItem.type !== "presetChild") {
    return null;
  }

  const nodeId = selectedItem.type === "presetChild" ? selectedItem.nodeId : selectedItem.id;
  return nodes.find((node) => node.id === nodeId) ?? null;
}

type PendingPresetGroupInsert = {
  category: PresetGroupCategory;
  title: string;
  children: CanvasPresetChild[];
  sourceFolderId?: string;
};

// ── Seed data ─────────────────────────────────────────────────────────────────

const INITIAL_MARKERS: Marker[] = [
  { id: "marker-1", x: 58, y: 56, label: "Place koi pond here" },
];

const INITIAL_OBJECTS: AddedObject[] = [
  { id: "object-1", x: 62, y: 58, w: 17, h: 10, rotation: -5, label: "Koi Pond" },
];

// ── Animation helper (side-effect, canvas-local) ───────────────────────────

function animateIn(selector: string) {
  window.setTimeout(() => {
    const items = document.querySelectorAll(selector);
    gsap.fromTo(
      items,
      { y: 10, scale: 0.96, autoAlpha: 0 },
      { y: 0, scale: 1, autoAlpha: 1, duration: 0.38, stagger: 0.05, ease: "power3.out" },
    );
  }, 20);
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useCanvasWorkspace() {
  // ── DOM Refs ────────────────────────────────────────────────────────────────
  const rootRef = useRef<HTMLDivElement>(null);
  const leftSidebarPanelRef = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);

  // ── Canvas entities ─────────────────────────────────────────────────────────
  const [selectedItem, setSelectedItem] = useState<SelectedItem>({ type: "none" });
  const [activeTool, setActiveTool] = useState<EditorTool>("select");
  const [gridVisible, setGridVisible] = useState(true);
  const [markers, setMarkers] = useState<Marker[]>(INITIAL_MARKERS);
  const [addedObjects, setAddedObjects] = useState<AddedObject[]>(INITIAL_OBJECTS);
  const [sketchLines, setSketchLines] = useState<SketchLine[]>([]);
  const [sketchGroups, setSketchGroups] = useState<SketchGroup[]>([]);
  const [penStrokes, setPenStrokes] = useState<PenStrokeObject[]>([]);
  const [penSettings, setPenSettings] = useState<PenSettings>(DEFAULT_PEN_SETTINGS);
  const [brushMode, setBrushMode] = useState<RegionBrushMode>("add");
  const [regionSelectionTool, setRegionSelectionTool] = useState<RegionSelectionTool>("brush");
  const [brushSize, setBrushSize] = useState<number>(80);
  const [brushSoftness, setBrushSoftness] = useState<number>(35);
  const [maskTrigger, setMaskTrigger] = useState<{ action: "invert" | "clear", timestamp: number } | null>(null);
  const [selectedSketchLineIds, setSelectedSketchLineIds] = useState<string[]>([]);
  const [nodes, setNodes] = useState<CanvasNode[]>([]);
  const [edges, setEdges] = useState<CanvasEdge[]>([]);

  // ── Generation / AI ─────────────────────────────────────────────────────────
  const [promptText, setPromptText] = useState("");
  const [mockConcepts, setMockConcepts] = useState<string[]>([]);
  const [outputAngles, setOutputAngles] = useState<string[]>([]);
  const [activeNodeId, setActiveNodeId] = useState<string>("node-3");
  const [isGeneratingRegion, setIsGeneratingRegion] = useState(false);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [toast, setToast] = useState<string | null>(null);
  const [showQuickEditModal, setShowQuickEditModal] = useState(false);
  const [showMultiAngleModal, setShowMultiAngleModal] = useState(false);
  const [showAddObjectMenu, setShowAddObjectMenu] = useState(false);
  const [showRealityCheckPanel, setShowRealityCheckPanel] = useState(false);
  const [showGroupNameModal, setShowGroupNameModal] = useState(false);
  const [leftSidebar, setLeftSidebar] = useState<{ open: boolean; panel: LeftSidebarPanelId }>({
    open: true,
    panel: "library",
  });
  const [miniMapOpen, setMiniMapOpen] = useState(true);
  const [rightPanelOpen, setRightPanelOpen] = useState(true);
  const [canvasThemeColor, setCanvasThemeColor] = useState(DEFAULT_CANVAS_THEME);
  const [selectedLibraryAssetId, setSelectedLibraryAssetId] = useState<string | null>(null);
  const [pendingLibraryInsertAsset, setPendingLibraryInsertAsset] =
    useState<CanvasLibraryAsset | null>(null);
  const [pendingPresetGroupInsert, setPendingPresetGroupInsert] =
    useState<PendingPresetGroupInsert | null>(null);

  // ── Sub-hooks ───────────────────────────────────────────────────────────────
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

  // ── Derived values ──────────────────────────────────────────────────────────
  const allLibraryAssets = library.allAssets;
  const canvasThemeStyle = buildCanvasThemeStyle(canvasThemeColor);
  const isResizingPanel = leftSidebarResize.isResizing || rightPanelResize.isResizing;
  const selectedNode = getSelectedNodeFromSelection(nodes, selectedItem);

  // ── Actions ─────────────────────────────────────────────────────────────────

  const showToast = (message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(null), 1800);
  };

  const toggleLeftSidebarPanel = (panel: LeftSidebarPanelId) => {
    setLeftSidebar((current) =>
      current.open && current.panel === panel
        ? { ...current, open: false }
        : { open: true, panel },
    );
  };

  const openLeftSidebar = () => {
    setLeftSidebar((current) => ({ ...current, open: true }));
  };

  const handleTool = (tool: EditorTool) => {
    if (tool === "region" && !selectedNode) {
      showToast("Select an image first");
      return;
    }

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
      if (current.type !== "pen-stroke") return current;
      return nextStrokes.some((stroke) => stroke.id === current.id) ? current : { type: "none" };
    });
  };

  const deletePenStroke = (strokeId: string) => {
    setPenStrokes((items) => items.filter((stroke) => stroke.id !== strokeId));
    setSelectedItem((current) =>
      current.type === "pen-stroke" && current.id === strokeId ? { type: "none" } : current,
    );
  };

  const handleImageAction = (x: number, y: number) => {
    if (activeTool === "mark-position") {
      const id = `marker-${markers.length + 1}`;
      setMarkers((items) => [...items, { id, x, y, label: "Place koi pond here" }]);
      setSelectedItem({ type: "marker", id });
      animateIn(".marker-pin");
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

  const upsertPresetGroup = (params: PendingPresetGroupInsert, replaceAllChildren = false) => {
    const existingGroup = nodes.find(
      (node) =>
        isPresetGroupNode(node) &&
        node.presetGroup.category === params.category &&
        (params.sourceFolderId ? node.presetGroup.sourceFolderId === params.sourceFolderId : true),
    ) as CanvasPresetGroupNode | undefined;

    if (!existingGroup) {
      setPendingPresetGroupInsert(params);
      return;
    }

    setNodes((current) =>
      current.map((node) => {
        if (!isPresetGroupNode(node) || node.id !== existingGroup.id) return node;

        const nextChildren = replaceAllChildren
          ? params.children.map((child, index) => ({ ...child, order: index }))
          : params.children.reduce(
              (children, child) => upsertPresetChild(children, child, true),
              node.presetGroup.children,
            );
        const activeChildId =
          params.children.at(-1)?.id ??
          node.presetGroup.activeChildId;

        return syncPresetGroupPreview({
          ...node,
          presetGroup: {
            ...node.presetGroup,
            category: params.category,
            sourceFolderId: params.sourceFolderId ?? node.presetGroup.sourceFolderId,
            activeChildId,
            children: nextChildren,
          },
        });
      }),
    );
    setActiveNodeId(existingGroup.id);
    setSelectedItem({ type: "node", id: existingGroup.id });
  };

  const setActivePresetChild = (nodeId: string, childId: string) => {
    setNodes((current) =>
      current.map((node) => {
        if (!isPresetGroupNode(node) || node.id !== nodeId) return node;
        return syncPresetGroupPreview({
          ...node,
          presetGroup: {
            ...node.presetGroup,
            activeChildId: childId,
          },
        });
      }),
    );
    setActiveNodeId(nodeId);
    setSelectedItem({ type: "presetChild", nodeId, childId });
  };

  const removePresetChild = (nodeId: string, childId: string) => {
    setNodes((current) => {
      const targetNode = current.find((node) => isPresetGroupNode(node) && node.id === nodeId) as CanvasPresetGroupNode | undefined;
      if (!targetNode) return current;

      const { children } = removePresetChildAndCleanupEdges(targetNode, childId, edges);
      if (children.length === 0) {
        return current.filter((node) => node.id !== nodeId);
      }

      return current.map((node) => {
        if (!isPresetGroupNode(node) || node.id !== nodeId) return node;
        return syncPresetGroupPreview({
          ...node,
          presetGroup: {
            ...node.presetGroup,
            activeChildId:
              targetNode.presetGroup.activeChildId === childId
                ? children[0]?.id ?? null
                : node.presetGroup.activeChildId,
            children,
          },
        });
      });
    });
    setEdges((current) => current.filter((edge) => !(edge.targetId === nodeId && edge.targetPresetChildId === childId)));
    setSelectedItem({ type: "node", id: nodeId });
  };

  const movePresetChild = (nodeId: string, childId: string, direction: "left" | "right") => {
    setNodes((current) =>
      current.map((node) => {
        if (!isPresetGroupNode(node) || node.id !== nodeId) return node;
        const children = [...node.presetGroup.children].sort((a, b) => a.order - b.order);
        const childIndex = children.findIndex((child) => child.id === childId);
        if (childIndex === -1) return node;
        const swapIndex = direction === "left" ? childIndex - 1 : childIndex + 1;
        if (swapIndex < 0 || swapIndex >= children.length) return node;
        const nextIds = children.map((child) => child.id);
        [nextIds[childIndex], nextIds[swapIndex]] = [nextIds[swapIndex], nextIds[childIndex]];
        return syncPresetGroupPreview({
          ...node,
          presetGroup: {
            ...node.presetGroup,
            children: reorderPresetChildren(children, nextIds),
          },
        });
      }),
    );
  };

  const addSketchLine = (line: SketchLine) => {
    setSketchLines((items) => [...items, line]);
    setSelectedSketchLineIds([line.id]);
    setSelectedItem({ type: "sketchLine", id: line.id });
  };

  const selectSketchLine = (id: string, additive: boolean) => {
    setSelectedSketchLineIds((items) => {
      return additive
        ? items.includes(id)
          ? items.filter((item) => item !== id)
          : [...items, id]
        : [id];
    });
    setSelectedItem({ type: "sketchLine", id });
  };

  const groupSelectedSketchLines = (nameTag: string) => {
    const lineIds = selectedSketchLineIds.filter((id) =>
      sketchLines.some((line) => line.id === id),
    );
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

    setSketchLines((items) =>
      items.map((line) => (lineIds.includes(line.id) ? { ...line, groupId } : line)),
    );
    setSketchGroups((items) => [...items, group]);
    setSelectedSketchLineIds([]);
    setSelectedItem({ type: "sketchGroup", id: groupId });
    setShowGroupNameModal(false);
    showToast(`${nameTag} group created`);
  };

  const buildGenerationContext = () => {
    const selectedGroup =
      selectedItem.type === "sketchGroup"
        ? sketchGroups.find((group) => group.id === selectedItem.id)
        : undefined;
    const selectedObject =
      selectedItem.type === "object"
        ? addedObjects.find((object) => object.id === selectedItem.id)
        : undefined;
    const selectedTarget = selectedGroup ?? selectedObject;
    const assetIds =
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
        : `Target object: ${selectedTarget.label}; bounds: ${JSON.stringify({ x: selectedTarget.x, y: selectedTarget.y, w: selectedTarget.w, h: selectedTarget.h })}.`;

    const referenceSummary =
      assets.length > 0
        ? `Use local library references: ${assets.map((asset) => `${asset.title ?? "Untitled"} (${asset.metadata?.categoryHint ?? "asset"})`).join("; ")}.`
        : "No local library references selected.";

    return { targetSummary, referenceSummary };
  };

  const generateConcept = () => {
    if (activeTool === "region" && !selectedNode) {
      showToast("Select an image first");
      return;
    }

    if (activeTool === "region" && (!selectedNode?.regionMask || selectedNode.regionMask.selectionRatio <= 0)) {
      showToast("No region selected");
      return;
    }

    if (activeTool === "region" && !promptText.trim()) {
      showToast("Enter a prompt");
      return;
    }

    const generationContext = buildGenerationContext();
    const regionPayload =
      activeTool === "region" && selectedNode?.regionMask
        ? {
            imageId: selectedNode.id,
            prompt: promptText.trim(),
            mask: selectedNode.regionMask,
          }
        : null;

    setIsGeneratingRegion(activeTool === "region");
    setMockConcepts([]);
    setNodes((items) =>
      items.map((node) =>
        node.role === "output"
          ? {
              ...node,
              prompt: [
                promptText || "Canvas generation request",
                generationContext.targetSummary,
                generationContext.referenceSummary,
                regionPayload
                  ? `Region edit payload: ${JSON.stringify({
                      imageId: regionPayload.imageId,
                      prompt: regionPayload.prompt,
                      mask: {
                        width: regionPayload.mask.width,
                        height: regionPayload.mask.height,
                        selectionRatio: Number(regionPayload.mask.selectionRatio.toFixed(4)),
                      },
                    })}`
                  : "Region edit target: none.",
              ].join("\n"),
            }
          : node,
      ),
    );
    window.setTimeout(() => {
      setMockConcepts(["Concept A", "Concept B", "Concept C"]);
      setIsGeneratingRegion(false);
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

  const pushMaskHistoryCheckpoint = (nodeId: string) => {
    setNodes((items) =>
      items.map((node) => {
        if (node.id !== nodeId) return node;
        const history = node.maskHistory || { past: [], future: [] };
        const nextPast = [...history.past, node.regionMask].slice(-MAX_MASK_HISTORY);
        return {
          ...node,
          maskHistory: {
            past: nextPast,
            future: [],
          },
        };
      }),
    );
  };

  const commitMaskData = (nodeId: string, newMask: MaskData | undefined) => {
    setNodes((items) =>
      items.map((node) =>
        node.id === nodeId
          ? {
              ...node,
              regionMask: newMask,
            }
          : node,
      ),
    );
  };

  const undoMask = (nodeId: string) => {
    setNodes((items) =>
      items.map((node) => {
        if (node.id !== nodeId) return node;
        const history = node.maskHistory;
        if (!history || history.past.length === 0) {
          showToast("Nothing to undo for this mask");
          return node;
        }
        const previousMask = history.past[history.past.length - 1];
        const newPast = history.past.slice(0, -1);
        const currentMask = node.regionMask;
        return {
          ...node,
          regionMask: previousMask,
          maskHistory: {
            past: newPast,
            future: [currentMask, ...history.future],
          },
        };
      }),
    );
  };

  const redoMask = (nodeId: string) => {
    setNodes((items) =>
      items.map((node) => {
        if (node.id !== nodeId) return node;
        const history = node.maskHistory;
        if (!history || history.future.length === 0) {
          showToast("Nothing to redo for this mask");
          return node;
        }
        const nextMask = history.future[0];
        const newFuture = history.future.slice(1);
        const currentMask = node.regionMask;
        return {
          ...node,
          regionMask: nextMask,
          maskHistory: {
            past: [...history.past, currentMask],
            future: newFuture,
          },
        };
      }),
    );
  };

  // ── Return shape ────────────────────────────────────────────────────────────

  return {
    // DOM refs (needed by CanvasWorkspace for GSAP / panel resizing)
    rootRef,
    leftSidebarPanelRef,
    rightPanelRef,

    // Panel resizing hooks (expose full object so Workspace can wire ResizeHandle)
    leftSidebarResize,
    rightPanelResize,

    // Library sub-hook (folders, create, rename, etc. passed to EditorLeftSidebar)
    library,

    // ── Canvas state ──────────────────────────────────────────────────────────
    state: {
      selectedItem,
      activeTool,
      gridVisible,
      markers,
      addedObjects,
      sketchLines,
      sketchGroups,
      penStrokes,
      penSettings,
      selectedSketchLineIds,
      nodes,
      edges,
      promptText,
      mockConcepts,
      outputAngles,
      activeNodeId,
      leftSidebar,
      miniMapOpen,
      rightPanelOpen,
      canvasThemeColor,
      selectedLibraryAssetId,
      pendingLibraryInsertAsset,
      pendingPresetGroupInsert,
      brushMode,
      regionSelectionTool,
      brushSize,
      brushSoftness,
      maskTrigger,
      isGeneratingRegion,
      // derived
      allLibraryAssets,
      canvasThemeStyle,
      isResizingPanel,
      selectedNode,
    },

    // ── Modal visibility ──────────────────────────────────────────────────────
    modals: {
      showQuickEditModal,
      showMultiAngleModal,
      showAddObjectMenu,
      showRealityCheckPanel,
      showGroupNameModal,
    },

    // ── Toast ─────────────────────────────────────────────────────────────────
    toast,

    // ── Actions / commands ────────────────────────────────────────────────────
    actions: {
      // Toast
      showToast,

      // Sidebar
      toggleLeftSidebarPanel,
      openLeftSidebar,
      closeLeftSidebar: () => setLeftSidebar((c) => ({ ...c, open: false })),
      toggleMiniMap: () => setMiniMapOpen((v) => !v),
      openRightPanel: () => setRightPanelOpen(true),
      closeRightPanel: () => setRightPanelOpen(false),

      // Tool & selection
      handleTool,
      exitRegionMode: () => setActiveTool("select"),
      handleSelectItem,

      // Pen strokes
      addPenStroke,
      replacePenStrokes,
      deletePenStroke,
      setPenSettings,

      // Region Brush
      setBrushMode,
      setRegionSelectionTool,
      setBrushSize,
      setBrushSoftness,
      pushMaskHistoryCheckpoint,
      commitMaskData,
      undoMask,
      redoMask,
      triggerMaskAction: (action: "invert" | "clear") => setMaskTrigger({ action, timestamp: Date.now() }),

      // Sketch
      addSketchLine,
      selectSketchLine,
      groupSelectedSketchLines,

      // Canvas entity mutations
      handleImageAction,
      addObject,
      uploadAssetsToFolder,

      // Nodes & edges (passthrough setters for CanvasBoard)
      setNodes,
      setEdges,
      setActiveNodeId,

      // Prompt
      setPromptText,

      // Generation
      generateConcept,
      generateAngles,
      applyQuickEdit,

      // Library insert
      setSelectedLibraryAssetId,
      setPendingLibraryInsertAsset,
      consumePendingLibraryInsert: () => setPendingLibraryInsertAsset(null),
      queuePresetGroupInsert: setPendingPresetGroupInsert,
      consumePendingPresetGroupInsert: () => setPendingPresetGroupInsert(null),
      upsertPresetGroup,
      setActivePresetChild,
      removePresetChild,
      movePresetChild,

      // Theme
      setCanvasThemeColor,

      // Modal toggles
      setShowQuickEditModal,
      setShowMultiAngleModal,
      setShowAddObjectMenu,
      setShowRealityCheckPanel,
      setShowGroupNameModal,
      toggleGrid: () => setGridVisible((v) => !v),
    },
  };
}

export type CanvasWorkspaceHook = ReturnType<typeof useCanvasWorkspace>;
