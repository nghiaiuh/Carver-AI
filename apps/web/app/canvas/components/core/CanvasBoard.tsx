/*
 * Flow: Renders one interactive canvas workspace component.
 * 1. Receive canvas state and callbacks from the workspace.
 * 2. Render the focused control, overlay, or board UI.
 * 3. Send user actions back up through typed handlers.
 */

"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown,
  Download,
  Group,
  History,
  Layers3,
  LoaderCircle,
  Menu,
  Sparkles,
  Ungroup,
  Zap,
} from "lucide-react";
import { getCanvasText, type CanvasLanguage } from "../../i18n";
import type {
  AddedObject,
  CanvasEdge,
  MaskData,
  CanvasNode,
  CanvasPresetChild,
  CanvasPresetGroupNode,
  EditorTool,
  LeftSidebarPanelId,
  Marker,
  PenSettings,
  PresetGroupCategory,
  PenStrokeObject,
  RegionBrushMode,
  RegionSelectionTool,
  SelectedItem,
  SketchGroup,
  SketchLine,
} from "../../types/canvas";
import { getDefaultInputPorts } from "../../types/canvas";
import type { LibraryAsset } from "../../types/library";
import BottomToolDock from "./BottomToolDock";
import CanvasNodeCard from "./CanvasNodeCard";
import CanvasPresetGroupNodeCard from "./CanvasPresetGroupNodeCard";
import CanvasEdges from "./CanvasEdges";
import PenStrokeLayer from "../widgets/PenStrokeLayer";
import RegionMaskLightbox from "../widgets/RegionMaskLightbox";
import { clonePenStrokes, erasePenStrokesBySquare } from "../widgets/eraserUtils";
import {
  getImageHandlePoint,
  inferConnectionRoleFromNode,
  type ImageHandlePosition,
} from "./canvasConnectionGeometry";
import {
  buildPresetSourceImage,
  getPresetChildRightAnchor,
  getPresetGroupNodeSize,
  isPresetGroupNode,
  resolvePresetGroupDropTarget,
  syncPresetGroupPreview,
} from "../../utils/presetGroupHelpers";

type CanvasBoardProps = {
  projectId?: string;
  language: CanvasLanguage;
  onLanguageChange: (language: CanvasLanguage) => void;
  selectedItem: SelectedItem;
  activeTool: EditorTool;
  markers: Marker[];
  addedObjects: AddedObject[];
  sketchLines: SketchLine[];
  sketchGroups: SketchGroup[];
  penStrokes: PenStrokeObject[];
  penSettings: PenSettings;
  selectedSketchLineIds: string[];
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  onSelect: (item: SelectedItem) => void;
  onImageAction: (xPercent: number, yPercent: number) => void;
  onAddSketchLine: (line: SketchLine) => void;
  onAddPenStroke: (stroke: PenStrokeObject) => void;
  onDeletePenStroke: (strokeId: string) => void;
  onReplacePenStrokes: (strokes: PenStrokeObject[]) => void;
  onPenSettingsChange: (settings: PenSettings) => void;
  onSelectSketchLine: (id: string, additive: boolean) => void;
  onSelectSketchGroup: (id: string) => void;
  onTool: (tool: EditorTool) => void;
  onQuickEdit: () => void;
  onMultiAngle: () => void;
  onAddObject: () => void;
  onRealityCheck: () => void;
  onGenerate: () => void;
  onSaveSnapshot: () => void;
  onToast: (message: string) => void;
  onNodesChange: (nodes: CanvasNode[] | ((prev: CanvasNode[]) => CanvasNode[])) => void;
  onEdgesChange: (edges: CanvasEdge[] | ((prev: CanvasEdge[]) => CanvasEdge[])) => void;
  activeGenerationTargetId: string | null;
  activeNodeId: string | null;
  onSetActiveNode: (id: string) => void;
  isSnapshotLoading: boolean;
  isSnapshotSaving: boolean;
  currentSnapshotMeta: {
    snapshotId: string;
    version: number;
    createdAt: string;
  } | null;
  hasUnsavedSnapshotChanges: boolean;
  canvasThemeColor: string;
  onCanvasThemeChange: (color: string) => void;
  activeLeftSidebarPanel: LeftSidebarPanelId | null;
  onToggleLeftSidebarPanel: (panel: LeftSidebarPanelId) => void;
  miniMapOpen: boolean;
  onToggleMiniMap: () => void;
  pendingLibraryInsertAsset: LibraryAsset | null;
  onConsumePendingLibraryInsert: () => void;
  pendingPresetGroupInsert: {
    category: PresetGroupCategory;
    title: string;
    children: CanvasPresetChild[];
    sourceFolderId?: string;
  } | null;
  onConsumePendingPresetGroupInsert: () => void;
  isResizingPanel?: boolean;
  selectedNode: CanvasNode | null;
  onSetActivePresetChild: (nodeId: string, childId: string) => void;
  onRemovePresetChild: (nodeId: string, childId: string) => void;
  onMovePresetChild: (nodeId: string, childId: string, direction: "left" | "right") => void;
  brushMode: RegionBrushMode;
  regionSelectionTool: RegionSelectionTool;
  brushSize: number;
  brushSoftness: number;
  maskTrigger: { action: "invert" | "clear"; timestamp: number } | null;
  onBeginMaskChange: (nodeId: string) => void;
  onCommitMask: (nodeId: string, mask: MaskData | undefined) => void;
  onUndoMask: (nodeId: string) => void;
  onRedoMask: (nodeId: string) => void;
  onBrushSizeChange: (value: number) => void;
  onBrushSoftnessChange: (value: number) => void;
  onCloseRegionEditor: () => void;
};

type DeletedNodeSnapshot = {
  node: CanvasNode;
  edges: CanvasEdge[];
};

type Point = {
  x: number;
  y: number;
};

type SelectionRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type MarqueeSelectionState = {
  isSelecting: boolean;
  startPoint: Point | null;
  currentPoint: Point | null;
  rect: SelectionRect | null;
};

type ImageSourceMetadata = {
  mimeType?: string;
  sizeBytes?: number;
  name?: string;
  role?: CanvasNode["role"];
  preserveTitle?: boolean;
};

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.1;
const WHEEL_ZOOM_SENSITIVITY = 0.0035;
const MAX_PASTED_IMAGE_WIDTH = 420;
const MAX_PASTED_IMAGE_HEIGHT = 320;
const FALLBACK_PASTED_IMAGE_WIDTH = 240;
const FALLBACK_PASTED_IMAGE_HEIGHT = 180;
const DEFAULT_DEVICE_PIXEL_RATIO = 1;
const MINIMAP_WORLD_PADDING = 48;
const MINIMAP_DRAG_SPEED = 0.8;
const MARQUEE_SELECTION_THRESHOLD = 5;
const MULTI_SELECT_TOOLBAR_MIN_SELECTION = 2;
const MIN_POINT_DISTANCE = 1.5;
const ERASER_BASE_SIZE = 18;
const ERASER_MIN_SIZE = 12;
const ERASER_MAX_SIZE = 60;
const ERASER_SPEED_SCALE = 0.17;
const ERASER_SIZE_SMOOTHING = 0.22;

const TOOL_LABELS: Record<EditorTool, string> = {
  select: "Select",
  pen: "Sketch Pen",
  eraser: "Erase Notes",
  "mark-position": "Marker",
  "add-source": "Add Source",
  grid: "Grid",
  "text-note": "Text Note",
  "add-object": "Object",
  generate: "Generate",
  "edit-elements": "Edit Elements",
  "move-object": "Move Object",
  region: "Region Edit",
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getNodeDisplayBounds(node: CanvasNode) {
  const scale = node.scale ?? 1;
  return {
    x: node.x,
    y: node.y,
    width: node.width * scale,
    height: node.height * scale,
  };
}

function getPointerPointInContainer(event: PointerEvent | React.PointerEvent | WheelEvent, container: HTMLElement): Point {
  const rect = container.getBoundingClientRect();

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function getCursorPointRelativeToContainer(event: WheelEvent, container: HTMLElement): Point {
  return getPointerPointInContainer(event, container);
}

function getNextPanForCursorZoom({
  cursorX,
  cursorY,
  prevPan,
  prevZoom,
  nextZoom,
}: {
  cursorX: number;
  cursorY: number;
  prevPan: Point;
  prevZoom: number;
  nextZoom: number;
}): Point {
  const worldX = (cursorX - prevPan.x) / prevZoom;
  const worldY = (cursorY - prevPan.y) / prevZoom;

  return {
    x: cursorX - worldX * nextZoom,
    y: cursorY - worldY * nextZoom,
  };
}

function getWorldPointFromPointer({
  point,
  pan,
  zoom,
}: {
  point: Point;
  pan: Point;
  zoom: number;
}): Point {
  return {
    x: (point.x - pan.x) / zoom,
    y: (point.y - pan.y) / zoom,
  };
}

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function createRectFromPoints(a: Point, b: Point): SelectionRect {
  return {
    x: Math.min(a.x, b.x),
    y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

function doRectsIntersect(a: SelectionRect, b: SelectionRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function isCanvasInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;

  return Boolean(
    target.closest(
      [
        "[data-canvas-ui]",
        "[data-canvas-node-id]",
        "[data-canvas-interactive='true']",
        "button",
        "input",
        "textarea",
        "select",
        "[contenteditable='true']",
        "[role='menu']",
      ].join(","),
    ),
  );
}

function loadImageDimensions(imageUrl: string): Promise<{ width: number; height: number } | null> {
  return new Promise((resolve) => {
    const image = new window.Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve(null);
    image.src = imageUrl;
  });
}

function getDevicePixelRatio() {
  if (typeof window === "undefined") return DEFAULT_DEVICE_PIXEL_RATIO;
  return Math.max(window.devicePixelRatio || DEFAULT_DEVICE_PIXEL_RATIO, DEFAULT_DEVICE_PIXEL_RATIO);
}

function getPastedImageNodeSize(dimensions: { width: number; height: number } | null) {
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    return { width: FALLBACK_PASTED_IMAGE_WIDTH, height: FALLBACK_PASTED_IMAGE_HEIGHT };
  }

  const maxViewportScale = MAX_ZOOM * getDevicePixelRatio();
  const maxCrispWidthAtWorldScale = dimensions.width / maxViewportScale;
  const maxCrispHeightAtWorldScale = dimensions.height / maxViewportScale;
  const fitScale = Math.min(
    MAX_PASTED_IMAGE_WIDTH / maxCrispWidthAtWorldScale,
    MAX_PASTED_IMAGE_HEIGHT / maxCrispHeightAtWorldScale,
    1,
  );

  return {
    width: Math.max(1, Math.round(maxCrispWidthAtWorldScale * fitScale)),
    height: Math.max(1, Math.round(maxCrispHeightAtWorldScale * fitScale)),
  };
}

export default function CanvasBoard({
  projectId,
  language,
  onLanguageChange,
  selectedItem,
  activeTool,
  markers,
  addedObjects,
  sketchLines,
  sketchGroups,
  penStrokes,
  penSettings,
  selectedSketchLineIds,
  nodes,
  edges,
  onSelect,
  onImageAction,
  onAddSketchLine,
  onAddPenStroke,
  onDeletePenStroke,
  onReplacePenStrokes,
  onPenSettingsChange,
  onSelectSketchLine,
  onSelectSketchGroup,
  onTool,
  onQuickEdit,
  onMultiAngle,
  onAddObject,
  onRealityCheck,
  onGenerate,
  onSaveSnapshot,
  onToast,
  onNodesChange,
  onEdgesChange,
  activeGenerationTargetId,
  activeNodeId,
  onSetActiveNode,
  isSnapshotLoading,
  isSnapshotSaving,
  currentSnapshotMeta,
  hasUnsavedSnapshotChanges,
  canvasThemeColor,
  onCanvasThemeChange,
  activeLeftSidebarPanel,
  onToggleLeftSidebarPanel,
  miniMapOpen,
  onToggleMiniMap,
  pendingLibraryInsertAsset,
  onConsumePendingLibraryInsert,
  pendingPresetGroupInsert,
  onConsumePendingPresetGroupInsert,
  isResizingPanel = false,
  selectedNode,
  onSetActivePresetChild,
  onRemovePresetChild,
  onMovePresetChild,
  brushMode,
  regionSelectionTool,
  brushSize,
  brushSoftness,
  maskTrigger,
  onBeginMaskChange,
  onCommitMask,
  onUndoMask,
  onRedoMask,
  onBrushSizeChange,
  onBrushSoftnessChange,
  onCloseRegionEditor,
}: CanvasBoardProps) {
  const text = getCanvasText(language);
  const containerRef = useRef<HTMLElement>(null);
  const worldLayerRef = useRef<HTMLDivElement>(null);
  const projectMenuRef = useRef<HTMLDivElement>(null);
  const projectNameInputRef = useRef<HTMLInputElement>(null);
  const importImagesInputRef = useRef<HTMLInputElement>(null);
  const miniMapFrameRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const [viewport, setViewport] = useState<{ zoom: number; pan: Point }>({
    zoom: 1,
    pan: { x: 0, y: 0 },
  });
  const { zoom, pan } = viewport;
  const panStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const isPanning = useRef(false);
  const [isPanningCanvas, setIsPanningCanvas] = useState(false);
  const wheelZoomTimeout = useRef<number | null>(null);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [projectName, setProjectName] = useState(text.common.untitled);
  const [editingProjectName, setEditingProjectName] = useState(false);
  const [projectNameDraft, setProjectNameDraft] = useState(text.common.untitled);
  const [deletedNodeStack, setDeletedNodeStack] = useState<DeletedNodeSnapshot[]>([]);
  const [createdNodeStack, setCreatedNodeStack] = useState<CanvasNode[]>([]);
  const [createdNodeRedoStack, setCreatedNodeRedoStack] = useState<DeletedNodeSnapshot[]>([]);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [miniMapFrameSize, setMiniMapFrameSize] = useState({ width: 0, height: 0 });
  const [miniMapDragging, setMiniMapDragging] = useState(false);
  const miniMapDragPointerId = useRef<number | null>(null);
  const miniMapDragStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const marqueePointerId = useRef<number | null>(null);
  const suppressCanvasBackgroundClickRef = useRef(false);
  const [marqueeSelectedNodeIds, setMarqueeSelectedNodeIds] = useState<string[] | null>(null);
  const [marqueeSelection, setMarqueeSelection] = useState<MarqueeSelectionState>({
    isSelecting: false,
    startPoint: null,
    currentPoint: null,
    rect: null,
  });
  const selectedNodeIds = useMemo(
    () => marqueeSelectedNodeIds ?? (selectedItem.type === "node" ? [selectedItem.id] : []),
    [marqueeSelectedNodeIds, selectedItem],
  );
  const getGroupedNodeIds = useCallback((nodeId: string) => {
    const node = nodes.find((currentNode) => currentNode.id === nodeId);
    if (!node?.groupId) return [nodeId];

    return nodes
      .filter((currentNode) => currentNode.groupId === node.groupId)
      .map((currentNode) => currentNode.id);
  }, [nodes]);
  const isRegionEditing = activeTool === "region" && Boolean(selectedNode);
  const isMultiNodeSelection = selectedNodeIds.length >= MULTI_SELECT_TOOLBAR_MIN_SELECTION;
  const selectedNodes = useMemo(
    () => nodes.filter((node) => selectedNodeIds.includes(node.id)),
    [nodes, selectedNodeIds],
  );
  const selectedGroupIds = useMemo(
    () => Array.from(new Set(selectedNodes.map((node) => node.groupId).filter((groupId): groupId is string => Boolean(groupId)))),
    [selectedNodes],
  );
  const selectedUngroupedNodeCount = useMemo(
    () => selectedNodes.filter((node) => !node.groupId).length,
    [selectedNodes],
  );
  const selectedGroupingUnitCount = useMemo(
    () => selectedGroupIds.length + selectedUngroupedNodeCount,
    [selectedGroupIds.length, selectedUngroupedNodeCount],
  );
  const canGroupSelectedNodes = isMultiNodeSelection && selectedGroupingUnitCount > 1;
  const canUngroupSelectedNodes = isMultiNodeSelection && selectedGroupIds.length > 0;
  const multiSelectBounds = useMemo(() => {
    if (!isMultiNodeSelection) return null;

    const selectedRects = selectedNodes.map((node) => getNodeDisplayBounds(node));

    if (selectedRects.length === 0) return null;

    const minX = Math.min(...selectedRects.map((rect) => rect.x));
    const minY = Math.min(...selectedRects.map((rect) => rect.y));
    const maxX = Math.max(...selectedRects.map((rect) => rect.x + rect.width));
    const maxY = Math.max(...selectedRects.map((rect) => rect.y + rect.height));

    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    };
  }, [isMultiNodeSelection, selectedNodes]);

  // ── Node Dragging State ───────────────────────────────────────────────────
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const dragStart = useRef<{
    x: number;
    y: number;
    nodePositions: Record<string, { x: number; y: number }>;
  } | null>(null);
  const penPointerId = useRef<number | null>(null);
  const [draftPenStroke, setDraftPenStroke] = useState<PenStrokeObject | null>(null);
  const eraserPointerId = useRef<number | null>(null);
  const eraseSessionBeforeRef = useRef<PenStrokeObject[] | null>(null);
  const eraseSessionAfterRef = useRef<PenStrokeObject[] | null>(null);
  const eraseSessionChangedRef = useRef(false);
  const lastEraserMotionRef = useRef<{ x: number; y: number; time: number; size: number } | null>(null);
  const [eraserPreview, setEraserPreview] = useState<{ x: number; y: number; size: number; visible: boolean }>({
    x: 0,
    y: 0,
    size: ERASER_BASE_SIZE,
    visible: false,
  });
  const [penEraseUndoStack, setPenEraseUndoStack] = useState<Array<{ before: PenStrokeObject[]; after: PenStrokeObject[] }>>([]);
  const [penEraseRedoStack, setPenEraseRedoStack] = useState<Array<{ before: PenStrokeObject[]; after: PenStrokeObject[] }>>([]);

  // -- Edge Creation State
  const [draftEdge, setDraftEdge] = useState<{
    sourceId: string;
    sourceHandle: ImageHandlePosition;
    targetX: number;
    targetY: number;
    /** Set when the connection originates from a preset child thumbnail */
    sourcePresetChildId?: string;
  } | null>(null);
  const [hoveredConnectionTargetId, setHoveredConnectionTargetId] = useState<string | null>(null);
  const [hoveredPresetChildId, setHoveredPresetChildId] = useState<string | null>(null);

  const clearMarqueeSelection = useCallback(() => {
    setMarqueeSelection({
      isSelecting: false,
      startPoint: null,
      currentPoint: null,
      rect: null,
    });
    marqueePointerId.current = null;
  }, []);

  const cancelDraftPenStroke = useCallback(() => {
    setDraftPenStroke(null);
    penPointerId.current = null;
  }, []);

  const clearEraserSession = useCallback(() => {
    eraserPointerId.current = null;
    eraseSessionBeforeRef.current = null;
    eraseSessionAfterRef.current = null;
    eraseSessionChangedRef.current = false;
  }, []);

  const updateEraserPreview = useCallback((event: React.PointerEvent<HTMLElement>) => {
    const now = performance.now();
    const previousMotion = lastEraserMotionRef.current;
    let nextSize = eraserPreview.size;

    if (previousMotion) {
      const elapsed = Math.max(now - previousMotion.time, 1);
      const delta = Math.hypot(event.clientX - previousMotion.x, event.clientY - previousMotion.y);
      const velocity = delta / elapsed;
      const targetSize = clamp(ERASER_BASE_SIZE + velocity / ERASER_SPEED_SCALE, ERASER_MIN_SIZE, ERASER_MAX_SIZE);
      nextSize = previousMotion.size + (targetSize - previousMotion.size) * ERASER_SIZE_SMOOTHING;
    } else {
      nextSize = ERASER_BASE_SIZE;
    }

    lastEraserMotionRef.current = {
      x: event.clientX,
      y: event.clientY,
      time: now,
      size: nextSize,
    };

    const container = containerRef.current;
    if (!container) return null;

    const screenPoint = getPointerPointInContainer(event, container);
    const worldPoint = getWorldPointFromPointer({
      point: screenPoint,
      pan,
      zoom,
    });

    setEraserPreview({
      x: worldPoint.x,
      y: worldPoint.y,
      size: nextSize / zoom,
      visible: true,
    });

    return {
      point: worldPoint,
      worldSize: nextSize / zoom,
    };
  }, [eraserPreview.size, pan, zoom]);

  const applyEraserAt = useCallback((point: Point, worldSize: number) => {
    const nextResult = erasePenStrokesBySquare(penStrokes, point, worldSize);
    if (!nextResult.changed) return false;

    onReplacePenStrokes(nextResult.strokes);
    eraseSessionChangedRef.current = true;
    eraseSessionAfterRef.current = clonePenStrokes(nextResult.strokes);
    return true;
  }, [onReplacePenStrokes, penStrokes]);

  const undoPenErase = useCallback(() => {
    const latestAction = penEraseUndoStack.at(-1);
    if (!latestAction) return false;

    setPenEraseUndoStack((current) => current.slice(0, -1));
    setPenEraseRedoStack((current) => [...current, latestAction]);
    onReplacePenStrokes(clonePenStrokes(latestAction.before));
    onSelect({ type: "none" });
    return true;
  }, [onReplacePenStrokes, onSelect, penEraseUndoStack]);

  const redoPenErase = useCallback(() => {
    const latestAction = penEraseRedoStack.at(-1);
    if (!latestAction) return false;

    setPenEraseRedoStack((current) => current.slice(0, -1));
    setPenEraseUndoStack((current) => [...current, latestAction]);
    onReplacePenStrokes(clonePenStrokes(latestAction.after));
    onSelect({ type: "none" });
    return true;
  }, [onReplacePenStrokes, onSelect, penEraseRedoStack]);

  const addImageNode = useCallback(
    async (imageUrl: string, title = "Pasted Image", sourceMetadata: ImageSourceMetadata = {}) => {
      const pastePan = pan;
      const pasteZoom = zoom;
      const dimensions = await loadImageDimensions(imageUrl);
      let createdNode: CanvasNode | null = null;
      onNodesChange((prev) => {
        const isFirst = prev.length === 0;
        const { width: nodeWidth, height: nodeHeight } = getPastedImageNodeSize(dimensions);
        const rect = containerRef.current?.getBoundingClientRect();
        const viewportCenterX = rect ? rect.width / 2 : 0;
        const viewportCenterY = rect ? rect.height / 2 : 0;
        const pasteWorldCenter = getWorldPointFromPointer({
          point: { x: viewportCenterX, y: viewportCenterY },
          pan: pastePan,
          zoom: pasteZoom,
        });
        const nodeRole = sourceMetadata.role ?? (isFirst ? "layout" : "reference");
        const newNode: CanvasNode = {
          id: `node-${Date.now()}-${prev.length}`,
          x: pasteWorldCenter.x - nodeWidth / 2,
          y: pasteWorldCenter.y - nodeHeight / 2,
          width: nodeWidth,
          height: nodeHeight,
          scale: 1,
          inputPorts: getDefaultInputPorts(),
          imageUrl,
          sourceImage: {
            url: imageUrl,
            width: dimensions?.width ?? null,
            height: dimensions?.height ?? null,
            quality: "original",
            ...sourceMetadata,
          },
          title: sourceMetadata.preserveTitle || !isFirst ? title : "Site Photo",
          prompt: null,
          role: nodeRole,
        };
        createdNode = newNode;
        return [...prev, newNode];
      });
      if (createdNode) {
        setCreatedNodeStack((current) => [...current, createdNode as CanvasNode]);
        setCreatedNodeRedoStack([]);
      }
      onToast("Image added to canvas");
    },
    [onNodesChange, onToast, pan, zoom],
  );

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-prompt-composer]") || target?.closest("textarea,input,[contenteditable='true']")) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            e.preventDefault();
            addImageNode(URL.createObjectURL(blob), "Pasted Image", {
              mimeType: blob.type,
              sizeBytes: blob.size,
            });
          }
          break;
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [addImageNode]);

  useEffect(() => {
    if (!pendingLibraryInsertAsset) return;

    void addImageNode(pendingLibraryInsertAsset.src, pendingLibraryInsertAsset.title ?? "Library Asset", {
      name: pendingLibraryInsertAsset.title,
      role: "reference",
      preserveTitle: true,
    }).finally(() => {
      onConsumePendingLibraryInsert();
    });
  }, [addImageNode, onConsumePendingLibraryInsert, pendingLibraryInsertAsset]);

  // ── Preset group node creation ──────────────────────────────────────────────
  useEffect(() => {
    if (!pendingPresetGroupInsert) return;

    let createdNode: CanvasPresetGroupNode | null = null;
    onNodesChange((prev) => {
      // If a group with this category (and optionally sourceFolderId) already exists, don't create another.
      const alreadyExists = prev.some(
        (n) =>
          isPresetGroupNode(n) &&
          n.presetGroup.category === pendingPresetGroupInsert.category &&
          (pendingPresetGroupInsert.sourceFolderId
            ? n.presetGroup.sourceFolderId === pendingPresetGroupInsert.sourceFolderId
            : true),
      );
      if (alreadyExists) return prev;

      const children = pendingPresetGroupInsert.children.map((child, index) => ({
        ...child,
        order: index,
      }));
      const { width, height } = getPresetGroupNodeSize(children.length);
      const container = containerRef.current;
      const rect = container?.getBoundingClientRect();
      const viewportCenterX = rect ? rect.width / 2 : 400;
      const viewportCenterY = rect ? rect.height / 2 : 300;
      const currentPan = pan;
      const currentZoom = zoom;
      const worldCenterX = (viewportCenterX - currentPan.x) / currentZoom;
      const worldCenterY = (viewportCenterY - currentPan.y) / currentZoom;

      // Place slightly offset from center so it doesn't overlap existing nodes
      const offsetX = prev.filter((n) => isPresetGroupNode(n)).length * 20;
      const offsetY = prev.filter((n) => isPresetGroupNode(n)).length * 20;

      const firstChild = children[0];
      const newNode: CanvasPresetGroupNode = {
        id: `preset-group-${Date.now()}`,
        kind: "presetGroup",
        x: worldCenterX - width / 2 + offsetX,
        y: worldCenterY - height / 2 + offsetY,
        width,
        height,
        scale: 1,
        inputPorts: getDefaultInputPorts(),
        imageUrl: firstChild?.imageSrc ?? "",
        title: pendingPresetGroupInsert.title,
        prompt: null,
        role: "reference",
        sourceImage: firstChild
          ? buildPresetSourceImage(firstChild.imageSrc, firstChild.label)
          : undefined,
        presetGroup: {
          category: pendingPresetGroupInsert.category,
          activeChildId: firstChild?.id ?? null,
          children,
          sourceFolderId: pendingPresetGroupInsert.sourceFolderId,
        },
      };
      createdNode = newNode;
      return [...prev, newNode];
    });

    if (createdNode) {
      setCreatedNodeStack((current) => [...current, createdNode as CanvasPresetGroupNode]);
      setCreatedNodeRedoStack([]);
    }
    onConsumePendingPresetGroupInsert();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPresetGroupInsert]);


  // ── Wheel zoom ──────────────────────────────────────────────────────────────
  const handleWheel = useCallback((event: WheelEvent) => {
    if (isRegionEditing) return;
    event.preventDefault();

    const container = containerRef.current;
    if (!container) return;

    if (wheelZoomTimeout.current) {
      window.clearTimeout(wheelZoomTimeout.current);
    }

    wheelZoomTimeout.current = window.setTimeout(() => {
      wheelZoomTimeout.current = null;
    }, 90);

    const cursor = getCursorPointRelativeToContainer(event, container);

    setViewport((prev) => {
      const delta = clamp(-event.deltaY * WHEEL_ZOOM_SENSITIVITY, -ZOOM_STEP, ZOOM_STEP);
      const nextZoom = clamp(prev.zoom + delta, MIN_ZOOM, MAX_ZOOM);

      if (nextZoom === prev.zoom) return prev;

      return {
        zoom: nextZoom,
        pan: getNextPanForCursorZoom({
          cursorX: cursor.x,
          cursorY: cursor.y,
          prevPan: prev.pan,
          prevZoom: prev.zoom,
          nextZoom,
        }),
      };
    });
  }, [isRegionEditing]);

  const handleCanvasPointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (isRegionEditing) return;
      if (isResizingPanel) return;
      const isMiddle = event.button === 1;
      const isSpace = (event.nativeEvent as unknown as { _spaceHeld?: boolean })._spaceHeld;
      if (isMiddle || isSpace) {
        event.preventDefault();
        isPanning.current = true;
        setIsPanningCanvas(true);
        panStart.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
        return;
      }

      if (event.button !== 0) return;
      if (activeTool === "pen") {
        event.stopPropagation();
        if (draggingNodeId || draftEdge || miniMapDragging || isPanning.current) return;
        if (isCanvasInteractiveTarget(event.target)) return;

        const container = containerRef.current;
        if (!container) return;

        const screenPoint = getPointerPointInContainer(event, container);
        const startPoint = getWorldPointFromPointer({
          point: screenPoint,
          pan,
          zoom,
        });

        penPointerId.current = event.pointerId;
        setDraftPenStroke({
          id: `pen-stroke-${Date.now()}`,
          type: "pen-stroke",
          points: [startPoint],
          color: penSettings.color,
          opacity: penSettings.opacity,
          strokeWidth: penSettings.strokeWidth,
          createdAt: new Date().toISOString(),
        });
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
      if (activeTool === "eraser") {
        event.stopPropagation();
        if (draggingNodeId || draftEdge || miniMapDragging || isPanning.current) return;
        if (isCanvasInteractiveTarget(event.target)) return;

        eraserPointerId.current = event.pointerId;
        eraseSessionBeforeRef.current = clonePenStrokes(penStrokes);
        eraseSessionAfterRef.current = clonePenStrokes(penStrokes);
        eraseSessionChangedRef.current = false;
        const preview = updateEraserPreview(event);
        if (preview) {
          applyEraserAt(preview.point, preview.worldSize);
        }
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
      if (activeTool !== "select") return;
      if (draggingNodeId || draftEdge || miniMapDragging || isPanning.current) return;
      if (isCanvasInteractiveTarget(event.target)) return;

      const container = containerRef.current;
      if (!container) return;

      const screenPoint = getPointerPointInContainer(event, container);
      const startPoint = getWorldPointFromPointer({
        point: screenPoint,
        pan,
        zoom,
      });

      marqueePointerId.current = event.pointerId;
      setMarqueeSelection({
        isSelecting: true,
        startPoint,
        currentPoint: startPoint,
        rect: null,
      });
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [activeTool, applyEraserAt, draftEdge, draggingNodeId, isRegionEditing, isResizingPanel, miniMapDragging, pan, penSettings.color, penSettings.opacity, penSettings.strokeWidth, penStrokes, updateEraserPreview, zoom],
  );

  // ── Node Dragging logic ───────────────────────────────────────────────────
  const handleNodePointerDown = (id: string, event: React.PointerEvent) => {
    if (isResizingPanel) return;
    const node = nodes.find(n => n.id === id);
    if (!node) return;
    const groupedNodeIds = getGroupedNodeIds(id);
    const dragNodeIds =
      groupedNodeIds.length > 1
        ? groupedNodeIds
        : selectedNodeIds.includes(id)
          ? selectedNodeIds
          : [id];
    const nodePositions = Object.fromEntries(
      nodes
        .filter((currentNode) => dragNodeIds.includes(currentNode.id))
        .map((currentNode) => [currentNode.id, { x: currentNode.x, y: currentNode.y }]),
    );
    // Prevent browser text-selection on header/toolbar elements during drag
    event.preventDefault();
    clearMarqueeSelection();
    if (dragNodeIds.length <= 1) {
      setMarqueeSelectedNodeIds(null);
    }
    setDraggingNodeId(id);
    dragStart.current = {
      x: event.clientX,
      y: event.clientY,
      nodePositions,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleGroupSelectedNodes = useCallback(() => {
    if (!canGroupSelectedNodes) return;

    const nextGroupId = `node-group-${Date.now()}`;
    onNodesChange((previousNodes) =>
      previousNodes.map((node) =>
        selectedNodeIds.includes(node.id)
          ? { ...node, groupId: nextGroupId }
          : node,
      ),
    );
    setMarqueeSelectedNodeIds(selectedNodeIds);
    onSelect({ type: "node", id: selectedNodeIds[0] });
    onToast("Grouped selected images");
  }, [canGroupSelectedNodes, onNodesChange, onSelect, onToast, selectedNodeIds]);

  const handleUngroupSelectedNodes = useCallback(() => {
    if (!canUngroupSelectedNodes) return;

    const selectedGroupedNodeIds = selectedNodes
      .filter((node) => node.groupId)
      .map((node) => node.id);

    if (selectedGroupedNodeIds.length === 0) return;

    const selectedGroupedNodeIdSet = new Set(selectedGroupedNodeIds);
    onNodesChange((previousNodes) =>
      previousNodes.map((node) =>
        selectedGroupedNodeIdSet.has(node.id)
          ? { ...node, groupId: undefined }
          : node,
      ),
    );
    setMarqueeSelectedNodeIds(selectedGroupedNodeIds);
    onSelect({ type: "node", id: selectedGroupedNodeIds[0] });
    onToast("Ungrouped selected images");
  }, [canUngroupSelectedNodes, onNodesChange, onSelect, onToast, selectedNodes]);

  const handleConnectionHandlePointerDown = useCallback(
    (nodeId: string, handle: ImageHandlePosition, event: React.PointerEvent<HTMLButtonElement>) => {
      if (isResizingPanel) return;
      event.preventDefault();
      event.stopPropagation();

      const sourceNode = nodes.find((node) => node.id === nodeId);
      if (!sourceNode) return;

      const startPoint = getImageHandlePoint(sourceNode, handle);
      setDraftEdge({
        sourceId: nodeId,
        sourceHandle: handle,
        targetX: startPoint.x,
        targetY: startPoint.y,
      });
      setHoveredConnectionTargetId(null);
    },
    [isResizingPanel, nodes],
  );

  /**
   * Initiates a connection drag directly from a preset child thumbnail.
   * The draft line starts from the right-center anchor of that child's thumbnail rect.
   */
  const handlePresetChildConnectionStart = useCallback(
    (nodeId: string, childId: string, event: React.PointerEvent<HTMLElement>) => {
      if (isResizingPanel) return;
      event.preventDefault();
      event.stopPropagation();

      const sourceNode = nodes.find((n) => n.id === nodeId);
      if (!sourceNode || !isPresetGroupNode(sourceNode)) return;

      const anchor = getPresetChildRightAnchor(sourceNode, childId);
      if (!anchor) return;

      setDraftEdge({
        sourceId: nodeId,
        sourceHandle: "right",
        targetX: anchor.x,
        targetY: anchor.y,
        sourcePresetChildId: childId,
      });
      setHoveredConnectionTargetId(null);
    },
    [isResizingPanel, nodes],
  );

  // ── Edge Draft logic ──────────────────────────────────────────────────────
  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (isRegionEditing) return;
    if (isResizingPanel) return;
    if (isPanning.current && panStart.current) {
      const start = panStart.current;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      setViewport((prev) => ({ ...prev, pan: { x: start.panX + dx, y: start.panY + dy } }));
      return;
    }

    if (activeTool === "pen" && draftPenStroke && penPointerId.current === event.pointerId) {
      event.stopPropagation();
      const container = containerRef.current;
      if (!container) return;
      const screenPoint = getPointerPointInContainer(event, container);
      const currentPoint = getWorldPointFromPointer({
        point: screenPoint,
        pan,
        zoom,
      });

      setDraftPenStroke((currentStroke) => {
        if (!currentStroke) return currentStroke;

        const lastPoint = currentStroke.points[currentStroke.points.length - 1];
        if (distance(lastPoint, currentPoint) < MIN_POINT_DISTANCE) {
          return currentStroke;
        }

        return {
          ...currentStroke,
          points: [...currentStroke.points, currentPoint],
        };
      });
      return;
    }

    if (activeTool === "eraser") {
      const preview = updateEraserPreview(event);
      if (eraserPointerId.current === event.pointerId && preview) {
        event.stopPropagation();
        applyEraserAt(preview.point, preview.worldSize);
      }
      return;
    }

    if (marqueeSelection.isSelecting && marqueeSelection.startPoint) {
      const container = containerRef.current;
      if (!container) return;
      const screenPoint = getPointerPointInContainer(event, container);
      const currentPoint = getWorldPointFromPointer({
        point: screenPoint,
        pan,
        zoom,
      });
      const hasExceededThreshold =
        Math.abs(currentPoint.x - marqueeSelection.startPoint.x) > MARQUEE_SELECTION_THRESHOLD / zoom ||
        Math.abs(currentPoint.y - marqueeSelection.startPoint.y) > MARQUEE_SELECTION_THRESHOLD / zoom;

      setMarqueeSelection({
        isSelecting: true,
        startPoint: marqueeSelection.startPoint,
        currentPoint,
        rect: hasExceededThreshold ? createRectFromPoints(marqueeSelection.startPoint, currentPoint) : null,
      });
      return;
    }

    if (draggingNodeId && dragStart.current) {
      const dx = (event.clientX - dragStart.current.x) / zoom;
      const dy = (event.clientY - dragStart.current.y) / zoom;
      const draggedNodeIds = Object.keys(dragStart.current.nodePositions);

      onNodesChange(prev => prev.map((currentNode) => {
        const startPosition = dragStart.current?.nodePositions[currentNode.id];
        if (!startPosition || !draggedNodeIds.includes(currentNode.id)) return currentNode;

        return {
          ...currentNode,
          x: startPosition.x + dx,
          y: startPosition.y + dy,
        };
      }));
      return;
    }

    if (draftEdge) {
      const container = containerRef.current;
      if (!container) return;
      const screenPoint = getPointerPointInContainer(event, container);
      const target = getWorldPointFromPointer({
        point: screenPoint,
        pan,
        zoom,
      });

      setDraftEdge(prev => prev ? { ...prev, targetX: target.x, targetY: target.y } : null);
      const hoveredNode = nodes.find((node) => {
        if (node.id === draftEdge.sourceId) return false;
        // Rule: only 1 connection line between any 2 images — skip already-connected pairs
        const alreadyConnected = edges.some(
          (e) =>
            (e.sourceId === draftEdge.sourceId && e.targetId === node.id) ||
            (e.sourceId === node.id && e.targetId === draftEdge.sourceId),
        );
        if (alreadyConnected) return false;
        const scale = node.scale ?? 1;
        return (
          target.x >= node.x &&
          target.x <= node.x + node.width * scale &&
          target.y >= node.y &&
          target.y <= node.y + node.height * scale
        );
      });
      setHoveredConnectionTargetId(hoveredNode?.id ?? null);
    }

  }, [activeTool, applyEraserAt, draftEdge, draftPenStroke, draggingNodeId, edges, isRegionEditing, isResizingPanel, marqueeSelection, nodes, onNodesChange, pan, updateEraserPreview, zoom]);

  const handlePointerUp = useCallback((event: React.PointerEvent) => {
    if (isRegionEditing) return;
    if (isResizingPanel) return;
    if (activeTool === "pen" && penPointerId.current === event.pointerId) {
      event.stopPropagation();
      if (draftPenStroke && draftPenStroke.points.length > 0) {
        onAddPenStroke(
          draftPenStroke.points.length === 1
            ? {
              ...draftPenStroke,
              points: [...draftPenStroke.points, draftPenStroke.points[0]],
            }
            : draftPenStroke,
        );
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      cancelDraftPenStroke();
      return;
    }

    if (activeTool === "eraser" && eraserPointerId.current === event.pointerId) {
      event.stopPropagation();
      if (eraseSessionChangedRef.current && eraseSessionBeforeRef.current && eraseSessionAfterRef.current) {
        setPenEraseUndoStack((current) => [
          ...current,
          {
            before: eraseSessionBeforeRef.current!,
            after: eraseSessionAfterRef.current!,
          },
        ]);
        setPenEraseRedoStack([]);
      }

      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }

      clearEraserSession();
      return;
    }

    if (marqueeSelection.isSelecting && marqueeSelection.startPoint) {
      const container = containerRef.current;
      if (container) {
        const screenPoint = getPointerPointInContainer(event, container);
        const currentPoint = getWorldPointFromPointer({
          point: screenPoint,
          pan,
          zoom,
        });
        const hasExceededThreshold =
          Math.abs(currentPoint.x - marqueeSelection.startPoint.x) > MARQUEE_SELECTION_THRESHOLD / zoom ||
          Math.abs(currentPoint.y - marqueeSelection.startPoint.y) > MARQUEE_SELECTION_THRESHOLD / zoom;

        if (hasExceededThreshold) {
          const rect = createRectFromPoints(marqueeSelection.startPoint, currentPoint);
          const hitNodeIds = nodes
            .filter((node) => doRectsIntersect(rect, getNodeDisplayBounds(node)))
            .map((node) => node.id);
          suppressCanvasBackgroundClickRef.current = true;

          const nextSelectedNodeIds = event.shiftKey
            ? Array.from(new Set([...selectedNodeIds, ...hitNodeIds]))
            : hitNodeIds;

          setMarqueeSelectedNodeIds(nextSelectedNodeIds);
          if (nextSelectedNodeIds.length > 0) {
            onSelect({ type: "node", id: nextSelectedNodeIds[0] });
          } else if (!event.shiftKey) {
            onSelect({ type: "none" });
          }
        } else if (!event.shiftKey) {
          setMarqueeSelectedNodeIds(null);
        }
      }

      if (marqueePointerId.current === event.pointerId && event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      clearMarqueeSelection();
      return;
    }

    isPanning.current = false;
    setIsPanningCanvas(false);
    panStart.current = null;
    setDraggingNodeId(null);
    dragStart.current = null;

    if (draftEdge) {
      // Find what we dropped on (if we dropped on a node)
      // This is a bit tricky because pointer events might be captured.
      // So we use elementFromPoint
      // Actually, since we release pointer capture, it should be fine.
      // Alternatively, we calculate intersection
      const container = containerRef.current;
      if (container) {
        const screenPoint = getPointerPointInContainer(event, container);
        const drop = getWorldPointFromPointer({
          point: screenPoint,
          pan,
          zoom,
        });

        // Check if drop is inside any node
        const targetNode = nodes.find((node) => {
          const scale = node.scale ?? 1;
          return (
            node.id !== draftEdge.sourceId &&
            drop.x >= node.x &&
            drop.x <= node.x + node.width * scale &&
            drop.y >= node.y &&
            drop.y <= node.y + node.height * scale
          );
        });

        if (targetNode) {
          const sourceNode = nodes.find((node) => node.id === draftEdge.sourceId);
          const role = sourceNode ? inferConnectionRoleFromNode(sourceNode) : "generic_reference";
          const sourceIsPresetGroup = sourceNode ? isPresetGroupNode(sourceNode) : false;

          // Duplicate check:
          // - If originating from a specific preset child → allow multiple connections from the
          //   same group node but not from the same child to the same target.
          // - Otherwise → 1 connection between any 2 nodes (existing behaviour).
          const edgeExists = draftEdge.sourcePresetChildId
            ? edges.some(
              (edge) =>
                edge.sourceId === draftEdge.sourceId &&
                edge.sourcePresetChildId === draftEdge.sourcePresetChildId &&
                edge.targetId === targetNode.id,
            )
            : sourceIsPresetGroup
              ? edges.some(
                (edge) =>
                  edge.sourceId === draftEdge.sourceId &&
                  edge.targetId === targetNode.id &&
                  !edge.sourcePresetChildId,
              )
              : edges.some(
                (edge) =>
                  (edge.sourceId === draftEdge.sourceId && edge.targetId === targetNode.id) ||
                  (edge.sourceId === targetNode.id && edge.targetId === draftEdge.sourceId),
              );

          if (edgeExists) {
            onToast("These two images are already connected");
          } else {
            const targetPorts = targetNode.inputPorts || getDefaultInputPorts();
            const connectedPortIds = new Set(
              edges.filter((e) => e.targetId === targetNode.id).map((e) => e.targetPortId)
            );
            const firstEmpty = targetPorts.find((p) => !connectedPortIds.has(p.id));
            const targetPortId = firstEmpty ? firstEmpty.id : targetPorts[0].id;

            const newEdge: CanvasEdge = {
              id: `edge-${Date.now()}`,
              sourceId: draftEdge.sourceId,
              targetId: targetNode.id,
              targetPortId,
              fromHandle: draftEdge.sourceHandle,
              toHandle: draftEdge.sourceHandle === "right" ? "left" : "right",
              role,
              label: role.replace("_reference", "").replaceAll("_", " "),
              createdAt: new Date().toISOString(),
              // Store which child originated this edge so CanvasEdges can anchor correctly
              ...(draftEdge.sourcePresetChildId ? { sourcePresetChildId: draftEdge.sourcePresetChildId } : {}),
            };
            onEdgesChange(prev => [...prev, newEdge]);
            setMarqueeSelectedNodeIds(null);
            onSelect({ type: "edge", id: newEdge.id });
            onToast("Connection created");
          }
        }
      }
      setDraftEdge(null);
      setHoveredConnectionTargetId(null);
    }
  }, [activeTool, cancelDraftPenStroke, clearEraserSession, clearMarqueeSelection, draftEdge, draftPenStroke, edges, isRegionEditing, isResizingPanel, marqueeSelection, nodes, onAddPenStroke, onEdgesChange, onSelect, onToast, pan, selectedNodeIds, zoom]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  useEffect(() => {
    const container = containerRef.current;
    const miniMapFrame = miniMapFrameRef.current;
    if (!container || !miniMapFrame || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      setContainerSize({
        width: container.clientWidth,
        height: container.clientHeight,
      });
      setMiniMapFrameSize({
        width: miniMapFrame.clientWidth,
        height: miniMapFrame.clientHeight,
      });
    });

    observer.observe(container);
    observer.observe(miniMapFrame);

    setContainerSize({
      width: container.clientWidth,
      height: container.clientHeight,
    });
    setMiniMapFrameSize({
      width: miniMapFrame.clientWidth,
      height: miniMapFrame.clientHeight,
    });

    return () => observer.disconnect();
  }, [miniMapOpen]);

  useEffect(() => {
    return () => {
      if (wheelZoomTimeout.current) window.clearTimeout(wheelZoomTimeout.current);
    };
  }, []);

  useEffect(() => {
    if (activeTool === "eraser") return;

    lastEraserMotionRef.current = null;
    clearEraserSession();
  }, [activeTool, clearEraserSession]);

  useEffect(() => {
    if (!projectMenuOpen) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!projectMenuRef.current) return;
      if (!projectMenuRef.current.contains(event.target as Node)) {
        setProjectMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [projectMenuOpen]);

  useEffect(() => {
    if (!editingProjectName) return;
    projectNameInputRef.current?.focus();
    projectNameInputRef.current?.select();
  }, [editingProjectName]);

  const startEditingProjectName = () => {
    setProjectNameDraft(projectName);
    setEditingProjectName(true);
    setProjectMenuOpen(false);
  };

  const commitProjectName = () => {
    const next = projectNameDraft.trim();
    if (next) setProjectName(next);
    setEditingProjectName(false);
  };

  const cancelProjectName = () => {
    setProjectNameDraft(projectName);
    setEditingProjectName(false);
  };

  const handleMenuSelect = (item: MenuItem) => {
    setProjectMenuOpen(false);
    item.onSelect?.();
  };

  const importImages = (files: FileList | null) => {
    if (!files?.length) return;
    Array.from(files)
      .filter((file) => file.type.startsWith("image/"))
      .forEach((file) =>
        addImageNode(URL.createObjectURL(file), file.name, {
          mimeType: file.type,
          name: file.name,
          sizeBytes: file.size,
        }),
      );
    if (importImagesInputRef.current) importImagesInputRef.current.value = "";
  };

  const deleteNode = useCallback(
    (nodeId: string, skipConfirm = false) => {
      const nodeToDelete = nodes.find((node) => node.id === nodeId);
      if (!nodeToDelete) return;

      const relatedEdges = edges.filter((edge) => edge.sourceId === nodeId || edge.targetId === nodeId);

      setDeletedNodeStack((prev) => [...prev, { node: nodeToDelete, edges: relatedEdges }]);
      onNodesChange((prev) => prev.filter((node) => node.id !== nodeId));
      onEdgesChange((prev) => prev.filter((edge) => edge.sourceId !== nodeId && edge.targetId !== nodeId));
      if (activeNodeId === nodeId) {
        const nextActiveNode = nodes.find((node) => node.id !== nodeId);
        onSetActiveNode(nextActiveNode?.id ?? "");
      }
      onSelect({ type: "none" });
      onToast(isPresetGroupNode(nodeToDelete) ? "Preset folder removed" : "Image deleted");
    },
    [activeNodeId, edges, nodes, onEdgesChange, onNodesChange, onSelect, onSetActiveNode, onToast],
  );

  const undoDeleteNode = useCallback(() => {
    const snapshot = deletedNodeStack.at(-1);
    if (!snapshot) {
      return false;
    }

    setDeletedNodeStack((prev) => prev.slice(0, -1));
    onNodesChange((currentNodes) =>
      currentNodes.some((node) => node.id === snapshot.node.id) ? currentNodes : [...currentNodes, snapshot.node],
    );
    onEdgesChange((currentEdges) => [
      ...currentEdges,
      ...snapshot.edges.filter((edge) => !currentEdges.some((currentEdge) => currentEdge.id === edge.id)),
    ]);
    onSetActiveNode(snapshot.node.id);
    onSelect({ type: "node", id: snapshot.node.id });
    onToast("Image restored");
    return true;
  }, [deletedNodeStack, onEdgesChange, onNodesChange, onSelect, onSetActiveNode, onToast]);

  const undoCreateNode = useCallback(() => {
    const nodeToRemove = createdNodeStack.at(-1);
    if (!nodeToRemove) {
      return false;
    }

    const relatedEdges = edges.filter((edge) => edge.sourceId === nodeToRemove.id || edge.targetId === nodeToRemove.id);
    setCreatedNodeStack((current) => current.slice(0, -1));
    setCreatedNodeRedoStack((current) => [...current, { node: nodeToRemove, edges: relatedEdges }]);
    onNodesChange((current) => current.filter((node) => node.id !== nodeToRemove.id));
    onEdgesChange((current) => current.filter((edge) => edge.sourceId !== nodeToRemove.id && edge.targetId !== nodeToRemove.id));
    onSelect({ type: "none" });
    onToast(isPresetGroupNode(nodeToRemove) ? "Preset folder undone" : "Image addition undone");
    return true;
  }, [createdNodeStack, edges, onEdgesChange, onNodesChange, onSelect, onToast]);

  const redoCreateNode = useCallback(() => {
    const snapshot = createdNodeRedoStack.at(-1);
    if (!snapshot) {
      return false;
    }

    setCreatedNodeRedoStack((current) => current.slice(0, -1));
    setCreatedNodeStack((current) => [...current, snapshot.node]);
    onNodesChange((current) =>
      current.some((node) => node.id === snapshot.node.id) ? current : [...current, snapshot.node],
    );
    onEdgesChange((current) => [
      ...current,
      ...snapshot.edges.filter((edge) => !current.some((currentEdge) => currentEdge.id === edge.id)),
    ]);
    onSetActiveNode(snapshot.node.id);
    onSelect({ type: "node", id: snapshot.node.id });
    onToast(isPresetGroupNode(snapshot.node) ? "Preset folder restored" : "Image restored");
    return true;
  }, [createdNodeRedoStack, onEdgesChange, onNodesChange, onSelect, onSetActiveNode, onToast]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("textarea,input,[contenteditable='true']")) return;

      if (event.key === "Escape" && marqueeSelection.isSelecting) {
        event.preventDefault();
        clearMarqueeSelection();
        return;
      }

      if (event.key === "Escape" && draftPenStroke) {
        event.preventDefault();
        cancelDraftPenStroke();
        return;
      }

      if (event.key === "Escape" && activeTool === "eraser" && eraserPreview.visible) {
        event.preventDefault();
        setEraserPreview((current) => ({ ...current, visible: false }));
        clearEraserSession();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && ((event.shiftKey && event.key.toLowerCase() === "z") || event.key.toLowerCase() === "y")) {
        event.preventDefault();
        if (redoPenErase()) {
          onToast("Erase redone");
          return;
        }
        if (redoCreateNode()) return;
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        if (undoPenErase()) {
          onToast("Erase undone");
          return;
        }
        if (undoDeleteNode()) return;
        if (undoCreateNode()) return;
        onToast("Nothing to undo");
        return;
      }

      if (event.key !== "Delete" && event.key !== "Backspace") return;
      event.preventDefault();
      if (selectedItem.type === "node") {
        deleteNode(selectedItem.id);
        return;
      }

      if (selectedItem.type === "pen-stroke") {
        onDeletePenStroke(selectedItem.id);
        onSelect({ type: "none" });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeTool, cancelDraftPenStroke, clearEraserSession, clearMarqueeSelection, deleteNode, draftPenStroke, eraserPreview.visible, marqueeSelection.isSelecting, onDeletePenStroke, onSelect, onToast, redoCreateNode, redoPenErase, selectedItem, undoCreateNode, undoDeleteNode, undoPenErase]);

  const zoomIn = () => setViewport((prev) => ({ ...prev, zoom: clamp(parseFloat((prev.zoom + ZOOM_STEP).toFixed(2)), MIN_ZOOM, MAX_ZOOM) }));
  const zoomOut = () => setViewport((prev) => ({ ...prev, zoom: clamp(parseFloat((prev.zoom - ZOOM_STEP).toFixed(2)), MIN_ZOOM, MAX_ZOOM) }));
  const resetZoom = () => {
    setViewport({ zoom: 1, pan: { x: 0, y: 0 } });
  };

  const selectedNodeSummary = useMemo(() => {
    if (selectedItem.type === "node" || selectedItem.type === "image") {
      const node = nodes.find((item) => item.id === selectedItem.id);
      return node ? `${node.title} selected` : "No image selected";
    }

    if (selectedNodeIds.length > 1) return `${selectedNodeIds.length} images selected`;
    if (selectedItem.type === "edge") return "Reference connection selected";
    if (selectedItem.type === "marker") return "Instruction marker selected";
    if (selectedItem.type === "object") return "Canvas object selected";
    if (selectedItem.type === "pen-stroke") return "Sketch annotation selected";
    if (selectedItem.type === "sketchGroup") return "Grouped sketch selected";
    if (selectedItem.type === "sketchLine") return "Sketch line selected";

    return "Ready to compose";
  }, [nodes, selectedItem, selectedNodeIds.length]);

  const sourceNodeCount = useMemo(
    () => nodes.filter((node) => node.role !== "output").length,
    [nodes],
  );
  const snapshotStatusText = useMemo(() => {
    if (!projectId) {
      return "Local canvas";
    }

    if (isSnapshotLoading) {
      return "Loading snapshot";
    }

    if (isSnapshotSaving) {
      return "Saving snapshot";
    }

    if (!currentSnapshotMeta) {
      return hasUnsavedSnapshotChanges ? "Unsaved changes" : "Not saved yet";
    }

    return hasUnsavedSnapshotChanges
      ? `Unsaved changes · v${currentSnapshotMeta.version}`
      : `Saved · v${currentSnapshotMeta.version}`;
  }, [
    currentSnapshotMeta,
    hasUnsavedSnapshotChanges,
    isSnapshotLoading,
    isSnapshotSaving,
    projectId,
  ]);
  const canSaveSnapshot = Boolean(projectId) && !isSnapshotLoading && !isSnapshotSaving;

  const miniMapModel = useMemo(() => {
    const viewportWorldWidth = zoom > 0 ? containerSize.width / zoom : 0;
    const viewportWorldHeight = zoom > 0 ? containerSize.height / zoom : 0;
    const viewportWorldX = zoom > 0 ? -pan.x / zoom : 0;
    const viewportWorldY = zoom > 0 ? -pan.y / zoom : 0;

    const worldRects = nodes.map((node) => ({
      id: node.id,
      ...getNodeDisplayBounds(node),
    }));

    const minX = Math.min(viewportWorldX, ...worldRects.map((rect) => rect.x));
    const minY = Math.min(viewportWorldY, ...worldRects.map((rect) => rect.y));
    const maxX = Math.max(viewportWorldX + viewportWorldWidth, ...worldRects.map((rect) => rect.x + rect.width));
    const maxY = Math.max(viewportWorldY + viewportWorldHeight, ...worldRects.map((rect) => rect.y + rect.height));

    const worldWidth = Math.max(maxX - minX, 1);
    const worldHeight = Math.max(maxY - minY, 1);

    const paddedMinX = minX - MINIMAP_WORLD_PADDING;
    const paddedMinY = minY - MINIMAP_WORLD_PADDING;
    const paddedWidth = worldWidth + MINIMAP_WORLD_PADDING * 2;
    const paddedHeight = worldHeight + MINIMAP_WORLD_PADDING * 2;

    const scale =
      miniMapFrameSize.width > 0 && miniMapFrameSize.height > 0
        ? Math.min(miniMapFrameSize.width / paddedWidth, miniMapFrameSize.height / paddedHeight)
        : 1;

    const offsetX = (miniMapFrameSize.width - paddedWidth * scale) / 2;
    const offsetY = (miniMapFrameSize.height - paddedHeight * scale) / 2;

    return {
      world: {
        minX: paddedMinX,
        minY: paddedMinY,
        width: paddedWidth,
        height: paddedHeight,
      },
      scale,
      offsetX,
      offsetY,
      nodes: worldRects.map((rect) => ({
        ...rect,
        left: offsetX + (rect.x - paddedMinX) * scale,
        top: offsetY + (rect.y - paddedMinY) * scale,
        widthPx: Math.max(rect.width * scale, 6),
        heightPx: Math.max(rect.height * scale, 6),
      })),
      viewportRect: {
        left: offsetX + (viewportWorldX - paddedMinX) * scale,
        top: offsetY + (viewportWorldY - paddedMinY) * scale,
        width: viewportWorldWidth * scale,
        height: viewportWorldHeight * scale,
      },
    };
  }, [containerSize.height, containerSize.width, miniMapFrameSize.height, miniMapFrameSize.width, nodes, pan.x, pan.y, zoom]);

  const handleMiniMapPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      miniMapDragPointerId.current = event.pointerId;
      setMiniMapDragging(true);
      miniMapDragStart.current = {
        x: event.clientX,
        y: event.clientY,
        panX: pan.x,
        panY: pan.y,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [pan.x, pan.y],
  );

  const handleMiniMapPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (miniMapDragPointerId.current !== event.pointerId) return;
      const start = miniMapDragStart.current;
      if (!start) return;
      event.preventDefault();
      event.stopPropagation();
      const dx = (event.clientX - start.x) * MINIMAP_DRAG_SPEED;
      const dy = (event.clientY - start.y) * MINIMAP_DRAG_SPEED;
      setViewport((prev) => ({
        ...prev,
        pan: {
          x: start.panX - dx,
          y: start.panY - dy,
        },
      }));
    },
    [],
  );

  const handleMiniMapPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (miniMapDragPointerId.current !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    miniMapDragPointerId.current = null;
    setMiniMapDragging(false);
    miniMapDragStart.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  return (
    <section
      ref={containerRef}
      className="relative h-full flex-1 touch-none select-none overflow-hidden"
      style={{ backgroundColor: "var(--canvas-theme-canvas)", cursor: isPanningCanvas ? "grabbing" : activeTool === "pen" || marqueeSelection.isSelecting ? "crosshair" : "default" }}
      onClick={(event) => {
        if (suppressCanvasBackgroundClickRef.current) {
          suppressCanvasBackgroundClickRef.current = false;
          return;
        }

        if (isCanvasInteractiveTarget(event.target)) return;
        setMarqueeSelectedNodeIds(null);
        onSelect({ type: "none" });
      }}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <div
        aria-hidden="true"
        className="hidden"
        style={{
          background: [
            "linear-gradient(180deg, rgba(255,255,255,0.16), transparent 20%)",
            "radial-gradient(circle at top center, rgba(255,255,255,0.14), transparent 28%)",
          ].join(", "),
        }}
      />
      <input
        ref={importImagesInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => importImages(event.target.files)}
      />
      <div className="hidden" data-canvas-ui="true">
        <div className="pointer-events-auto relative min-w-0 flex-1">
          <div className="inline-flex max-w-full items-center gap-3 rounded-[28px] border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] px-3 py-2.5 shadow-[0_18px_45px_var(--canvas-theme-shadow)] backdrop-blur">
            <button
              type="button"
              onClick={() => setProjectMenuOpen((value) => !value)}
              className="grid h-10 w-10 place-items-center rounded-full bg-[var(--canvas-theme-active)] text-[var(--canvas-theme-active-text)]"
              title={projectMenuOpen ? "Close menu" : "Open menu"}
              aria-haspopup="menu"
              aria-expanded={projectMenuOpen}
              aria-label={projectMenuOpen ? "Close project menu" : "Open project menu"}
            >
              {projectMenuOpen ? (
                <Menu className="h-4 w-4" aria-hidden="true" />
              ) : (
                <span className="grid h-5 w-5 place-items-center rounded-full bg-[#101412] text-[10px] font-black leading-none text-[#F8F5EE]">
                  C.
                </span>
              )}
            </button>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.24em] text-[var(--canvas-theme-text-muted)]">Canvas Session</p>
              {editingProjectName ? (
                <input
                  ref={projectNameInputRef}
                  value={projectNameDraft}
                  onChange={(e) => setProjectNameDraft(e.target.value)}
                  onBlur={commitProjectName}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitProjectName();
                    if (e.key === "Escape") cancelProjectName();
                  }}
                  className="w-40 max-w-full bg-transparent text-base font-semibold tracking-[-0.02em] text-[var(--canvas-theme-text)] outline-none"
                  aria-label="Project name"
                />
              ) : (
                <button
                  type="button"
                  onClick={startEditingProjectName}
                  className="max-w-[180px] truncate text-left text-base font-semibold tracking-[-0.02em] text-[var(--canvas-theme-text)]"
                  title="Edit project name"
                >
                  {projectName}
                </button>
              )}
            </div>
            <span className="rounded-full bg-[#DCFCE7] px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[#166534]">
              {snapshotStatusText}
            </span>
            <ChevronDown className="h-4 w-4 text-[var(--canvas-theme-icon-muted)]" aria-hidden="true" />
          </div>

          {projectMenuOpen ? (
            <div
              role="menu"
              className="mt-3 w-72 overflow-hidden rounded-[30px] border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] shadow-2xl shadow-[var(--canvas-theme-shadow)] backdrop-blur"
            >
              <MenuSection
                items={[
                  { label: "Home", onSelect: () => router.push("/") },
                  { label: projectName, onSelect: startEditingProjectName },
                ]}
                onSelect={handleMenuSelect}
              />
              <MenuSection
                items={[
                  {
                    label: "New Project",
                    onSelect: () => {
                      setProjectName("Untitled");
                      onNodesChange([]);
                      onEdgesChange([]);
                      setDeletedNodeStack([]);
                      setCreatedNodeStack([]);
                      setCreatedNodeRedoStack([]);
                      resetZoom();
                      onToast("New project created");
                    },
                  },
                  {
                    label: "Delete Project",
                    tone: "danger",
                    onSelect: () => {
                      onNodesChange([]);
                      onEdgesChange([]);
                      setDeletedNodeStack([]);
                      setCreatedNodeStack([]);
                      setCreatedNodeRedoStack([]);
                      resetZoom();
                      onToast("Project cleared");
                    },
                  },
                ]}
                onSelect={handleMenuSelect}
              />
              <MenuSection
                items={[{ label: "Import Images", onSelect: () => importImagesInputRef.current?.click() }]}
                onSelect={handleMenuSelect}
              />
              <MenuSection
                items={[
                  { label: "Undo", shortcut: "Ctrl+Z", disabled: deletedNodeStack.length === 0 && createdNodeStack.length === 0, onSelect: () => { if (!undoDeleteNode()) undoCreateNode(); } },
                  { label: "Redo", shortcut: "Ctrl+Shift+Z", disabled: createdNodeRedoStack.length === 0, onSelect: redoCreateNode },
                  { label: "Duplicate Selection", shortcut: "Ctrl+D", disabled: true },
                ]}
                onSelect={handleMenuSelect}
              />
              <MenuSection
                items={[
                  { label: "Zoom to Fit", shortcut: "Shift+1", onSelect: resetZoom },
                  { label: "Zoom In", shortcut: "Ctrl++", onSelect: zoomIn },
                  { label: "Zoom Out", shortcut: "Ctrl+-", onSelect: zoomOut },
                ]}
                onSelect={handleMenuSelect}
                noDivider
              />
            </div>
          ) : null}
        </div>

        <div className="pointer-events-auto flex flex-1 justify-center">
          <div className="flex max-w-[560px] items-center gap-3 rounded-[28px] border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] px-4 py-2.5 shadow-[0_18px_45px_var(--canvas-theme-shadow)] backdrop-blur">
            <span className="rounded-full bg-[var(--canvas-theme-surface-soft)] px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-[var(--canvas-theme-text-muted)]">
              {TOOL_LABELS[activeTool]}
            </span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[var(--canvas-theme-text)]">{selectedNodeSummary}</p>
              <p className="hidden text-xs text-[var(--canvas-theme-text-muted)]">
                {nodes.length} images · {sourceNodeCount} references · {edges.length} connections
              </p>
              <p className="text-xs text-[var(--canvas-theme-text-muted)]">
                {nodes.length} images / {sourceNodeCount} references / {edges.length} connections
              </p>
            </div>
          </div>
        </div>

        <div className="pointer-events-auto flex flex-1 justify-end">
          <div className="flex items-center gap-2 rounded-[28px] border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] px-3 py-2 shadow-[0_18px_45px_var(--canvas-theme-shadow)] backdrop-blur">
            <button
              type="button"
              onClick={() => {
                if (deletedNodeStack.length === 0) {
                  onToast("Nothing to undo");
                  return;
                }
                undoDeleteNode();
                onToast("Reverted latest canvas deletion");
              }}
              className="flex items-center gap-2 rounded-full px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--canvas-theme-text-muted)] transition hover:bg-[var(--canvas-theme-hover)] hover:text-[var(--canvas-theme-text)]"
              title="Undo latest deletion"
            >
              <History className="h-4 w-4" aria-hidden="true" />
              <span>Undo</span>
            </button>
            <button
              type="button"
              onClick={onSaveSnapshot}
              disabled={!canSaveSnapshot}
              className="flex items-center gap-2 rounded-full px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--canvas-theme-text-muted)] transition hover:bg-[var(--canvas-theme-hover)] hover:text-[var(--canvas-theme-text)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSnapshotSaving ? (
                <LoaderCircle className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Layers3 className="h-4 w-4" aria-hidden="true" />
              )}
              <span>{isSnapshotSaving ? "Saving" : "Save Snapshot"}</span>
            </button>
            <button
              type="button"
              onClick={() => onToast("Compare view opens when multiple outputs exist")}
              className="flex items-center gap-2 rounded-full px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--canvas-theme-text-muted)] transition hover:bg-[var(--canvas-theme-hover)] hover:text-[var(--canvas-theme-text)]"
            >
              <Sparkles className="h-4 w-4" aria-hidden="true" />
              <span>Compare</span>
            </button>
            <button
              type="button"
              onClick={() => onToast("Export flow coming next")}
              className="flex items-center gap-2 rounded-full bg-[var(--canvas-theme-surface-soft)] px-3 py-2 text-xs font-bold uppercase tracking-[0.18em] text-[var(--canvas-theme-text)] transition hover:bg-[var(--canvas-theme-hover)]"
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              <span>Export</span>
            </button>
            <div className="ml-1 inline-flex items-center gap-1 text-[11px] font-bold text-[var(--canvas-theme-text-muted)]">
              <Zap className="h-4 w-4 fill-current" aria-hidden="true" />
              <span>30 credits</span>
            </div>
          </div>
        </div>
      </div>
      <div ref={projectMenuRef} className="absolute left-1.5 top-1.5 z-50" data-canvas-ui="true">
        <div className="flex h-10 items-center gap-1.5 rounded-[22px] border border-transparent bg-transparent px-1.5 text-[var(--canvas-theme-text-soft)] shadow-none backdrop-blur-0" data-canvas-ui="true">
          <button
            type="button"
            onClick={() => setProjectMenuOpen((value) => !value)}
            className="grid h-7 w-7 place-items-center rounded-full bg-[var(--canvas-theme-active)] text-[var(--canvas-theme-active-text)]"
            title={projectMenuOpen ? text.menu.closeMenu : text.menu.openMenu}
            aria-haspopup="menu"
            aria-expanded={projectMenuOpen}
            aria-label={projectMenuOpen ? text.menu.closeProjectMenu : text.menu.openProjectMenu}
          >
            {projectMenuOpen ? (
              <Menu className="h-4 w-4" aria-hidden="true" />
            ) : (
              <span className="grid h-5 w-5 place-items-center rounded-full bg-[#101412] text-[12px] font-black leading-none text-[#F8F5EE]">
                C.
              </span>
            )}
          </button>
          {editingProjectName ? (
            <input
              ref={projectNameInputRef}
              value={projectNameDraft}
              onChange={(e) => setProjectNameDraft(e.target.value)}
              onBlur={commitProjectName}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitProjectName();
                if (e.key === "Escape") cancelProjectName();
              }}
              className="w-20 bg-transparent text-sm font-semibold tracking-[-0.02em] text-[var(--canvas-theme-text-soft)] outline-none"
              aria-label={text.menu.projectName}
            />
          ) : (
            <button
              type="button"
              onClick={startEditingProjectName}
              className="max-w-[100px] truncate text-sm font-semibold tracking-[-0.02em] text-[var(--canvas-theme-text-soft)]"
              title={text.menu.editProjectName}
            >
              {projectName}
            </button>
          )}
        </div>

        {projectMenuOpen ? (
          <div
            role="menu"
            className="mt-3 w-56 overflow-hidden rounded-[18px] border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)]/96 shadow-[0_20px_48px_var(--canvas-theme-shadow)] backdrop-blur-xl"
          >
            <MenuSection
              items={[
                { label: text.menu.home, onSelect: () => router.push("/") },
                { label: projectName, onSelect: startEditingProjectName },
              ]}
              onSelect={handleMenuSelect}
            />
            <MenuSection
              items={[
                {
                  label: text.menu.languageLabel,
                  onSelect: () => onLanguageChange(language === "vi" ? "en" : "vi"),
                },
              ]}
              onSelect={handleMenuSelect}
            />
            <MenuSection
              items={[
                {
                  label: text.menu.newProject,
                  onSelect: () => {
                    setProjectName(text.common.untitled);
                    onNodesChange([]);
                    onEdgesChange([]);
                    setDeletedNodeStack([]);
                    setCreatedNodeStack([]);
                    setCreatedNodeRedoStack([]);
                    resetZoom();
                    onToast(text.toast.newProjectCreated);
                  },
                },
                {
                  label: text.menu.deleteProject,
                  tone: "danger",
                  onSelect: () => {
                    onNodesChange([]);
                    onEdgesChange([]);
                    setDeletedNodeStack([]);
                    setCreatedNodeStack([]);
                    setCreatedNodeRedoStack([]);
                    resetZoom();
                    onToast(text.toast.projectCleared);
                  },
                },
              ]}
              onSelect={handleMenuSelect}
            />
            <MenuSection
              items={[{ label: text.menu.importImages, onSelect: () => importImagesInputRef.current?.click() }]}
              onSelect={handleMenuSelect}
            />
            <MenuSection
              items={[
                { label: text.menu.undo, shortcut: "Ctrl+Z", disabled: deletedNodeStack.length === 0 && createdNodeStack.length === 0, onSelect: () => { if (!undoDeleteNode()) undoCreateNode(); } },
                { label: text.menu.redo, shortcut: "Ctrl+Shift+Z", disabled: createdNodeRedoStack.length === 0, onSelect: redoCreateNode },
                { label: text.menu.duplicateSelection, shortcut: "Ctrl+D", disabled: true },
              ]}
              onSelect={handleMenuSelect}
            />
            <MenuSection
              items={[
                { label: text.menu.zoomToFit, shortcut: "Shift+1", onSelect: resetZoom },
                { label: text.menu.zoomIn, shortcut: "Ctrl++", onSelect: zoomIn },
                { label: text.menu.zoomOut, shortcut: "Ctrl+-", onSelect: zoomOut },
              ]}
              onSelect={handleMenuSelect}
              noDivider
            />
          </div>
        ) : null}
      </div>

      <div className="absolute right-4 top-2 z-40 flex h-11 items-center gap-2 rounded-[22px] border border-transparent bg-transparent px-3 text-xs font-semibold text-[var(--canvas-theme-text-muted)] shadow-none backdrop-blur-0" data-canvas-ui="true">
        <span className="rounded-full border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)]/90 px-3 py-1 text-[11px] font-bold text-[var(--canvas-theme-text-muted)] shadow-[0_12px_28px_var(--canvas-theme-shadow)]">
          {snapshotStatusText}
        </span>
        <button
          type="button"
          onClick={onSaveSnapshot}
          disabled={!canSaveSnapshot}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)]/90 px-3 text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--canvas-theme-text)] shadow-[0_12px_28px_var(--canvas-theme-shadow)] transition hover:border-[var(--canvas-theme-border-strong)] hover:bg-[var(--canvas-theme-hover)] disabled:cursor-not-allowed disabled:opacity-60"
          title={
            projectId
              ? isSnapshotSaving
                ? "Saving snapshot"
                : "Save snapshot"
              : "Open a project to save snapshots"
          }
        >
          {isSnapshotSaving ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Layers3 className="h-3.5 w-3.5" aria-hidden="true" />
          )}
          <span>{isSnapshotSaving ? "Saving" : "Save"}</span>
        </button>
        <div className="flex items-center gap-1">
          <Zap className="h-4 w-4 fill-[var(--canvas-theme-icon)] text-[var(--canvas-theme-icon)]" aria-hidden="true" />
          <span>30</span>
        </div>
      </div>

      {/* Zoomable + pannable canvas layer */}
      <div
        ref={worldLayerRef}
        className="absolute inset-0"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "0 0",
          willChange: "transform",
          transition: "none",
        }}
      >
        {isMultiNodeSelection && multiSelectBounds ? (
          <MultiSelectToolbar
            x={multiSelectBounds.x + multiSelectBounds.width / 2}
            y={multiSelectBounds.y}
            viewportZoom={zoom}
            canGroup={canGroupSelectedNodes}
            canUngroup={canUngroupSelectedNodes}
            onGroup={handleGroupSelectedNodes}
            onUngroup={handleUngroupSelectedNodes}
            onMerge={() => onToast("Merge action coming soon")}
            onDownload={() => onToast("Download selection mock")}
          />
        ) : null}

        {marqueeSelection.rect ? (
          <div
            className="pointer-events-none absolute border border-blue-400/80 bg-blue-400/10"
            style={{
              left: marqueeSelection.rect.x,
              top: marqueeSelection.rect.y,
              width: marqueeSelection.rect.width,
              height: marqueeSelection.rect.height,
              zIndex: 70,
            }}
          />
        ) : null}

        <CanvasEdges
          nodes={nodes}
          edges={edges}
          selectedEdgeId={selectedItem.type === "edge" ? selectedItem.id : null}
          onEdgeClick={(id, e) => {
            e.stopPropagation();
            setMarqueeSelectedNodeIds(null);
            onSelect({ type: "edge", id });
          }}
          draftEdge={draftEdge}
        />

        {nodes.map(node =>
          isPresetGroupNode(node) ? (
            <CanvasPresetGroupNodeCard
              key={node.id}
              node={node}
              edges={edges}
              selected={selectedNodeIds.includes(node.id)}
              selectedItem={selectedItem}
              viewportZoom={zoom}
              isConnectionTarget={hoveredConnectionTargetId === node.id}
              hoveredPresetChildId={hoveredPresetChildId}
              onSelect={(id) => {
                setMarqueeSelectedNodeIds(null);
                onSelect({ type: "node", id });
              }}
              onSelectPresetChild={(nodeId, childId) => {
                setMarqueeSelectedNodeIds(null);
                onSelect({ type: "presetChild", nodeId, childId });
              }}
              onSetActivePresetChild={onSetActivePresetChild}
              onRemovePresetChild={onRemovePresetChild}
              onMovePresetChild={onMovePresetChild}
              onDragStart={handleNodePointerDown}
              onStartConnection={handleConnectionHandlePointerDown}
              onStartChildConnection={handlePresetChildConnectionStart}
              onSelectContextMenu={(id, x, y) => {
                setMarqueeSelectedNodeIds(null);
                onSelect({ type: "node", id, menu: { x, y } });
              }}
              onDelete={deleteNode}
              onPresetChildHover={setHoveredPresetChildId}
            />
          ) : (
            <CanvasNodeCard
              key={node.id}
              node={node}
              edges={edges}
              selected={selectedNodeIds.includes(node.id)}
              isGenerationTarget={activeGenerationTargetId === node.id}
              showSelectionTools={!isMultiNodeSelection}
              selectedItem={selectedItem}
              activeTool={activeTool}
              markers={markers}
              addedObjects={addedObjects}
              sketchLines={sketchLines}
              sketchGroups={sketchGroups}
              selectedSketchLineIds={selectedSketchLineIds}
              viewportZoom={zoom}
              isConnectionTarget={hoveredConnectionTargetId === node.id}
              onSelect={(id) => {
                const groupedNodeIds = getGroupedNodeIds(id);
                const shouldPreserveGroupSelection =
                  marqueeSelectedNodeIds !== null &&
                  marqueeSelectedNodeIds.length > 1 &&
                  marqueeSelectedNodeIds.includes(id);

                if (groupedNodeIds.length > 1) {
                  setMarqueeSelectedNodeIds(groupedNodeIds);
                  onSelect({ type: "node", id: groupedNodeIds[0] });
                  return;
                }

                if (!shouldPreserveGroupSelection) {
                  setMarqueeSelectedNodeIds(null);
                  onSelect({ type: "node", id });
                }
              }}
              onStartConnection={handleConnectionHandlePointerDown}
              onSelectOverlay={(item) => {
                setMarqueeSelectedNodeIds(null);
                onSelect(item);
              }}
              onAddSketchLine={onAddSketchLine}
              onSelectSketchLine={onSelectSketchLine}
              onSelectSketchGroup={(id) => {
                setMarqueeSelectedNodeIds(null);
                onSelectSketchGroup(id);
              }}
              onSelectContextMenu={(id, x, y) => {
                const groupedNodeIds = getGroupedNodeIds(id);
                if (groupedNodeIds.length > 1) {
                  setMarqueeSelectedNodeIds(groupedNodeIds);
                  onSelect({ type: "node", id: groupedNodeIds[0], menu: { x, y } });
                  return;
                }
                setMarqueeSelectedNodeIds(null);
                onSelect({ type: "node", id, menu: { x, y } });
              }}
              onDragStart={handleNodePointerDown}
              onImageAction={onImageAction}
              onQuickEdit={onQuickEdit}
              onMultiAngle={onMultiAngle}
              onAddObject={onAddObject}
              onTool={onTool}
              onRealityCheck={onRealityCheck}
              onToast={onToast}
              onSetActiveNode={onSetActiveNode}
              onDelete={deleteNode}
            />
          )
        )}

        <div className="pointer-events-none absolute inset-0 z-[140]">
          <PenStrokeLayer
            strokes={penStrokes}
            draftStroke={draftPenStroke}
            activeTool={activeTool}
            eraserPreview={eraserPreview}
            selectedStrokeId={selectedItem.type === "pen-stroke" ? selectedItem.id : null}
            onSelectStroke={(strokeId) => {
              setMarqueeSelectedNodeIds(null);
              onSelect({ type: "pen-stroke", id: strokeId });
            }}
          />
        </div>

        {activeTool === "pen" || activeTool === "eraser" ? (
          <div
            className={`absolute inset-0 z-[90] ${activeTool === "eraser" ? "cursor-none" : "cursor-crosshair"}`}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onPointerLeave={(event) => {
              if (activeTool === "eraser") {
                setEraserPreview((current) => ({ ...current, visible: false }));
              }
              handlePointerUp(event);
            }}
          />
        ) : null}
      </div>

      {isRegionEditing && selectedNode ? (
        <RegionMaskLightbox
          key={selectedNode.id}
          node={selectedNode}
          brushMode={brushMode}
          selectionTool={regionSelectionTool}
          brushSize={brushSize}
          brushSoftness={brushSoftness}
          maskTrigger={maskTrigger}
          onBeginMaskChange={onBeginMaskChange}
          onCommitMask={onCommitMask}
          onUndoMask={onUndoMask}
          onRedoMask={onRedoMask}
          onBrushSizeChange={onBrushSizeChange}
          onBrushSoftnessChange={onBrushSoftnessChange}
          onClose={onCloseRegionEditor}
        />
      ) : null}

      {miniMapOpen ? (
        <div className="absolute bottom-[72px] left-3 z-40 h-[166px] w-[252px] rounded-[24px] border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)]/92 p-3 shadow-[0_24px_60px_var(--canvas-theme-shadow)] backdrop-blur-xl" data-canvas-ui="true">
          <div
            ref={miniMapFrameRef}
            className="relative h-full w-full overflow-hidden rounded-lg border border-[var(--canvas-theme-border-strong)]"
            onPointerDown={handleMiniMapPointerDown}
            onPointerMove={handleMiniMapPointerMove}
            onPointerUp={handleMiniMapPointerUp}
            onPointerCancel={handleMiniMapPointerUp}
            style={{
              cursor: miniMapDragging ? "grabbing" : "grab",
              backgroundColor: "var(--canvas-theme-canvas)",
            }}
          >
            {miniMapModel.nodes.map((node) => (
              <div
                key={node.id}
                className="absolute rounded-[2px]"
                style={{
                  left: node.left,
                  top: node.top,
                  width: node.widthPx,
                  height: node.heightPx,
                  backgroundColor: "var(--canvas-theme-surface-muted)",
                }}
              />
            ))}
            <div className="pointer-events-none absolute inset-0 border border-white/10" />
          </div>
        </div>
      ) : null}
      <BottomToolDock
        language={language}
        activeTool={activeTool}
        zoom={zoom}
        activeLeftSidebarPanel={activeLeftSidebarPanel}
        miniMapOpen={miniMapOpen}
        onTool={onTool}
        onToggleLeftSidebarPanel={onToggleLeftSidebarPanel}
        onToggleMiniMap={onToggleMiniMap}
        onAddObject={onAddObject}
        onGenerate={onGenerate}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onResetZoom={resetZoom}
        canvasThemeColor={canvasThemeColor}
        onCanvasThemeChange={onCanvasThemeChange}
        penSettings={penSettings}
        onPenSettingsChange={onPenSettingsChange}
      />
    </section>
  );
}

type MenuItem = {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  tone?: "danger";
  onSelect?: () => void;
};

function MultiSelectToolbar({
  x,
  y,
  viewportZoom = 1,
  canGroup,
  canUngroup,
  onGroup,
  onUngroup,
  onMerge,
  onDownload,
}: {
  x: number;
  y: number;
  viewportZoom?: number;
  canGroup: boolean;
  canUngroup: boolean;
  onGroup: () => void;
  onUngroup: () => void;
  onMerge: () => void;
  onDownload: () => void;
}) {
  const uiScale = 1 / viewportZoom;
  const actions = [
    ...(canGroup ? [{ label: "Group", icon: Group, onClick: onGroup }] : []),
    ...(canUngroup ? [{ label: "Ungroup", icon: Ungroup, onClick: onUngroup }] : []),
    { label: "Merge", icon: Zap, onClick: onMerge },
    { label: "Download", icon: Download, onClick: onDownload },
  ];

  return (
    <div
      data-canvas-ui="true"
      className="contextual-toolbar absolute z-[100] flex items-center gap-0.5 rounded-xl border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] p-1 shadow-xl shadow-[var(--canvas-theme-shadow)] backdrop-blur"
      style={{
        left: x,
        top: y - 62 * uiScale,
        transform: `translateX(-50%) scale(${uiScale})`,
        transformOrigin: "top center",
      }}
    >
      {actions.map((action) => {
        const Icon = action.icon;

        return (
          <button
            key={action.label}
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              action.onClick();
            }}
            className="inline-flex h-7 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-bold text-[var(--canvas-theme-text)] transition hover:bg-[var(--canvas-theme-hover)]"
          >
            <Icon className="h-3.5 w-3.5 text-[var(--canvas-theme-icon-muted)]" aria-hidden="true" />
            <span>{action.label}</span>
            <ChevronDown className="h-3.5 w-3.5 text-[var(--canvas-theme-icon-muted)]" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}

function MenuSection({
  items,
  onSelect,
  noDivider,
}: {
  items: MenuItem[];
  onSelect: (item: MenuItem) => void;
  noDivider?: boolean;
}) {
  return (
    <div className={noDivider ? "" : "border-b border-[var(--canvas-theme-border)]"}>
      <div className="py-1">
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => onSelect(item)}
            disabled={item.disabled}
            className={[
              "flex w-full items-center justify-between gap-3 px-4 py-2 text-left text-[13px]",
              item.disabled
                ? "cursor-not-allowed text-[var(--canvas-theme-text-muted)] opacity-45"
                : "text-[var(--canvas-theme-text)] hover:bg-[var(--canvas-theme-hover)]",
              item.tone === "danger" && !item.disabled ? "text-[#B42318]" : "",
            ].join(" ")}
          >
            <span className="font-medium leading-none">{item.label}</span>
            {item.shortcut ? (
              <span className="text-xs font-semibold text-[var(--canvas-theme-text-muted)]">{item.shortcut}</span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

