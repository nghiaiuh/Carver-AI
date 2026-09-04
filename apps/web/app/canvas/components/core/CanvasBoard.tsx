/*
 * Flow: Renders one interactive canvas workspace component.
 * 1. Receive canvas state and callbacks from the workspace.
 * 2. Render the focused control, overlay, or board UI.
 * 3. Send user actions back up through typed handlers.
 */

"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CanvasGroupColor, CarverAiJobSimulationConfig } from "@carver/shared";
import {
  Columns3,
  Download,
  Grid3X3,
  Group,
  Palette,
  Pencil,
  Rows3,
  Scissors,
  Spline,
  Ungroup,
  Zap,
} from "lucide-react";
import type {
  AddedObject,
  CanvasConnectionKind,
  CanvasEdge,
  ImageConnectionRole,
  MaskData,
  CanvasNode,
  CanvasPresetChild,
  CanvasPresetGroupNode,
  CanvasCameraShotSetState,
  CanvasTextNode,
  EditorTool,
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
import { isCanvasCameraShotSetNode, isCanvasContextGroupNode } from "../../types/canvas";
import type { LibraryAsset } from "../../types/library";
import CanvasNodeCard from "./CanvasNodeCard";
import CanvasPresetGroupNodeCard from "./CanvasPresetGroupNodeCard";
import CanvasContextGroupNodeCard from "./CanvasContextGroupNodeCard";
import CanvasCameraShotSetNodeCard from "./CanvasCameraShotSetNodeCard";
import CanvasNodeGroupFrame from "./CanvasNodeGroupFrame";
import CanvasEdges from "./CanvasEdges";
import PenStrokeLayer from "../widgets/PenStrokeLayer";
import RegionMaskLightbox from "../widgets/RegionMaskLightbox";
import { clonePenStrokes, erasePenStrokesBySquare } from "../widgets/eraserUtils";
import {
  getAggregateHandlePoint,
  inferConnectionRoleFromNode,
  getSemanticPortPoint,
  type ImageHandlePosition,
} from "./canvasConnectionGeometry";
import {
  getDefaultSourcePortId,
  getNodeSemanticPort,
  getTargetPortIdForConnection,
  getTextNodeInputPorts,
  resolveTargetPortIdForEdge,
} from "../../utils/canvasNodePorts";
import {
  buildPresetSourceImage,
  getPresetChildRightAnchor,
  getPresetGroupNodeSize,
  isPresetGroupNode,
} from "../../utils/presetGroupHelpers";
import {
  clampCanvasViewportZoom,
  normalizeCanvasWheelDelta,
  type CanvasViewportState,
  zoomCanvasViewportAtPoint,
} from "../../utils/canvasViewport";
import { buildPenGeometryPoints, hasMinimumPenGeometrySize } from "../../utils/penGeometry";
import {
  canvasPointDistance as distance,
  canvasRectsIntersect as doRectsIntersect,
  clampCanvasValue as clamp,
  createCanvasSelectionRect as createRectFromPoints,
  getCanvasNodeDisplayBounds as getNodeDisplayBounds,
  getCanvasPointerPoint as getPointerPointInContainer,
  getCanvasWorldPoint as getWorldPointFromPointer,
  type CanvasPoint as Point,
  type CanvasSelectionRect as SelectionRect,
} from "../../utils/canvasBoardGeometry";
import {
  cloneCanvasNodeForPaste,
  extractCanvasImageUrlFromClipboard as extractImageUrlFromClipboardData,
  getClipboardImageBlob,
  getDroppedCanvasImageFiles,
  hasCanvasFileDrop,
  getPastedCanvasImageSize as getPastedImageNodeSize,
  loadCanvasImageDimensions as loadImageDimensions,
} from "../../utils/canvasClipboard";
import {
  CANVAS_GROUP_COLOR_OPTIONS,
  getCanvasNodeGroups,
  getNextCanvasGroupLabel,
  arrangeCanvasNodeGroup,
  type CanvasGroupArrangeMode,
  type CanvasNodeGroup,
} from "../../utils/canvasNodeGroups";
import {
  getGroupSemanticPortPoint,
  GROUP_OUTPUT_IMAGE_PORT_ID,
} from "../../utils/canvasGroupPorts";
import { resolveGeneratedNodeOutput } from "../../utils/imageGeneratorGraphContext";

type CanvasBoardProps = {
  projectId?: string;
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
  onImageAction: (nodeId: string, xPercent: number, yPercent: number) => void;
  onAddSketchLine: (line: SketchLine) => void;
  onAddPenStroke: (stroke: PenStrokeObject) => void;
  onDeletePenStroke: (strokeId: string) => void;
  onReplacePenStrokes: (strokes: PenStrokeObject[]) => void;
  onSelectSketchLine: (id: string, additive: boolean) => void;
  onSelectSketchGroup: (id: string) => void;
  onTool: (tool: EditorTool) => void;
  onMultiAngle: () => void;
  onAddObject: () => void;
  onRealityCheck: () => void;
  onToast: (message: string) => void;
  onNodesChange: (nodes: CanvasNode[] | ((prev: CanvasNode[]) => CanvasNode[])) => void;
  onEdgesChange: (edges: CanvasEdge[] | ((prev: CanvasEdge[]) => CanvasEdge[])) => void;
  viewportZoom: number;
  viewportResetVersion: number;
  onViewportZoomChange: (zoom: number) => void;
  activeGenerationTargetId: string | null;
  activeNodeId: string | null;
  onSetActiveNode: (id: string) => void;
  isSnapshotLoading: boolean;
  isSnapshotSaving: boolean;
  isDraftSaving: boolean;
  currentSnapshotMeta: {
    snapshotId: string;
    version: number;
    createdAt: string;
    documentHash?: string | null;
  } | null;
  hasUnsavedSnapshotChanges: boolean;
  creditsAmount: number | null;
  miniMapOpen: boolean;
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
  onPersistCanvasNodeImageAsset: (params: {
    blob: Blob;
    title: string;
    mimeType?: string;
    name?: string;
    role?: CanvasNode["role"];
    preserveTitle?: boolean;
  }) => Promise<{
    imageUrl: string;
    assetId: string;
    mimeType: string;
    sizeBytes: number;
    name: string;
    role?: CanvasNode["role"];
    preserveTitle?: boolean;
  }>;
  onRunAssistantNode: (nodeId: string) => void | Promise<void>;
  onRunImageGeneratorNode: (
    nodeId: string,
    options?: { simulation?: CarverAiJobSimulationConfig },
  ) => void | Promise<void>;
  onUpdateCameraShotSet: (nodeId: string, value: CanvasCameraShotSetState) => void;
  generatorAssetUrls: Record<string, {
    thumbUrl: string;
    previewUrl: string;
    originalUrl: string;
    expiresAt: string;
  }>;
  onHistoryActionsChange?: (actions: {
    undo: () => void;
    redo: () => void;
  } | null) => void;
};

type DeletedNodeSnapshot = {
  nodes: CanvasNode[];
  edges: CanvasEdge[];
};

type CreatedNodeSnapshot = {
  node: CanvasNode;
  edges: CanvasEdge[];
};

type CreatedEdgeSnapshot = {
  edge: CanvasEdge;
};

type NodeResizeSnapshot = {
  nodeId: string;
  before: {
    width: number;
    height: number;
  };
  after: {
    width: number;
    height: number;
  };
};

type MarqueeSelectionState = {
  isSelecting: boolean;
  startPoint: Point | null;
  currentPoint: Point | null;
  rect: SelectionRect | null;
};

type ImageSourceMetadata = {
  assetId?: string;
  mimeType?: string;
  sizeBytes?: number;
  name?: string;
  width?: number | null;
  height?: number | null;
  role?: CanvasNode["role"];
  preserveTitle?: boolean;
};

type CanvasClipboardItem = {
  kind: "node";
  node: CanvasNode;
  copiedAt: number;
};

const WHEEL_ZOOM_SENSITIVITY = 0.0012;
const WHEEL_ZOOM_COMMIT_DEBOUNCE_MS = 160;
const MINIMAP_WORLD_PADDING = 48;
const MARQUEE_SELECTION_THRESHOLD = 5;
const MULTI_SELECT_TOOLBAR_MIN_SELECTION = 2;
const MAX_CANVAS_DROP_IMAGE_COUNT = 10;
const MIN_POINT_DISTANCE = 1.5;
const MIN_GEOMETRY_SIZE = 4;
const ERASER_BASE_SIZE = 18;
const ERASER_MIN_SIZE = 12;
const ERASER_MAX_SIZE = 60;
const ERASER_SPEED_SCALE = 0.17;
const ERASER_SIZE_SMOOTHING = 0.22;

function getCursorPointRelativeToContainer(event: WheelEvent, container: HTMLElement): Point {
  return getPointerPointInContainer(event, container);
}

function isLocallyScopedWheelTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest("[data-canvas-wheel-scope='local']"));
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

function isCanvasUiTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;

  return Boolean(
    target.closest(
      "[data-canvas-ui],button,input,textarea,select,[contenteditable='true'],[role='menu']",
    ),
  );
}

function isTextEditingTarget(target: EventTarget | null) {
  return target instanceof HTMLElement && Boolean(target.closest("textarea,input,[contenteditable='true']"));
}


export default function CanvasBoard({
  projectId,
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
  onSelectSketchLine,
  onSelectSketchGroup,
  onTool,
  onMultiAngle,
  onAddObject,
  onRealityCheck,
  onToast,
  onNodesChange,
  onEdgesChange,
  viewportZoom,
  viewportResetVersion,
  onViewportZoomChange,
  activeGenerationTargetId,
  activeNodeId,
  onSetActiveNode,
  isSnapshotLoading,
  isSnapshotSaving,
  isDraftSaving,
  currentSnapshotMeta,
  hasUnsavedSnapshotChanges,
  creditsAmount,
  miniMapOpen,
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
  onPersistCanvasNodeImageAsset,
  onRunAssistantNode,
  onRunImageGeneratorNode,
  onUpdateCameraShotSet,
  generatorAssetUrls,
  onHistoryActionsChange,
}: CanvasBoardProps) {
  const containerRef = useRef<HTMLElement>(null);
  const worldLayerRef = useRef<HTMLDivElement>(null);
  const miniMapFrameRef = useRef<HTMLDivElement>(null);
  const committedViewportZoom = clampCanvasViewportZoom(viewportZoom);
  const [viewport, setViewport] = useState<CanvasViewportState>({
    pan: { x: 0, y: 0 },
    zoom: committedViewportZoom,
  });
  const [imageRasterZoom, setImageRasterZoom] = useState(committedViewportZoom);
  const [isWheelZooming, setIsWheelZooming] = useState(false);
  const viewportRef = useRef<CanvasViewportState>(viewport);
  const lastCommittedZoomRef = useRef(committedViewportZoom);
  const lastViewportResetVersionRef = useRef(viewportResetVersion);
  const panStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const isPanning = useRef(false);
  const [isPanningCanvas, setIsPanningCanvas] = useState(false);
  const [isFileDropActive, setIsFileDropActive] = useState(false);
  const wheelZoomTimeout = useRef<number | null>(null);
  const wheelZoomRafRef = useRef<number | null>(null);
  const pendingWheelDeltaRef = useRef(0);
  const pendingWheelCursorRef = useRef<Point | null>(null);
  const [deletedNodeStack, setDeletedNodeStack] = useState<DeletedNodeSnapshot[]>([]);
  const [createdNodeStack, setCreatedNodeStack] = useState<CanvasNode[]>([]);
  const [createdNodeRedoStack, setCreatedNodeRedoStack] = useState<CreatedNodeSnapshot[]>([]);
  const [createdEdgeStack, setCreatedEdgeStack] = useState<CreatedEdgeSnapshot[]>([]);
  const [createdEdgeRedoStack, setCreatedEdgeRedoStack] = useState<CreatedEdgeSnapshot[]>([]);
  const [nodeResizeUndoStack, setNodeResizeUndoStack] = useState<NodeResizeSnapshot[]>([]);
  const [nodeResizeRedoStack, setNodeResizeRedoStack] = useState<NodeResizeSnapshot[]>([]);
  const canvasClipboardRef = useRef<CanvasClipboardItem | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [miniMapFrameSize, setMiniMapFrameSize] = useState({ width: 0, height: 0 });
  const [miniMapDragging, setMiniMapDragging] = useState(false);
  const miniMapDragPointerId = useRef<number | null>(null);
  const marqueePointerId = useRef<number | null>(null);
  const suppressCanvasBackgroundClickRef = useRef(false);
  const [marqueeSelectedNodeIds, setMarqueeSelectedNodeIds] = useState<string[] | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [marqueeSelection, setMarqueeSelection] = useState<MarqueeSelectionState>({
    isSelecting: false,
    startPoint: null,
    currentPoint: null,
    rect: null,
  });
  const [cutCursorPoint, setCutCursorPoint] = useState<Point | null>(null);
  const [connectionCursorPoint, setConnectionCursorPoint] = useState<Point | null>(null);
  const pan = viewport.pan;
  const zoom = viewport.zoom;
  const setPan = useCallback((nextPan: Point | ((currentPan: Point) => Point)) => {
    setViewport((currentViewport) => ({
      ...currentViewport,
      pan:
        typeof nextPan === "function"
          ? nextPan(currentViewport.pan)
          : nextPan,
    }));
  }, []);
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
  const canvasNodeGroups = useMemo(() => getCanvasNodeGroups(nodes), [nodes]);
  const selectedCanvasNodeGroup = useMemo(() => {
    if (!selectedGroupId) return null;
    return canvasNodeGroups.find((candidate) => candidate.id === selectedGroupId) ?? null;
  }, [canvasNodeGroups, selectedGroupId]);
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
  const multiSelectToolbarAnchor = useMemo(() => {
    // Groups add world-space padding around their members. Anchor the toolbar to
    // that outer frame so its screen-space offset remains stable at every zoom.
    if (selectedCanvasNodeGroup) {
      return {
        x: selectedCanvasNodeGroup.bounds.x + selectedCanvasNodeGroup.bounds.width / 2,
        y: selectedCanvasNodeGroup.bounds.y,
      };
    }

    if (!multiSelectBounds) return null;

    return {
      x: multiSelectBounds.x + multiSelectBounds.width / 2,
      y: multiSelectBounds.y,
    };
  }, [multiSelectBounds, selectedCanvasNodeGroup]);

  useEffect(() => {
    viewportRef.current = viewport;
  }, [viewport]);

  const clearWheelZoomRaf = useCallback(() => {
    if (wheelZoomRafRef.current !== null) {
      window.cancelAnimationFrame(wheelZoomRafRef.current);
      wheelZoomRafRef.current = null;
    }
  }, []);

  const clearWheelZoomCommit = useCallback(() => {
    if (wheelZoomTimeout.current !== null) {
      window.clearTimeout(wheelZoomTimeout.current);
      wheelZoomTimeout.current = null;
    }
  }, []);

  const commitViewportZoom = useCallback(
    (nextZoom: number) => {
      const normalizedZoom = clampCanvasViewportZoom(nextZoom);
      setImageRasterZoom(normalizedZoom);
      setIsWheelZooming(false);

      if (Math.abs(lastCommittedZoomRef.current - normalizedZoom) < 0.0001) {
        return;
      }

      lastCommittedZoomRef.current = normalizedZoom;
      onViewportZoomChange(normalizedZoom);
    },
    [onViewportZoomChange],
  );

  const scheduleWheelZoomCommit = useCallback(() => {
    clearWheelZoomCommit();
    wheelZoomTimeout.current = window.setTimeout(() => {
      wheelZoomTimeout.current = null;
      commitViewportZoom(viewportRef.current.zoom);
    }, WHEEL_ZOOM_COMMIT_DEBOUNCE_MS);
  }, [clearWheelZoomCommit, commitViewportZoom]);

  const flushPendingWheelZoom = useCallback(() => {
    wheelZoomRafRef.current = null;
    const cursor = pendingWheelCursorRef.current;
    const accumulatedDelta = pendingWheelDeltaRef.current;
    pendingWheelCursorRef.current = null;
    pendingWheelDeltaRef.current = 0;

    if (!cursor || Math.abs(accumulatedDelta) < 0.001) {
      return;
    }

    setViewport((currentViewport) => {
      const nextZoom = clampCanvasViewportZoom(
        currentViewport.zoom * Math.exp(-accumulatedDelta * WHEEL_ZOOM_SENSITIVITY),
      );

      if (Math.abs(nextZoom - currentViewport.zoom) < 0.0001) {
        return currentViewport;
      }

      return zoomCanvasViewportAtPoint(currentViewport, cursor, nextZoom);
    });
    setIsWheelZooming(true);
    scheduleWheelZoomCommit();
  }, [scheduleWheelZoomCommit]);

  const queueWheelZoomFrame = useCallback(() => {
    if (wheelZoomRafRef.current !== null) {
      return;
    }

    wheelZoomRafRef.current = window.requestAnimationFrame(flushPendingWheelZoom);
  }, [flushPendingWheelZoom]);

  useEffect(() => {
    const nextZoom = clampCanvasViewportZoom(viewportZoom);
    if (Math.abs(viewportRef.current.zoom - nextZoom) < 0.0001) {
      lastCommittedZoomRef.current = nextZoom;
      setImageRasterZoom(nextZoom);
      return;
    }

    clearWheelZoomRaf();
    clearWheelZoomCommit();
    pendingWheelDeltaRef.current = 0;
    pendingWheelCursorRef.current = null;
    setIsWheelZooming(false);
    lastCommittedZoomRef.current = nextZoom;
    setImageRasterZoom(nextZoom);

    const container = containerRef.current;
    if (!container) {
      setViewport((currentViewport) => ({
        ...currentViewport,
        zoom: nextZoom,
      }));
      return;
    }

    const viewportCenter = {
      x: container.clientWidth / 2,
      y: container.clientHeight / 2,
    };

    setViewport((currentViewport) =>
      zoomCanvasViewportAtPoint(currentViewport, viewportCenter, nextZoom),
    );
  }, [clearWheelZoomCommit, clearWheelZoomRaf, viewportZoom]);

  useEffect(() => {
    if (viewportResetVersion === lastViewportResetVersionRef.current) {
      return;
    }

    lastViewportResetVersionRef.current = viewportResetVersion;
    clearWheelZoomRaf();
    clearWheelZoomCommit();
    pendingWheelDeltaRef.current = 0;
    pendingWheelCursorRef.current = null;
    setIsWheelZooming(false);
    const nextZoom = clampCanvasViewportZoom(viewportZoom);
    lastCommittedZoomRef.current = nextZoom;
    setImageRasterZoom(nextZoom);
    setViewport({
      pan: { x: 0, y: 0 },
      zoom: nextZoom,
    });
  }, [clearWheelZoomCommit, clearWheelZoomRaf, viewportResetVersion, viewportZoom]);

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
  const [createdPenStrokeStack, setCreatedPenStrokeStack] = useState<PenStrokeObject[]>([]);
  const [createdPenStrokeRedoStack, setCreatedPenStrokeRedoStack] = useState<PenStrokeObject[]>([]);

  const commitNodeResize = useCallback((snapshot: NodeResizeSnapshot) => {
    if (
      snapshot.before.width === snapshot.after.width &&
      snapshot.before.height === snapshot.after.height
    ) {
      return;
    }

    setNodeResizeUndoStack((current) => [...current, snapshot]);
    setNodeResizeRedoStack([]);
  }, []);

  // -- Edge Creation State
  const [draftEdge, setDraftEdge] = useState<{
    sourceId: string;
    sourceGroupId?: string;
    sourceHandle: ImageHandlePosition;
    sourcePortId?: string;
    connectionKind: CanvasConnectionKind;
    targetX: number;
    targetY: number;
    /** Set when the connection originates from a preset child thumbnail */
    sourcePresetChildId?: string;
  } | null>(null);
  const [hoveredConnectionTargetId, setHoveredConnectionTargetId] = useState<string | null>(null);
  const [pendingGroupConnectionRole, setPendingGroupConnectionRole] = useState<{
    edgeId: string;
    x: number;
    y: number;
  } | null>(null);
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
    async (
      imageUrl: string,
      title = "Pasted Image",
      sourceMetadata: ImageSourceMetadata = {},
      placement?: Point,
    ) => {
      const pastePan = pan;
      const pasteZoom = zoom;
      const dimensions =
        sourceMetadata.width && sourceMetadata.height
          ? { width: sourceMetadata.width, height: sourceMetadata.height }
          : await loadImageDimensions(imageUrl);
      let createdNode: CanvasNode | null = null;
      onNodesChange((prev) => {
        const isFirst = prev.length === 0;
        const { width: nodeWidth, height: nodeHeight } = getPastedImageNodeSize(dimensions);
        const rect = containerRef.current?.getBoundingClientRect();
        const viewportCenterX = rect ? rect.width / 2 : 0;
        const viewportCenterY = rect ? rect.height / 2 : 0;
        const pasteWorldCenter = placement ?? getWorldPointFromPointer({
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

  const addLocalImageNode = useCallback(
    async (
      blob: Blob,
      title: string,
      sourceMetadata: ImageSourceMetadata = {},
      placement?: Point,
    ) => {
      onToast("Uploading image...");
      const localPreviewUrl = URL.createObjectURL(blob);

      try {
        const [dimensions, persisted] = await Promise.all([
          loadImageDimensions(localPreviewUrl),
          onPersistCanvasNodeImageAsset({
            blob,
            title,
            mimeType: sourceMetadata.mimeType,
            name: sourceMetadata.name,
            role: sourceMetadata.role,
            preserveTitle: sourceMetadata.preserveTitle,
          }),
        ]);

        await addImageNode(persisted.imageUrl, title, {
          ...sourceMetadata,
          assetId: persisted.assetId,
          mimeType: persisted.mimeType,
          sizeBytes: persisted.sizeBytes,
          name: persisted.name,
          width: dimensions?.width ?? sourceMetadata.width ?? null,
          height: dimensions?.height ?? sourceMetadata.height ?? null,
          preserveTitle: persisted.preserveTitle,
        }, placement);
      } finally {
        URL.revokeObjectURL(localPreviewUrl);
      }
    },
    [addImageNode, onPersistCanvasNodeImageAsset, onToast],
  );

  const copySelectedCanvasNode = useCallback(() => {
    if (selectedItem.type !== "node" && selectedItem.type !== "image") {
      return false;
    }

    const node = nodes.find((item) => item.id === selectedItem.id);
    if (!node) {
      return false;
    }

    canvasClipboardRef.current = {
      kind: "node",
      node,
      copiedAt: Date.now(),
    };
    onToast("Canvas image copied");
    return true;
  }, [nodes, onToast, selectedItem]);

  const pasteCopiedCanvasNode = useCallback(() => {
    const copied = canvasClipboardRef.current;
    if (!copied || copied.kind !== "node") {
      return false;
    }

    const pastedNode = cloneCanvasNodeForPaste(copied.node, nodes.length);
    onNodesChange((current) => [...current, pastedNode]);
    setCreatedNodeStack((current) => [...current, pastedNode]);
    setCreatedNodeRedoStack([]);
    onSetActiveNode(pastedNode.id);
    onSelect({ type: "node", id: pastedNode.id });
    onToast("Canvas image pasted");
    return true;
  }, [nodes.length, onNodesChange, onSelect, onSetActiveNode, onToast]);

  const pasteClipboardImageUrl = useCallback(
    async (url: string) => {
      const resolvedUrl = url.startsWith("/") ? new URL(url, window.location.origin).toString() : url;
      const response = await fetch(resolvedUrl, { credentials: "include" });
      if (!response.ok) {
        throw new Error("Unable to read image from clipboard URL.");
      }

      const blob = await response.blob();
      if (!blob.type.startsWith("image/")) {
        throw new Error("Clipboard URL is not an image.");
      }

      await addLocalImageNode(blob, "Pasted Image", {
        mimeType: blob.type,
        sizeBytes: blob.size,
      });
    },
    [addLocalImageNode],
  );

  const updateCanvasNode = useCallback(
    (nodeId: string, update: (node: CanvasNode) => CanvasNode) => {
      onNodesChange((current) =>
        current.map((node) => (node.id === nodeId ? update(node) : node)),
      );
    },
    [onNodesChange],
  );

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest("[data-prompt-composer]") || isTextEditingTarget(target)) return;

      const blob = getClipboardImageBlob(e.clipboardData);
      if (blob) {
        e.preventDefault();
        void addLocalImageNode(blob, "Pasted Image", {
          mimeType: blob.type,
          sizeBytes: blob.size,
        }).catch((error) => {
          onToast(error instanceof Error ? error.message : "Unable to add pasted image.");
        });
        return;
      }

      const imageUrl = extractImageUrlFromClipboardData(e.clipboardData);
      if (imageUrl) {
        e.preventDefault();
        void pasteClipboardImageUrl(imageUrl).catch((error) => {
          onToast(error instanceof Error ? error.message : "Unable to paste image URL.");
        });
        return;
      }

      if (pasteCopiedCanvasNode()) {
        e.preventDefault();
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [addLocalImageNode, onToast, pasteClipboardImageUrl, pasteCopiedCanvasNode]);

  useEffect(() => {
    const handleCopy = (event: ClipboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-prompt-composer]") || isTextEditingTarget(target)) return;

      if (!copySelectedCanvasNode()) return;

      event.preventDefault();
      event.clipboardData?.setData("text/plain", "Carver canvas image");
    };

    window.addEventListener("copy", handleCopy);
    return () => window.removeEventListener("copy", handleCopy);
  }, [copySelectedCanvasNode]);

  const handleCanvasDragEnter = useCallback((event: React.DragEvent<HTMLElement>) => {
    if (!hasCanvasFileDrop(event.dataTransfer)) return;
    event.preventDefault();
    setIsFileDropActive(true);
  }, []);

  const handleCanvasDragOver = useCallback((event: React.DragEvent<HTMLElement>) => {
    if (!hasCanvasFileDrop(event.dataTransfer)) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "copy";
    setIsFileDropActive(true);
  }, []);

  const handleCanvasDragLeave = useCallback((event: React.DragEvent<HTMLElement>) => {
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setIsFileDropActive(false);
  }, []);

  const handleCanvasDrop = useCallback((event: React.DragEvent<HTMLElement>) => {
    const files = getDroppedCanvasImageFiles(event.dataTransfer).slice(0, MAX_CANVAS_DROP_IMAGE_COUNT);
    if (!hasCanvasFileDrop(event.dataTransfer) && files.length === 0) return;

    event.preventDefault();
    setIsFileDropActive(false);
    if (files.length === 0) {
      onToast("Drop an image file to add it to the canvas.");
      return;
    }
    const bounds = event.currentTarget.getBoundingClientRect();
    const dropPoint = getWorldPointFromPointer({
      point: { x: event.clientX - bounds.left, y: event.clientY - bounds.top },
      pan,
      zoom,
    });

    void (async () => {
      for (const [index, file] of files.entries()) {
        const title = file.name.replace(/\.[^.]+$/, "") || "Dropped Image";
        const offset = (index * 36) / Math.max(zoom, 0.0001);
        try {
          await addLocalImageNode(file, title, {
            mimeType: file.type,
            name: file.name,
            sizeBytes: file.size,
          }, {
            x: dropPoint.x + offset,
            y: dropPoint.y + offset,
          });
        } catch (error) {
          onToast(error instanceof Error ? error.message : `Unable to add ${file.name}.`);
        }
      }
    })();
  }, [addLocalImageNode, onToast, pan, zoom]);

  useEffect(() => {
    if (!pendingLibraryInsertAsset) return;

    void addImageNode(pendingLibraryInsertAsset.src, pendingLibraryInsertAsset.title ?? "Library Asset", {
      assetId: pendingLibraryInsertAsset.id,
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
    if (isLocallyScopedWheelTarget(event.target)) return;
    event.preventDefault();

    const container = containerRef.current;
    if (!container) return;

    pendingWheelCursorRef.current = getCursorPointRelativeToContainer(event, container);
    pendingWheelDeltaRef.current += normalizeCanvasWheelDelta({
      deltaY: event.deltaY,
      deltaMode: event.deltaMode,
      ctrlKey: event.ctrlKey,
    });
    queueWheelZoomFrame();
  }, [isRegionEditing, queueWheelZoomFrame]);

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
      if (activeTool === "cut") return;
      if (activeTool === "text-note") {
        event.stopPropagation();
        if (draggingNodeId || draftEdge || miniMapDragging || isPanning.current) return;
        if (isCanvasInteractiveTarget(event.target)) return;

        const container = containerRef.current;
        if (!container) return;

        const screenPoint = getPointerPointInContainer(event, container);
        const point = getWorldPointFromPointer({
          point: screenPoint,
          pan,
          zoom,
        });
        const textNode: CanvasTextNode = {
          id: `text-${Date.now()}`,
          kind: "text",
          title: "Text note",
          role: "text",
          imageUrl: "",
          prompt: null,
          x: point.x,
          y: point.y,
          width: 280,
          height: 180,
          scale: 1,
          inputPorts: getTextNodeInputPorts(),
          text: { content: "" },
          createdAt: new Date().toISOString(),
        };

        onNodesChange((current) => [...current, textNode]);
        setCreatedNodeStack((current) => [...current, textNode]);
        setCreatedNodeRedoStack([]);
        setMarqueeSelectedNodeIds(null);
        onSetActiveNode(textNode.id);
        onSelect({ type: "node", id: textNode.id });
        onTool("select");
        onToast("Text note added");
        return;
      }
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
          points:
            penSettings.drawingMode === "geometry"
              ? buildPenGeometryPoints(penSettings.geometryShape, startPoint, startPoint)
              : [startPoint],
          color: penSettings.color,
          opacity: penSettings.opacity,
          strokeWidth: penSettings.strokeWidth,
          drawingMode: penSettings.drawingMode,
          geometryShape: penSettings.geometryShape,
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
    [activeTool, applyEraserAt, draftEdge, draggingNodeId, isRegionEditing, isResizingPanel, miniMapDragging, onNodesChange, onSelect, onSetActiveNode, onToast, onTool, pan, penSettings.color, penSettings.drawingMode, penSettings.geometryShape, penSettings.opacity, penSettings.strokeWidth, penStrokes, updateEraserPreview, zoom],
  );

  // ── Node Dragging logic ───────────────────────────────────────────────────
  const handleNodePointerDown = (id: string, event: React.PointerEvent) => {
    if (isResizingPanel) return;
    const node = nodes.find(n => n.id === id);
    if (!node) return;
    if (activeTool === "connection") {
      if (event.button !== 0) return;
      if (node.kind === "assistant") {
        event.preventDefault();
        event.stopPropagation();
        onToast("Assistant outputs text only. Drag from its text port.");
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const sourcePortId = getDefaultSourcePortId({ node, kind: "image", side: "right" });
      const startPoint =
        getSemanticPortPoint(node, sourcePortId) ?? getAggregateHandlePoint(node, "right", "image");
      setDraftEdge({
        sourceId: id,
        sourceHandle: "right",
        sourcePortId,
        connectionKind: "image",
        targetX: startPoint.x,
        targetY: startPoint.y,
      });
      setHoveredConnectionTargetId(null);
      return;
    }
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

  const handleGroupPointerDown = (groupId: string, event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || isResizingPanel) return;
    const group = canvasNodeGroups.find((candidate) => candidate.id === groupId);
    const representativeNodeId = group?.nodeIds[0];
    if (!representativeNodeId) return;

    event.stopPropagation();
    if (selectedGroupId !== groupId) {
      // The first click only selects the group. A subsequent drag uses the
      // established node-drag lifecycle below, which keeps edges and history stable.
      event.preventDefault();
      clearMarqueeSelection();
      setMarqueeSelectedNodeIds(group.nodeIds);
      setSelectedGroupId(groupId);
      onSelect({ type: "none" });
      return;
    }

    handleNodePointerDown(representativeNodeId, event);
  };

  const handleGroupSelectedNodes = useCallback(() => {
    if (!canGroupSelectedNodes) return;

    const nextGroupId = `node-group-${Date.now()}`;
    const nextGroupLabel = getNextCanvasGroupLabel(nodes);
    onNodesChange((previousNodes) =>
      previousNodes.map((node) =>
        selectedNodeIds.includes(node.id)
          ? { ...node, groupId: nextGroupId, groupLabel: nextGroupLabel, groupColor: "neutral" }
          : node,
      ),
    );
    setMarqueeSelectedNodeIds(selectedNodeIds);
    setSelectedGroupId(nextGroupId);
    onSelect({ type: "node", id: selectedNodeIds[0] });
    onToast("Grouped selected images");
  }, [canGroupSelectedNodes, nodes, onNodesChange, onSelect, onToast, selectedNodeIds]);

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
          ? { ...node, groupId: undefined, groupLabel: undefined, groupColor: undefined }
          : node,
      ),
    );
    setMarqueeSelectedNodeIds(selectedGroupedNodeIds);
    setSelectedGroupId(null);
    onSelect({ type: "node", id: selectedGroupedNodeIds[0] });
    onToast("Ungrouped selected images");
  }, [canUngroupSelectedNodes, onNodesChange, onSelect, onToast, selectedNodes]);

  const handleRenameSelectedGroup = useCallback(() => {
    if (selectedGroupIds.length !== 1) return;
    const group = canvasNodeGroups.find((candidate) => candidate.id === selectedGroupIds[0]);
    if (!group) return;
    const nextLabel = window.prompt("Name this image group", group.label)?.trim();
    if (!nextLabel || nextLabel === group.label) return;

    onNodesChange((previousNodes) => previousNodes.map((node) =>
      node.groupId === group.id ? { ...node, groupLabel: nextLabel } : node,
    ));
    onToast("Group renamed");
  }, [canvasNodeGroups, onNodesChange, onToast, selectedGroupIds]);

  const handleGroupColorChange = useCallback((groupId: string, color: CanvasGroupColor) => {
    onNodesChange((previousNodes) => previousNodes.map((node) =>
      node.groupId === groupId ? { ...node, groupColor: color } : node,
    ));
  }, [onNodesChange]);

  const handleArrangeGroup = useCallback((groupId: string, mode: CanvasGroupArrangeMode) => {
    onNodesChange((previousNodes) => arrangeCanvasNodeGroup(previousNodes, groupId, mode));
    onToast(`Group arranged as ${mode}`);
  }, [onNodesChange, onToast]);

  const handleGroupConnectionStart = useCallback((groupId: string, event: React.PointerEvent<HTMLButtonElement>) => {
    if (isResizingPanel) return;
    const group = canvasNodeGroups.find((candidate) => candidate.id === groupId);
    if (!group) return;
    event.preventDefault();
    event.stopPropagation();
    const sourcePortId = GROUP_OUTPUT_IMAGE_PORT_ID;
    const startPoint = getGroupSemanticPortPoint(group, sourcePortId);
    if (!startPoint) return;
    setDraftEdge({
      sourceId: group.nodeIds[0],
      sourceGroupId: group.id,
      sourceHandle: "right",
      sourcePortId,
      connectionKind: "image",
      targetX: startPoint.x,
      targetY: startPoint.y,
    });
    setHoveredConnectionTargetId(null);
  }, [canvasNodeGroups, isResizingPanel]);

  const handleConnectionHandlePointerDown = useCallback(
    (
      nodeId: string,
      handle: ImageHandlePosition,
      connectionKind: CanvasConnectionKind,
      event: React.PointerEvent<HTMLButtonElement>,
      sourcePortId?: string,
    ) => {
      if (isResizingPanel) return;
      event.preventDefault();
      event.stopPropagation();

      const sourceNode = nodes.find((node) => node.id === nodeId);
      if (!sourceNode) return;

      const resolvedSourcePortId = sourcePortId ?? getDefaultSourcePortId({
        node: sourceNode,
        kind: connectionKind,
        side: handle,
      });
      const startPoint =
        getSemanticPortPoint(sourceNode, resolvedSourcePortId) ??
        getAggregateHandlePoint(sourceNode, handle, connectionKind);
      setDraftEdge({
        sourceId: nodeId,
        sourceHandle: handle,
        sourcePortId: resolvedSourcePortId,
        connectionKind,
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
        connectionKind: "image",
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
    if (activeTool === "cut") {
      const container = containerRef.current;
      if (container) {
        setCutCursorPoint(getPointerPointInContainer(event, container));
      }
      return;
    }
    if (activeTool === "connection") {
      const container = containerRef.current;
      if (container) {
        setConnectionCursorPoint(
          isCanvasUiTarget(event.target)
            ? null
            : getPointerPointInContainer(event, container),
        );
      }
    }
    if (isPanning.current && panStart.current) {
      const start = panStart.current;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      setPan({ x: start.panX + dx, y: start.panY + dy });
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

        if (currentStroke.drawingMode === "geometry") {
          return {
            ...currentStroke,
            points: buildPenGeometryPoints(
              currentStroke.geometryShape ?? "rectangle",
              currentStroke.points[0],
              currentPoint,
            ),
          };
        }

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
        if (draftEdge.sourceGroupId ? node.groupId === draftEdge.sourceGroupId : node.id === draftEdge.sourceId) return false;
        const alreadyConnected = edges.some(
          (e) =>
            (e.sourceGroupId === draftEdge.sourceGroupId && e.targetId === node.id) ||
            (e.sourceId === draftEdge.sourceId && e.targetId === node.id) ||
            (e.sourceId === node.id && e.targetId === draftEdge.sourceId),
        );
        if (alreadyConnected) return false;
        const bounds = getNodeDisplayBounds(node);
        return target.x >= bounds.x && target.x <= bounds.x + bounds.width && target.y >= bounds.y && target.y <= bounds.y + bounds.height;
      });
      setHoveredConnectionTargetId(hoveredNode?.id ?? null);
    }
  }, [activeTool, applyEraserAt, draftEdge, draftPenStroke, draggingNodeId, edges, isRegionEditing, isResizingPanel, marqueeSelection, nodes, onNodesChange, pan, setPan, updateEraserPreview, zoom]);

  const handlePointerUp = useCallback((event: React.PointerEvent) => {
    if (isRegionEditing) return;
    if (isResizingPanel) return;
    if (activeTool === "pen" && penPointerId.current === event.pointerId) {
      event.stopPropagation();
      if (draftPenStroke && draftPenStroke.points.length > 0) {
        const completedStroke =
          draftPenStroke.drawingMode === "geometry"
            ? draftPenStroke
            : draftPenStroke.points.length === 1
              ? {
                  ...draftPenStroke,
                  points: [...draftPenStroke.points, draftPenStroke.points[0]],
                }
              : draftPenStroke;

        if (
          completedStroke.drawingMode !== "geometry" ||
          hasMinimumPenGeometrySize(completedStroke.points, MIN_GEOMETRY_SIZE)
        ) {
          onAddPenStroke(completedStroke);
          setCreatedPenStrokeStack((current) => [...current, completedStroke]);
          setCreatedPenStrokeRedoStack([]);
        } else {
          onToast("Draw a larger shape");
        }
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
      const container = containerRef.current;
      if (container) {
        const screenPoint = getPointerPointInContainer(event, container);
        const drop = getWorldPointFromPointer({
          point: screenPoint,
          pan,
          zoom,
        });

        const targetNode = nodes.find((node) => {
          const bounds = getNodeDisplayBounds(node);
          return (
            (draftEdge.sourceGroupId ? node.groupId !== draftEdge.sourceGroupId : node.id !== draftEdge.sourceId) &&
            drop.x >= bounds.x &&
            drop.x <= bounds.x + bounds.width &&
            drop.y >= bounds.y &&
            drop.y <= bounds.y + bounds.height
          );
        });

        if (targetNode) {
          const sourceNode = nodes.find((node) => node.id === draftEdge.sourceId);
          const role =
            draftEdge.sourceGroupId || draftEdge.connectionKind === "text"
              ? "generic_reference"
              : sourceNode
                ? inferConnectionRoleFromNode(sourceNode)
                : "generic_reference";
          const sourceIsPresetGroup = sourceNode ? isPresetGroupNode(sourceNode) : false;

          const edgeExists = draftEdge.sourceGroupId
            ? edges.some((edge) => edge.sourceGroupId === draftEdge.sourceGroupId && edge.targetId === targetNode.id)
            : draftEdge.sourcePresetChildId
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
            const targetPortId = getTargetPortIdForConnection({
              node: targetNode,
              kind: draftEdge.connectionKind,
              edges,
            });
            if (!targetPortId) {
              onToast(`This node does not accept ${draftEdge.connectionKind} connections`);
              setDraftEdge(null);
              setHoveredConnectionTargetId(null);
              return;
            }
            const targetPort = getNodeSemanticPort(targetNode, targetPortId);

            const newEdge: CanvasEdge = {
              id: `edge-${Date.now()}`,
              sourceId: draftEdge.sourceId,
              targetId: targetNode.id,
              kind: draftEdge.connectionKind,
              sourcePortId: draftEdge.sourcePortId,
              targetPortId,
              fromHandle: draftEdge.sourceHandle,
              toHandle: targetPort?.side ?? (draftEdge.sourceHandle === "right" ? "left" : "right"),
              role,
              label:
                draftEdge.connectionKind === "text"
                  ? "prompt"
                  : role.replace("_reference", "").replaceAll("_", " "),
              createdAt: new Date().toISOString(),
              ...(draftEdge.sourceGroupId ? { sourceGroupId: draftEdge.sourceGroupId } : {}),
              ...(draftEdge.sourcePresetChildId ? { sourcePresetChildId: draftEdge.sourcePresetChildId } : {}),
            };
            onEdgesChange(prev => [...prev, newEdge]);
            setCreatedEdgeStack((current) => [...current, { edge: newEdge }]);
            setCreatedEdgeRedoStack([]);
            setMarqueeSelectedNodeIds(null);
            onSelect({ type: "edge", id: newEdge.id });
            if (draftEdge.sourceGroupId) {
              setPendingGroupConnectionRole({ edgeId: newEdge.id, x: drop.x, y: drop.y });
              onToast("Choose how AI should use this image group");
            } else {
              onToast("Connection created");
            }
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
      clearWheelZoomCommit();
      clearWheelZoomRaf();
    };
  }, [clearWheelZoomCommit, clearWheelZoomRaf]);

  useEffect(() => {
    if (activeTool === "eraser") return;

    lastEraserMotionRef.current = null;
    clearEraserSession();
  }, [activeTool, clearEraserSession]);

  const deleteNode = useCallback(
    (nodeId: string) => {
      const nodeToDelete = nodes.find((node) => node.id === nodeId);
      if (!nodeToDelete) return;

      const cascadeNodeIds = new Set([
        nodeId,
        ...(nodeToDelete.kind === "image-generator"
          ? nodes
              .filter(
                (node) =>
                  node.kind === "image-output-gallery" &&
                  node.imageOutputGallery.generatorNodeId === nodeId,
              )
              .map((node) => node.id)
          : []),
      ]);
      const deletedNodes = nodes.filter((node) => cascadeNodeIds.has(node.id));
      const relatedEdges = edges.filter(
        (edge) => cascadeNodeIds.has(edge.sourceId) || cascadeNodeIds.has(edge.targetId),
      );

      setDeletedNodeStack((prev) => [...prev, { nodes: deletedNodes, edges: relatedEdges }]);
      onNodesChange((prev) => prev.filter((node) => !cascadeNodeIds.has(node.id)));
      onEdgesChange((prev) => prev.filter((edge) => !cascadeNodeIds.has(edge.sourceId) && !cascadeNodeIds.has(edge.targetId)));
      if (activeNodeId === nodeId) {
        const nextActiveNode = nodes.find((node) => node.id !== nodeId);
        onSetActiveNode(nextActiveNode?.id ?? "");
      }
      onSelect({ type: "none" });
      onToast(isPresetGroupNode(nodeToDelete) ? "Preset folder removed" : "Image deleted");
    },
    [activeNodeId, edges, nodes, onEdgesChange, onNodesChange, onSelect, onSetActiveNode, onToast],
  );

  const cutConnection = useCallback(
    (edgeId: string) => {
      const edge = edges.find((currentEdge) => currentEdge.id === edgeId);
      if (!edge) return;

      onEdgesChange((currentEdges) => currentEdges.filter((currentEdge) => currentEdge.id !== edgeId));
      setMarqueeSelectedNodeIds(null);
      if (selectedItem.type === "edge" && selectedItem.id === edgeId) {
        onSelect({ type: "none" });
      }
      onToast("Connection removed");
    },
    [edges, onEdgesChange, onSelect, onToast, selectedItem],
  );

  const undoDeleteNode = useCallback(() => {
    const snapshot = deletedNodeStack.at(-1);
    if (!snapshot) {
      return false;
    }

    setDeletedNodeStack((prev) => prev.slice(0, -1));
    onNodesChange((currentNodes) => [
      ...currentNodes,
      ...snapshot.nodes.filter((node) => !currentNodes.some((currentNode) => currentNode.id === node.id)),
    ]);
    onEdgesChange((currentEdges) => [
      ...currentEdges,
      ...snapshot.edges.filter((edge) => !currentEdges.some((currentEdge) => currentEdge.id === edge.id)),
    ]);
    onSetActiveNode(snapshot.nodes[0]?.id ?? "");
    if (snapshot.nodes[0]) {
      onSelect({ type: "node", id: snapshot.nodes[0].id });
    }
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

  const undoCreateEdge = useCallback(() => {
    const latestAction = createdEdgeStack.at(-1);
    if (!latestAction) return false;

    setCreatedEdgeStack((current) => current.slice(0, -1));
    setCreatedEdgeRedoStack((current) => [...current, latestAction]);
    onEdgesChange((current) => current.filter((edge) => edge.id !== latestAction.edge.id));
    onSelect({ type: "none" });
    onToast("Connection undone");
    return true;
  }, [createdEdgeStack, onEdgesChange, onSelect, onToast]);

  const undoCreatePenStroke = useCallback(() => {
    const stroke = createdPenStrokeStack.at(-1);
    if (!stroke) return false;

    setCreatedPenStrokeStack((current) => current.slice(0, -1));
    setCreatedPenStrokeRedoStack((current) => [...current, stroke]);
    onReplacePenStrokes(penStrokes.filter((item) => item.id !== stroke.id));
    onSelect({ type: "none" });
    onToast("Drawing undone");
    return true;
  }, [createdPenStrokeStack, onReplacePenStrokes, onSelect, onToast, penStrokes]);

  const redoCreateEdge = useCallback(() => {
    const latestAction = createdEdgeRedoStack.at(-1);
    if (!latestAction) return false;

    setCreatedEdgeRedoStack((current) => current.slice(0, -1));
    setCreatedEdgeStack((current) => [...current, latestAction]);
    onEdgesChange((current) =>
      current.some((edge) => edge.id === latestAction.edge.id) ? current : [...current, latestAction.edge],
    );
    onSelect({ type: "edge", id: latestAction.edge.id });
    onToast("Connection restored");
    return true;
  }, [createdEdgeRedoStack, onEdgesChange, onSelect, onToast]);

  const redoCreatePenStroke = useCallback(() => {
    const stroke = createdPenStrokeRedoStack.at(-1);
    if (!stroke) return false;

    setCreatedPenStrokeRedoStack((current) => current.slice(0, -1));
    setCreatedPenStrokeStack((current) => [...current, stroke]);
    onReplacePenStrokes(
      penStrokes.some((item) => item.id === stroke.id) ? penStrokes : [...penStrokes, stroke],
    );
    onSelect({ type: "pen-stroke", id: stroke.id });
    onToast("Drawing restored");
    return true;
  }, [createdPenStrokeRedoStack, onReplacePenStrokes, onSelect, onToast, penStrokes]);

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

  const undoNodeResize = useCallback(() => {
    const snapshot = nodeResizeUndoStack.at(-1);
    if (!snapshot) return false;

    setNodeResizeUndoStack((current) => current.slice(0, -1));
    setNodeResizeRedoStack((current) => [...current, snapshot]);
    onNodesChange((currentNodes) =>
      currentNodes.map((currentNode) =>
        currentNode.id === snapshot.nodeId
          ? {
              ...currentNode,
              width: snapshot.before.width,
              height: snapshot.before.height,
            }
          : currentNode,
      ),
    );
    onSetActiveNode(snapshot.nodeId);
    onSelect({ type: "node", id: snapshot.nodeId });
    onToast("Assistant resize undone");
    return true;
  }, [nodeResizeUndoStack, onNodesChange, onSelect, onSetActiveNode, onToast]);

  const redoNodeResize = useCallback(() => {
    const snapshot = nodeResizeRedoStack.at(-1);
    if (!snapshot) return false;

    setNodeResizeRedoStack((current) => current.slice(0, -1));
    setNodeResizeUndoStack((current) => [...current, snapshot]);
    onNodesChange((currentNodes) =>
      currentNodes.map((currentNode) =>
        currentNode.id === snapshot.nodeId
          ? {
              ...currentNode,
              width: snapshot.after.width,
              height: snapshot.after.height,
            }
          : currentNode,
      ),
    );
    onSetActiveNode(snapshot.nodeId);
    onSelect({ type: "node", id: snapshot.nodeId });
    onToast("Assistant resize restored");
    return true;
  }, [nodeResizeRedoStack, onNodesChange, onSelect, onSetActiveNode, onToast]);

  const handleUndoAction = useCallback(() => {
    if (undoNodeResize()) return;
    if (undoCreateEdge()) return;
    if (undoCreatePenStroke()) return;
    if (undoPenErase()) {
      onToast("Erase undone");
      return;
    }
    if (undoDeleteNode()) return;
    if (undoCreateNode()) return;
    onToast("Nothing to undo");
  }, [onToast, undoCreateEdge, undoCreateNode, undoCreatePenStroke, undoDeleteNode, undoNodeResize, undoPenErase]);

  const handleRedoAction = useCallback(() => {
    if (redoNodeResize()) return;
    if (redoCreateEdge()) return;
    if (redoCreatePenStroke()) return;
    if (redoPenErase()) {
      onToast("Erase redone");
      return;
    }
    if (redoCreateNode()) return;
    onToast("Nothing to redo");
  }, [onToast, redoCreateEdge, redoCreateNode, redoCreatePenStroke, redoNodeResize, redoPenErase]);

  useEffect(() => {
    onHistoryActionsChange?.({
      undo: handleUndoAction,
      redo: handleRedoAction,
    });

    return () => {
      onHistoryActionsChange?.(null);
    };
  }, [handleRedoAction, handleUndoAction, onHistoryActionsChange]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("textarea,input,[contenteditable='true']")) return;

      if (event.key === "Escape" && pendingGroupConnectionRole) {
        event.preventDefault();
        setPendingGroupConnectionRole(null);
        return;
      }

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

      if (event.key === "Escape" && activeTool === "connection" && draftEdge) {
        event.preventDefault();
        setDraftEdge(null);
        setHoveredConnectionTargetId(null);
        onToast("Connection cancelled");
        return;
      }

      if (event.key === "Escape" && activeTool === "eraser" && eraserPreview.visible) {
        event.preventDefault();
        setEraserPreview((current) => ({ ...current, visible: false }));
        clearEraserSession();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") {
        return;
      }

      if ((event.ctrlKey || event.metaKey) && ((event.shiftKey && event.key.toLowerCase() === "z") || event.key.toLowerCase() === "y")) {
        event.preventDefault();
        handleRedoAction();
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        handleUndoAction();
        return;
      }

      if (
        event.key.toLowerCase() === "l" &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey &&
        containerRef.current?.contains(document.activeElement)
      ) {
        event.preventDefault();
        onTool("connection");
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
  }, [activeTool, cancelDraftPenStroke, clearEraserSession, clearMarqueeSelection, deleteNode, draftEdge, draftPenStroke, eraserPreview.visible, handleRedoAction, handleUndoAction, marqueeSelection.isSelecting, onDeletePenStroke, onSelect, onToast, onTool, pendingGroupConnectionRole, selectedItem]);

  const snapshotStatusText = useMemo(() => {
    if (!projectId) {
      return "Local canvas";
    }

    if (isSnapshotLoading) {
      return "Loading snapshot";
    }

    if (isSnapshotSaving) {
      return "Saving version";
    }

    if (isDraftSaving) {
      return "Saving local draft";
    }

    if (!currentSnapshotMeta) {
      return hasUnsavedSnapshotChanges ? "Unsaved changes" : "Not saved yet";
    }

    return hasUnsavedSnapshotChanges
      ? `Unsaved changes · v${currentSnapshotMeta.version}`
      : `Saved · v${currentSnapshotMeta.version}`;
  }, [
    currentSnapshotMeta,
    isDraftSaving,
    hasUnsavedSnapshotChanges,
    isSnapshotLoading,
    isSnapshotSaving,
    projectId,
  ]);
  const creditsDisplayText = typeof creditsAmount === "number" ? String(creditsAmount) : "--";

  const miniMapModel = useMemo(() => {
    const viewportWorldWidth = zoom > 0 ? containerSize.width / zoom : 0;
    const viewportWorldHeight = zoom > 0 ? containerSize.height / zoom : 0;
    const viewportWorldX = zoom > 0 ? -pan.x / zoom : 0;
    const viewportWorldY = zoom > 0 ? -pan.y / zoom : 0;

    const worldRects = nodes.map((node) => {
      const bounds = getNodeDisplayBounds(node);

      return {
        id: node.id,
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
      };
    });

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
        widthPx: rect.width * scale,
        heightPx: rect.height * scale,
      })),
      viewportRect: {
        left: offsetX + (viewportWorldX - paddedMinX) * scale,
        top: offsetY + (viewportWorldY - paddedMinY) * scale,
        width: viewportWorldWidth * scale,
        height: viewportWorldHeight * scale,
      },
    };
  }, [containerSize.height, containerSize.width, miniMapFrameSize.height, miniMapFrameSize.width, nodes, pan.x, pan.y, zoom]);

  const panToMiniMapPoint = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const frame = miniMapFrameRef.current;
      if (!frame || miniMapModel.scale <= 0 || containerSize.width <= 0 || containerSize.height <= 0) {
        return;
      }

      const frameRect = frame.getBoundingClientRect();
      const miniMapX = clamp(event.clientX - frameRect.left, 0, frameRect.width);
      const miniMapY = clamp(event.clientY - frameRect.top, 0, frameRect.height);
      const worldX = clamp(
        miniMapModel.world.minX + (miniMapX - miniMapModel.offsetX) / miniMapModel.scale,
        miniMapModel.world.minX,
        miniMapModel.world.minX + miniMapModel.world.width,
      );
      const worldY = clamp(
        miniMapModel.world.minY + (miniMapY - miniMapModel.offsetY) / miniMapModel.scale,
        miniMapModel.world.minY,
        miniMapModel.world.minY + miniMapModel.world.height,
      );

      // A minimap pointer always represents the center of the main camera.
      setPan({
        x: containerSize.width / 2 - worldX * zoom,
        y: containerSize.height / 2 - worldY * zoom,
      });
    },
    [containerSize.height, containerSize.width, miniMapModel, setPan, zoom],
  );

  const handleMiniMapPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      miniMapDragPointerId.current = event.pointerId;
      setMiniMapDragging(true);
      panToMiniMapPoint(event);
      event.currentTarget.setPointerCapture(event.pointerId);
    },
    [panToMiniMapPoint],
  );

  const handleMiniMapPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (miniMapDragPointerId.current !== event.pointerId) return;
      event.preventDefault();
      event.stopPropagation();
      panToMiniMapPoint(event);
    },
    [panToMiniMapPoint],
  );

  const handleMiniMapPointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (miniMapDragPointerId.current !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    miniMapDragPointerId.current = null;
    setMiniMapDragging(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }, []);

  return (
    <section
      ref={containerRef}
      tabIndex={0}
      className="relative isolate h-full flex-1 touch-none select-none overflow-hidden bg-[var(--canvas-theme-canvas)] outline-none"
      style={{
        cursor:
          isPanningCanvas
            ? "grabbing"
            : activeTool === "cut" || (activeTool === "connection" && connectionCursorPoint)
              ? "none"
              : activeTool === "pen" || marqueeSelection.isSelecting
                ? "crosshair"
                : "default",
      }}
      onClick={(event) => {
        if (suppressCanvasBackgroundClickRef.current) {
          suppressCanvasBackgroundClickRef.current = false;
          return;
        }

        if (isCanvasInteractiveTarget(event.target)) return;
        setMarqueeSelectedNodeIds(null);
        setSelectedGroupId(null);
        onSelect({ type: "none" });
      }}
      onPointerDownCapture={(event) => {
        if (!isTextEditingTarget(event.target)) {
          event.currentTarget.focus({ preventScroll: true });
        }
      }}
      onPointerDown={handleCanvasPointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDragEnter={handleCanvasDragEnter}
      onDragOver={handleCanvasDragOver}
      onDragLeave={handleCanvasDragLeave}
      onDrop={handleCanvasDrop}
      onPointerLeave={(event) => {
        if (activeTool === "cut") {
          setCutCursorPoint(null);
        }
        if (activeTool === "connection") {
          setConnectionCursorPoint(null);
        }
        handlePointerUp(event);
      }}
    >
      <div
        ref={worldLayerRef}
        className="absolute inset-0 z-10"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "0 0",
          transition: "none",
        }}
      >
        {isMultiNodeSelection && multiSelectToolbarAnchor ? (
          <MultiSelectToolbar
            x={multiSelectToolbarAnchor.x}
            y={multiSelectToolbarAnchor.y}
            viewportZoom={zoom}
            canGroup={canGroupSelectedNodes}
            canUngroup={canUngroupSelectedNodes}
            group={selectedCanvasNodeGroup}
            onGroup={handleGroupSelectedNodes}
            onUngroup={handleUngroupSelectedNodes}
            onRenameGroup={handleRenameSelectedGroup}
            onChangeGroupColor={handleGroupColorChange}
            onArrangeGroup={handleArrangeGroup}
            onMerge={() => onToast("Merge action coming soon")}
            onDownload={() => onToast("Download selection mock")}
          />
        ) : null}

        {canvasNodeGroups.map((group) => (
          <CanvasNodeGroupFrame
            key={group.id}
            group={group}
            edges={edges}
            selected={selectedGroupId === group.id}
            onPointerDown={handleGroupPointerDown}
            onStartConnection={handleGroupConnectionStart}
          />
        ))}

        {marqueeSelection.rect ? (
          <div
            className="pointer-events-none absolute border border-[var(--canvas-theme-guide)] bg-[var(--canvas-theme-guide-soft)]"
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
          cutMode={activeTool === "cut"}
          onEdgeClick={(id, e) => {
            e.stopPropagation();
            setMarqueeSelectedNodeIds(null);
            setSelectedGroupId(null);
            onSelect({ type: "edge", id });
          }}
          onEdgeCut={cutConnection}
          draftEdge={draftEdge}
        />

        {pendingGroupConnectionRole ? (
          <GroupConnectionRolePicker
            x={pendingGroupConnectionRole.x}
            y={pendingGroupConnectionRole.y}
            viewportZoom={zoom}
            onSelect={(role, label) => {
              onEdgesChange((previousEdges) => previousEdges.map((edge) =>
                edge.id === pendingGroupConnectionRole.edgeId ? { ...edge, role, label } : edge,
              ));
              setPendingGroupConnectionRole(null);
              onToast(`Group connected as ${label.toLowerCase()}`);
            }}
          />
        ) : null}

        {nodes.map(node =>
          isPresetGroupNode(node) ? (
            <CanvasPresetGroupNodeCard
              key={node.id}
              node={node}
              edges={edges}
              selected={selectedNodeIds.includes(node.id) && selectedGroupId !== node.groupId}
              selectedItem={selectedItem}
              viewportZoom={zoom}
              isConnectionTarget={hoveredConnectionTargetId === node.id}
              hoveredPresetChildId={hoveredPresetChildId}
              onSelect={(id) => {
                setSelectedGroupId(null);
                setMarqueeSelectedNodeIds(null);
                onSelect({ type: "node", id });
              }}
              onSelectPresetChild={(nodeId, childId) => {
                setSelectedGroupId(null);
                setMarqueeSelectedNodeIds(null);
                onSelect({ type: "presetChild", nodeId, childId });
              }}
              onSetActivePresetChild={onSetActivePresetChild}
              onRemovePresetChild={onRemovePresetChild}
              onMovePresetChild={onMovePresetChild}
              onDragStart={(id, event) => {
                setSelectedGroupId(null);
                handleNodePointerDown(id, event);
              }}
              onStartConnection={handleConnectionHandlePointerDown}
              onStartChildConnection={handlePresetChildConnectionStart}
              onSelectContextMenu={(id, x, y) => {
                setSelectedGroupId(null);
                setMarqueeSelectedNodeIds(null);
                onSelect({ type: "node", id, menu: { x, y } });
              }}
              onDelete={deleteNode}
              onPresetChildHover={setHoveredPresetChildId}
            />
          ) : isCanvasContextGroupNode(node) ? (
            <CanvasContextGroupNodeCard
              key={node.id}
              node={node}
              allNodes={nodes}
              selected={selectedNodeIds.includes(node.id) && selectedGroupId !== node.groupId}
              isConnectionTarget={hoveredConnectionTargetId === node.id}
              onSelect={(id) => {
                setSelectedGroupId(null);
                setMarqueeSelectedNodeIds(null);
                onSelect({ type: "node", id });
              }}
              onDragStart={(id, event) => {
                setSelectedGroupId(null);
                handleNodePointerDown(id, event);
              }}
              onStartConnection={handleConnectionHandlePointerDown}
              onSelectContextMenu={(id, x, y) => {
                setSelectedGroupId(null);
                setMarqueeSelectedNodeIds(null);
                onSelect({ type: "node", id, menu: { x, y } });
              }}
            />
          ) : isCanvasCameraShotSetNode(node) ? (
            <CanvasCameraShotSetNodeCard
              key={node.id}
              node={node}
              edges={edges}
              selected={selectedNodeIds.includes(node.id) && selectedGroupId !== node.groupId}
              isConnectionTarget={hoveredConnectionTargetId === node.id}
              onSelect={(id) => {
                setSelectedGroupId(null);
                setMarqueeSelectedNodeIds(null);
                onSelect({ type: "node", id });
              }}
              onDragStart={(id, event) => {
                setSelectedGroupId(null);
                handleNodePointerDown(id, event);
              }}
              inputImageUrl={(() => {
                const inputEdge = edges.find((edge) =>
                  edge.targetId === node.id && resolveTargetPortIdForEdge({
                    node,
                    targetPortId: edge.targetPortId,
                    kind: edge.kind ?? "image",
                  }) === "camera-shot-set-input-image",
                );
                const inputNode = inputEdge ? nodes.find((candidate) => candidate.id === inputEdge.sourceId) : null;
                const generatedOutput = inputNode
                  ? resolveGeneratedNodeOutput(inputNode, nodes)
                  : null;
                return generatedOutput?.imageUrl ?? inputNode?.sourceImage?.url ?? inputNode?.imageUrl ?? null;
              })()}
              onUpdateCameraShotSet={onUpdateCameraShotSet}
              onStartConnection={handleConnectionHandlePointerDown}
              onSelectContextMenu={(id, x, y) => {
                setSelectedGroupId(null);
                setMarqueeSelectedNodeIds(null);
                onSelect({ type: "node", id, menu: { x, y } });
              }}
            />
          ) : (
            <CanvasNodeCard
              key={node.id}
              node={node}
              edges={edges}
              selected={selectedNodeIds.includes(node.id) && selectedGroupId !== node.groupId}
              isGenerationTarget={activeGenerationTargetId === node.id}
              showSelectionTools={!isMultiNodeSelection && selectedGroupId === null}
              selectedItem={selectedItem}
              activeTool={activeTool}
              markers={markers}
              addedObjects={addedObjects}
              sketchLines={sketchLines}
              sketchGroups={sketchGroups}
              selectedSketchLineIds={selectedSketchLineIds}
              allNodes={nodes}
              viewportZoom={zoom}
              imageRasterZoom={isWheelZooming ? imageRasterZoom : zoom}
              isConnectionTarget={hoveredConnectionTargetId === node.id}
              onSelect={(id) => {
                setSelectedGroupId(null);
                setMarqueeSelectedNodeIds(null);
                onSelect({ type: "node", id });
              }}
              onStartConnection={handleConnectionHandlePointerDown}
              onSelectOverlay={(item) => {
                setSelectedGroupId(null);
                setMarqueeSelectedNodeIds(null);
                onSelect(item);
              }}
              onAddSketchLine={onAddSketchLine}
              onSelectSketchLine={onSelectSketchLine}
              onSelectSketchGroup={(id) => {
                setSelectedGroupId(null);
                setMarqueeSelectedNodeIds(null);
                onSelectSketchGroup(id);
              }}
              onSelectContextMenu={(id, x, y) => {
                setSelectedGroupId(null);
                setMarqueeSelectedNodeIds(null);
                onSelect({ type: "node", id, menu: { x, y } });
              }}
              onUpdateNode={updateCanvasNode}
              onCommitResize={commitNodeResize}
              onDragStart={(id, event) => {
                setSelectedGroupId(null);
                handleNodePointerDown(id, event);
              }}
              onImageAction={onImageAction}
              onMultiAngle={onMultiAngle}
              onAddObject={onAddObject}
              onTool={onTool}
              onRealityCheck={onRealityCheck}
              onToast={onToast}
              onSetActiveNode={onSetActiveNode}
              onDelete={deleteNode}
              onRunAssistant={onRunAssistantNode}
              onRunImageGenerator={onRunImageGeneratorNode}
              generatorAssetUrls={generatorAssetUrls}
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
              setSelectedGroupId(null);
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

      {isFileDropActive ? (
        <div className="pointer-events-none absolute inset-5 z-[175] grid place-items-center rounded-[20px] border-2 border-dashed border-[var(--canvas-theme-selection)] bg-[var(--canvas-theme-selection-soft)]">
          <p className="rounded-xl bg-[var(--canvas-theme-surface-panel)] px-4 py-2 text-sm font-medium text-[var(--canvas-theme-selection)] shadow-[0_8px_20px_var(--canvas-theme-shadow)]">
            Drop image to add it to the canvas
          </p>
        </div>
      ) : null}

      {activeTool === "cut" && cutCursorPoint ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-[180] text-[var(--canvas-theme-selection)] drop-shadow-[0_1px_1px_rgba(0,0,0,0.18)]"
          style={{
            left: cutCursorPoint.x,
            top: cutCursorPoint.y,
            transform: "translate(-55%, -55%) rotate(-90deg)",
          }}
        >
          <Scissors className="h-5 w-5" strokeWidth={2} />
        </div>
      ) : null}

      {activeTool === "connection" && connectionCursorPoint ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute z-[180] text-[var(--canvas-theme-selection)] drop-shadow-[0_1px_1px_rgba(0,0,0,0.18)]"
          style={{
            left: connectionCursorPoint.x,
            top: connectionCursorPoint.y,
            transform: "translate(-50%, -50%)",
          }}
        >
          <Spline className="h-6 w-6" strokeWidth={2.2} />
        </div>
      ) : null}

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
        <div className="absolute bottom-[72px] right-6 z-40 h-[166px] w-[252px] rounded-[12px] border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)]/92 p-3 shadow-[0_24px_60px_var(--canvas-theme-shadow)] backdrop-blur-xl" data-canvas-ui="true">
          <div
            ref={miniMapFrameRef}
            className="relative h-full w-full overflow-hidden rounded-lg"
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
                  backgroundColor: "var(--canvas-theme-connector)",
                }}
              />
            ))}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute rounded-[3px] border border-[var(--canvas-theme-selection)] bg-[var(--canvas-theme-selection-soft)]/20"
              style={{
                left: miniMapModel.viewportRect.left,
                top: miniMapModel.viewportRect.top,
                width: miniMapModel.viewportRect.width,
                height: miniMapModel.viewportRect.height,
              }}
            />
            <div className="pointer-events-none absolute inset-0" />
          </div>
        </div>
      ) : null}
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

const GROUP_CONNECTION_ROLES: Array<{ label: string; role: ImageConnectionRole }> = [
  { label: "Site / Base", role: "layout_reference" },
  { label: "Sketch / Layout", role: "structure_reference" },
  { label: "Material / Style", role: "material_reference" },
  { label: "Reference", role: "generic_reference" },
];

function GroupConnectionRolePicker({
  x,
  y,
  viewportZoom,
  onSelect,
}: {
  x: number;
  y: number;
  viewportZoom: number;
  onSelect: (role: ImageConnectionRole, label: string) => void;
}) {
  const uiScale = 1 / viewportZoom;

  return (
    <div
      data-canvas-ui="true"
      className="absolute z-[105] flex items-center gap-1 rounded-xl border border-[var(--canvas-theme-border-strong)] bg-[var(--canvas-theme-surface-panel)] p-1.5 shadow-[0_12px_28px_var(--canvas-theme-shadow)]"
      style={{
        left: x,
        top: y - 50 * uiScale,
        transform: `translate(-50%, -100%) scale(${uiScale})`,
        transformOrigin: "bottom center",
      }}
    >
      <span className="px-1 text-[10px] font-semibold text-[var(--canvas-theme-text-muted)]">Use group as</span>
      {GROUP_CONNECTION_ROLES.map((item) => (
        <button
          key={item.role}
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onSelect(item.role, item.label);
          }}
          className="rounded-lg px-2 py-1 text-[11px] font-semibold text-[var(--canvas-theme-text)] transition hover:bg-[var(--canvas-theme-hover)]"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function MultiSelectToolbar({
  x,
  y,
  viewportZoom = 1,
  canGroup,
  canUngroup,
  group,
  onGroup,
  onUngroup,
  onRenameGroup,
  onChangeGroupColor,
  onArrangeGroup,
  onMerge,
  onDownload,
}: {
  x: number;
  y: number;
  viewportZoom?: number;
  canGroup: boolean;
  canUngroup: boolean;
  group: CanvasNodeGroup | null;
  onGroup: () => void;
  onUngroup: () => void;
  onRenameGroup: () => void;
  onChangeGroupColor: (groupId: string, color: CanvasGroupColor) => void;
  onArrangeGroup: (groupId: string, mode: CanvasGroupArrangeMode) => void;
  onMerge: () => void;
  onDownload: () => void;
}) {
  const [openGroupMenu, setOpenGroupMenu] = useState<"color" | "arrange" | null>(null);
  const uiScale = 1 / viewportZoom;
  const actions = [
    ...(canGroup ? [{ label: "Group", icon: Group, onClick: onGroup }] : []),
    ...(!group && canUngroup ? [{ label: "Ungroup", icon: Ungroup, onClick: onUngroup }] : []),
    { label: "Merge", icon: Zap, onClick: onMerge },
    { label: "Download", icon: Download, onClick: onDownload },
  ];

  return (
    <div
      data-canvas-ui="true"
      className="contextual-toolbar absolute z-[100] flex items-center gap-0.5 rounded-xl border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] p-1 shadow-xl shadow-[var(--canvas-theme-shadow)] backdrop-blur"
      style={{
        left: x,
        top: y - 90 * uiScale,
        transform: `translateX(-50%) scale(${uiScale})`,
        transformOrigin: "top center",
      }}
    >
      {group ? (
        <>
          <div className="relative">
            <ContextualToolbarToolButton
              label="Background color"
              aria-expanded={openGroupMenu === "color"}
              hideTooltip={openGroupMenu === "color"}
              onClick={(event) => {
                event.stopPropagation();
                setOpenGroupMenu((current) => current === "color" ? null : "color");
              }}
            >
              <Palette className="h-3.5 w-3.5 text-[var(--canvas-theme-icon-muted)]" aria-hidden="true" />
            </ContextualToolbarToolButton>
            {openGroupMenu === "color" ? (
              <div className="absolute left-0 top-full z-[110] mt-1 flex gap-1 rounded-xl border border-[var(--canvas-theme-border-strong)] bg-[var(--canvas-theme-surface-panel)] p-1.5 shadow-[0_10px_24px_var(--canvas-theme-shadow)]">
                {CANVAS_GROUP_COLOR_OPTIONS.map((color) => (
                  <button
                    key={color.id}
                    type="button"
                    title={color.label}
                    aria-label={`Use ${color.label} group color`}
                    aria-pressed={group.color === color.id}
                    onClick={(event) => {
                      event.stopPropagation();
                      onChangeGroupColor(group.id, color.id);
                      setOpenGroupMenu(null);
                    }}
                    className={`h-5 w-5 rounded-full border-2 transition hover:scale-110 ${group.color === color.id ? "border-[var(--canvas-theme-text)]" : "border-transparent"}`}
                    style={{ backgroundColor: color.accent }}
                  />
                ))}
              </div>
            ) : null}
          </div>

          <div className="relative">
            <ContextualToolbarToolButton
              label="Arrange group"
              aria-expanded={openGroupMenu === "arrange"}
              hideTooltip={openGroupMenu === "arrange"}
              onClick={(event) => {
                event.stopPropagation();
                setOpenGroupMenu((current) => current === "arrange" ? null : "arrange");
              }}
            >
              <Grid3X3 className="h-3.5 w-3.5 text-[var(--canvas-theme-icon-muted)]" aria-hidden="true" />
            </ContextualToolbarToolButton>
            {openGroupMenu === "arrange" ? (
              <div className="absolute left-0 top-full z-[110] mt-1 w-28 rounded-xl border border-[var(--canvas-theme-border-strong)] bg-[var(--canvas-theme-surface-panel)] p-1 shadow-[0_10px_24px_var(--canvas-theme-shadow)]">
                {[
                  { id: "row" as const, label: "Row", icon: Rows3 },
                  { id: "grid" as const, label: "Grid", icon: Grid3X3 },
                  { id: "stack" as const, label: "Stack", icon: Columns3 },
                ].map((arrangement) => {
                  const Icon = arrangement.icon;
                  return (
                    <button
                      key={arrangement.id}
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        onArrangeGroup(group.id, arrangement.id);
                        setOpenGroupMenu(null);
                      }}
                      className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[11px] font-medium text-[var(--canvas-theme-text)] transition hover:bg-[var(--canvas-theme-hover)]"
                    >
                      <Icon className="h-3.5 w-3.5 text-[var(--canvas-theme-icon-muted)]" aria-hidden="true" />
                      {arrangement.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>

          <ContextualToolbarToolButton
            label="Rename group"
            onClick={(event) => {
              event.stopPropagation();
              onRenameGroup();
            }}
          >
            <Pencil className="h-3.5 w-3.5 text-[var(--canvas-theme-icon-muted)]" aria-hidden="true" />
          </ContextualToolbarToolButton>

          <ContextualToolbarToolButton
            label="Ungroup"
            onClick={(event) => {
              event.stopPropagation();
              onUngroup();
            }}
          >
            <Ungroup className="h-3.5 w-3.5 text-[var(--canvas-theme-icon-muted)]" aria-hidden="true" />
          </ContextualToolbarToolButton>
        </>
      ) : null}

      {actions.map((action) => {
        const Icon = action.icon;

        return (
          <ContextualToolbarToolButton
            key={action.label}
            label={action.label}
            onClick={(event) => {
              event.stopPropagation();
              action.onClick();
            }}
          >
            <Icon className="h-3.5 w-3.5 text-[var(--canvas-theme-icon-muted)]" aria-hidden="true" />
          </ContextualToolbarToolButton>
        );
      })}
    </div>
  );
}

function ContextualToolbarToolButton({
  label,
  hideTooltip = false,
  children,
  ...buttonProps
}: {
  label: string;
  hideTooltip?: boolean;
  children: React.ReactNode;
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <div className="group relative">
      <button
        type="button"
        aria-label={label}
        {...buttonProps}
        className="grid h-7 w-7 place-items-center rounded-lg text-[var(--canvas-theme-text)] transition hover:bg-[var(--canvas-theme-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--canvas-theme-selection-ring)]"
      >
        {children}
      </button>
      <span
        className={`pointer-events-none absolute bottom-[calc(100%+7px)] left-1/2 z-[120] -translate-x-1/2 whitespace-nowrap rounded-lg border border-[var(--canvas-theme-border-strong)] bg-[var(--canvas-theme-surface-panel)] px-2 py-1 text-[11px] font-medium text-[var(--canvas-theme-text)] shadow-[0_4px_12px_var(--canvas-theme-shadow)] transition-[opacity,transform] duration-150 ${hideTooltip ? "translate-y-0 opacity-0" : "translate-y-1 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100"}`}
      >
        {label}
      </span>
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

