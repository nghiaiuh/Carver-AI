/*
 * Flow: Renders one interactive canvas workspace component.
 * 1. Receive canvas state and callbacks from the workspace.
 * 2. Render the focused control, overlay, or board UI.
 * 3. Send user actions back up through typed handlers.
 */

"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, CircleDot, Menu, Zap } from "lucide-react";
import type { AddedObject, CanvasNode, CanvasEdge, EditorTool, Marker, Region, SelectedItem, SketchGroup, SketchLine } from "./CanvasWorkspace";
import type { LibraryAsset } from "../types/library";
import BottomToolDock from "./BottomToolDock";
import CanvasNodeCard from "./CanvasNodeCard";
import CanvasEdges from "./CanvasEdges";

type CanvasBoardProps = {
  selectedItem: SelectedItem;
  activeTool: EditorTool;
  gridVisible: boolean;
  markers: Marker[];
  regions: Region[];
  addedObjects: AddedObject[];
  sketchLines: SketchLine[];
  sketchGroups: SketchGroup[];
  selectedSketchLineIds: string[];
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  mockConcepts: string[];
  angleResults: string[];
  onSelect: (item: SelectedItem) => void;
  onImageAction: (xPercent: number, yPercent: number) => void;
  onAddSketchLine: (line: SketchLine) => void;
  onSelectSketchLine: (id: string, additive: boolean) => void;
  onSelectSketchGroup: (id: string) => void;
  onTool: (tool: EditorTool) => void;
  onToggleGrid: () => void;
  onQuickEdit: () => void;
  onMultiAngle: () => void;
  onAddObject: () => void;
  onRealityCheck: () => void;
  onGenerate: () => void;
  onToast: (message: string) => void;
  onNodesChange: (nodes: CanvasNode[] | ((prev: CanvasNode[]) => CanvasNode[])) => void;
  onEdgesChange: (edges: CanvasEdge[] | ((prev: CanvasEdge[]) => CanvasEdge[])) => void;
  activeNodeId: string;
  onSetActiveNode: (id: string) => void;
  canvasThemeColor: string;
  onCanvasThemeChange: (color: string) => void;
  pendingLibraryInsertAsset: LibraryAsset | null;
  onConsumePendingLibraryInsert: () => void;
};

type DeletedNodeSnapshot = {
  node: CanvasNode;
  edges: CanvasEdge[];
};

type Point = {
  x: number;
  y: number;
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

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function getCursorPointRelativeToContainer(event: WheelEvent, container: HTMLElement): Point {
  const rect = container.getBoundingClientRect();

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
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
  clientX,
  clientY,
  container,
  pan,
  zoom,
}: {
  clientX: number;
  clientY: number;
  container: HTMLElement;
  pan: Point;
  zoom: number;
}): Point {
  const rect = container.getBoundingClientRect();

  return {
    x: (clientX - rect.left - pan.x) / zoom,
    y: (clientY - rect.top - pan.y) / zoom,
  };
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
  selectedItem,
  activeTool,
  gridVisible,
  markers,
  regions,
  addedObjects,
  sketchLines,
  sketchGroups,
  selectedSketchLineIds,
  nodes,
  edges,
  mockConcepts,
  angleResults,
  onSelect,
  onImageAction,
  onAddSketchLine,
  onSelectSketchLine,
  onSelectSketchGroup,
  onTool,
  onToggleGrid,
  onQuickEdit,
  onMultiAngle,
  onAddObject,
  onRealityCheck,
  onGenerate,
  onToast,
  onNodesChange,
  onEdgesChange,
  activeNodeId,
  onSetActiveNode,
  canvasThemeColor,
  onCanvasThemeChange,
  pendingLibraryInsertAsset,
  onConsumePendingLibraryInsert,
}: CanvasBoardProps) {
  const containerRef = useRef<HTMLElement>(null);
  const projectMenuRef = useRef<HTMLDivElement>(null);
  const projectNameInputRef = useRef<HTMLInputElement>(null);
  const importImagesInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [viewport, setViewport] = useState<{ zoom: number; pan: Point }>({
    zoom: 1,
    pan: { x: 0, y: 0 },
  });
  const { zoom, pan } = viewport;
  const panStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const isPanning = useRef(false);
  const [isPanningCanvas, setIsPanningCanvas] = useState(false);
  const [isWheelZooming, setIsWheelZooming] = useState(false);
  const wheelZoomTimeout = useRef<number | null>(null);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [projectName, setProjectName] = useState("Untitled");
  const [editingProjectName, setEditingProjectName] = useState(false);
  const [projectNameDraft, setProjectNameDraft] = useState("Untitled");
  const [deletedNodeStack, setDeletedNodeStack] = useState<DeletedNodeSnapshot[]>([]);

  // ── Node Dragging State ───────────────────────────────────────────────────
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const dragStart = useRef<{ x: number; y: number; nodeX: number; nodeY: number } | null>(null);

  // ── Edge Creation State ───────────────────────────────────────────────────
  const [draftEdge, setDraftEdge] = useState<{ sourceId: string; targetX: number; targetY: number } | null>(null);

  const addImageNode = useCallback(
    async (imageUrl: string, title = "Pasted Image", sourceMetadata: ImageSourceMetadata = {}) => {
      const pastePan = pan;
      const pasteZoom = zoom;
      const dimensions = await loadImageDimensions(imageUrl);
      onNodesChange((prev) => {
        const isFirst = prev.length === 0;
        const { width: nodeWidth, height: nodeHeight } = getPastedImageNodeSize(dimensions);
        const rect = containerRef.current?.getBoundingClientRect();
        const viewportCenterX = rect ? rect.width / 2 : 0;
        const viewportCenterY = rect ? rect.height / 2 : 0;
        const pasteWorldCenterX = (viewportCenterX - pastePan.x) / pasteZoom;
        const pasteWorldCenterY = (viewportCenterY - pastePan.y) / pasteZoom;
        const nodeRole = sourceMetadata.role ?? (isFirst ? "layout" : "reference");
        const newNode: CanvasNode = {
          id: `node-${Date.now()}-${prev.length}`,
          x: pasteWorldCenterX - nodeWidth / 2,
          y: pasteWorldCenterY - nodeHeight / 2,
          width: nodeWidth,
          height: nodeHeight,
          scale: 1,
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
        return [...prev, newNode];
      });
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


  // ── Wheel zoom ──────────────────────────────────────────────────────────────
  const handleWheel = useCallback((event: WheelEvent) => {
    event.preventDefault();

    const container = containerRef.current;
    if (!container) return;

    setIsWheelZooming(true);

    if (wheelZoomTimeout.current) {
      window.clearTimeout(wheelZoomTimeout.current);
    }

    wheelZoomTimeout.current = window.setTimeout(() => {
      setIsWheelZooming(false);
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
  }, []);

  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      const isMiddle = event.button === 1;
      const isSpace = (event.nativeEvent as unknown as { _spaceHeld?: boolean })._spaceHeld;
      if (!isMiddle && !isSpace) return;
      event.preventDefault();
      isPanning.current = true;
      setIsPanningCanvas(true);
      panStart.current = { x: event.clientX, y: event.clientY, panX: pan.x, panY: pan.y };
    },
    [pan],
  );

  // ── Node Dragging logic ───────────────────────────────────────────────────
  const handleNodePointerDown = (id: string, event: React.PointerEvent) => {
    const node = nodes.find(n => n.id === id);
    if (!node) return;
    setDraggingNodeId(id);
    dragStart.current = {
      x: event.clientX,
      y: event.clientY,
      nodeX: node.x,
      nodeY: node.y
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  // ── Edge Draft logic ──────────────────────────────────────────────────────
  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (isPanning.current && panStart.current) {
      const start = panStart.current;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      setViewport((prev) => ({ ...prev, pan: { x: start.panX + dx, y: start.panY + dy } }));
      return;
    }

    if (draggingNodeId && dragStart.current) {
      const dx = (event.clientX - dragStart.current.x) / zoom;
      const dy = (event.clientY - dragStart.current.y) / zoom;
      const newX = dragStart.current.nodeX + dx;
      const newY = dragStart.current.nodeY + dy;

      onNodesChange(prev => prev.map(n => n.id === draggingNodeId ? { ...n, x: newX, y: newY } : n));
      return;
    }

    if (draftEdge) {
      const container = containerRef.current;
      if (!container) return;
      const target = getWorldPointFromPointer({
        clientX: event.clientX,
        clientY: event.clientY,
        container,
        pan,
        zoom,
      });
      
      setDraftEdge(prev => prev ? { ...prev, targetX: target.x, targetY: target.y } : null);
    }

  }, [zoom, pan, draggingNodeId, draftEdge, onNodesChange]);

  const handlePointerUp = useCallback((event: React.PointerEvent) => {
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
        const drop = getWorldPointFromPointer({
          clientX: event.clientX,
          clientY: event.clientY,
          container,
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
          const newEdge: CanvasEdge = {
            id: `edge-${Date.now()}`,
            sourceId: draftEdge.sourceId,
            targetId: targetNode.id,
            label: "reference", // default role
          };
          onEdgesChange(prev => [...prev, newEdge]);
          onSelect({ type: "edge", id: newEdge.id });
          onToast("Edge created");
        }
      }
      setDraftEdge(null);
    }
  }, [draftEdge, nodes, zoom, pan, onEdgesChange, onSelect, onToast]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  useEffect(() => {
    return () => {
      if (wheelZoomTimeout.current) window.clearTimeout(wheelZoomTimeout.current);
    };
  }, []);

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
    (nodeId: string) => {
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
      onToast("Image deleted");
    },
    [activeNodeId, edges, nodes, onEdgesChange, onNodesChange, onSelect, onSetActiveNode, onToast],
  );

  const undoDeleteNode = useCallback(() => {
    const snapshot = deletedNodeStack.at(-1);
    if (!snapshot) {
      onToast("Nothing to undo");
      return;
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
  }, [deletedNodeStack, onEdgesChange, onNodesChange, onSelect, onSetActiveNode, onToast]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("textarea,input,[contenteditable='true']")) return;

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        undoDeleteNode();
        return;
      }

      if (event.key !== "Delete" && event.key !== "Backspace") return;
      if (selectedItem.type !== "node") return;
      event.preventDefault();
      deleteNode(selectedItem.id);
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deleteNode, selectedItem, undoDeleteNode]);

  const zoomIn = () => setViewport((prev) => ({ ...prev, zoom: clamp(parseFloat((prev.zoom + ZOOM_STEP).toFixed(2)), MIN_ZOOM, MAX_ZOOM) }));
  const zoomOut = () => setViewport((prev) => ({ ...prev, zoom: clamp(parseFloat((prev.zoom - ZOOM_STEP).toFixed(2)), MIN_ZOOM, MAX_ZOOM) }));
  const resetZoom = () => {
    setViewport({ zoom: 1, pan: { x: 0, y: 0 } });
  };

  return (
    <section
      ref={containerRef}
      className="relative h-full flex-1 touch-none overflow-hidden"
      style={{ backgroundColor: "var(--canvas-theme-canvas)", cursor: isPanningCanvas ? "grabbing" : "default" }}
      onClick={(e) => {
        // Only deselect if clicking on the background
        if (e.target === e.currentTarget) {
          onSelect({ type: "none" });
        }
      }}
      onPointerDown={handleMouseDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <input
        ref={importImagesInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(event) => importImages(event.target.files)}
      />
      <div ref={projectMenuRef} className="absolute left-1.5 top-1.5 z-50">
        <div className="flex h-12 items-center gap-2 rounded-2xl bg-[var(--canvas-theme-surface-soft)] px-3 text-[var(--canvas-theme-text-soft)]">
          <button
            type="button"
            onClick={() => setProjectMenuOpen((value) => !value)}
            className="grid h-8 w-8 place-items-center rounded-full bg-[var(--canvas-theme-active)] text-[var(--canvas-theme-active-text)]"
            title={projectMenuOpen ? "Close menu" : "Open menu"}
            aria-haspopup="menu"
            aria-expanded={projectMenuOpen}
            aria-label={projectMenuOpen ? "Close project menu" : "Open project menu"}
          >
            {projectMenuOpen ? <Menu className="h-4 w-4" aria-hidden="true" /> : <CircleDot className="h-5 w-5" aria-hidden="true" />}
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
              className="w-24 bg-transparent text-base font-semibold tracking-[-0.02em] text-[var(--canvas-theme-text-soft)] outline-none"
              aria-label="Project name"
            />
          ) : (
            <button
              type="button"
              onClick={startEditingProjectName}
              className="max-w-[120px] truncate text-base font-semibold tracking-[-0.02em] text-[var(--canvas-theme-text-soft)]"
              title="Edit project name"
            >
              {projectName}
            </button>
          )}
          <button
            type="button"
            className="grid h-8 w-8 place-items-center rounded-full text-[var(--canvas-theme-icon-muted)] hover:bg-[var(--canvas-theme-hover)]"
            title="Project mode"
            onClick={(event) => {
              event.stopPropagation();
              onToast("Project mode");
            }}
          >
            <span className="relative grid h-5 w-5 place-items-center rounded-full border border-[var(--canvas-theme-border-strong)] text-[10px] font-semibold">
              ◒
            </span>
          </button>
          <ChevronDown className="h-4 w-4 text-[var(--canvas-theme-icon-muted)]" aria-hidden="true" />
        </div>

        {projectMenuOpen ? (
          <div
            role="menu"
            className="mt-3 w-64 overflow-hidden rounded-3xl border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] shadow-2xl shadow-[var(--canvas-theme-shadow)] backdrop-blur"
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
                { label: "Undo", shortcut: "Ctrl+Z", disabled: deletedNodeStack.length === 0, onSelect: undoDeleteNode },
                { label: "Redo", shortcut: "Ctrl+Shift+Z", disabled: true },
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

      <div className="absolute right-4 top-2 z-40 flex h-11 items-center gap-2 rounded-2xl bg-[var(--canvas-theme-surface-soft)] px-3 text-xs font-semibold text-[var(--canvas-theme-text-muted)]">
        <Zap className="h-4 w-4 fill-[var(--canvas-theme-icon)] text-[var(--canvas-theme-icon)]" aria-hidden="true" />
        <span>30</span>
        <button
          type="button"
          className="relative grid h-8 w-8 place-items-center rounded-full bg-[#2F80ED] text-white"
          title="Time credits"
          onClick={(event) => {
            event.stopPropagation();
            onToast("30 credits");
          }}
        >
          <span className="text-sm font-bold">↻</span>
          <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-white" />
        </button>
      </div>

      {/* Zoomable + pannable canvas layer */}
      <div
        className="absolute inset-0"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "0 0",
          willChange: "transform",
          transition: isWheelZooming || isPanningCanvas || draggingNodeId || draftEdge ? "none" : "transform 0.05s linear",
        }}
      >
        <CanvasEdges 
          nodes={nodes} 
          edges={edges} 
          selectedEdgeId={selectedItem.type === "edge" ? selectedItem.id : null}
          onEdgeClick={(id, e) => {
            e.stopPropagation();
            onSelect({ type: "edge", id });
          }}
          draftEdge={draftEdge}
        />

        {nodes.map(node => (
          <CanvasNodeCard
            key={node.id}
            node={node}
            selected={selectedItem.type === "node" && selectedItem.id === node.id}
            selectedItem={selectedItem}
            activeTool={activeTool}
            markers={markers}
            regions={regions}
            addedObjects={addedObjects}
            sketchLines={sketchLines}
            sketchGroups={sketchGroups}
            selectedSketchLineIds={selectedSketchLineIds}
            activeNodeId={activeNodeId}
            viewportZoom={zoom}
            onSelect={(id) => onSelect({ type: "node", id })}
            onSelectOverlay={(item) => onSelect(item)}
            onAddSketchLine={onAddSketchLine}
            onSelectSketchLine={onSelectSketchLine}
            onSelectSketchGroup={(id) => onSelectSketchGroup(id)}
            onSelectContextMenu={(id, x, y) => onSelect({ type: "node", id, menu: { x, y } })}
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
        ))}
      </div>

      <div className="absolute bottom-[72px] left-3 z-40 h-[166px] w-[252px] rounded-xl border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)]">
        <div className="absolute inset-x-5 bottom-4 top-4 border-2 border-[var(--canvas-theme-border-strong)]" style={{ backgroundColor: "var(--canvas-theme-canvas)" }} />
      </div>
      <BottomToolDock
        activeTool={activeTool}
        gridVisible={gridVisible}
        zoom={zoom}
        onTool={onTool}
        onToggleGrid={onToggleGrid}
        onAddObject={onAddObject}
        onGenerate={onGenerate}
        onToast={onToast}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onResetZoom={resetZoom}
        canvasThemeColor={canvasThemeColor}
        onCanvasThemeChange={onCanvasThemeChange}
      />

      {mockConcepts.length > 0 || angleResults.length > 0 ? (
        <div className="output-tray absolute bottom-7 right-7 z-40 flex max-w-[440px] gap-3 overflow-x-auto rounded-3xl border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] p-3 shadow-2xl shadow-[var(--canvas-theme-shadow)] backdrop-blur">
          {[...mockConcepts, ...angleResults].map((item, index) => (
            <div key={`${item}-${index}`} className="output-thumb w-28 shrink-0 overflow-hidden rounded-2xl border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-muted)]">
              <div className="h-20 bg-[linear-gradient(135deg,rgba(109,93,251,.22),#fff_54%,rgba(34,197,94,.16))]" />
              <p className="px-3 py-2 text-xs font-black text-[var(--canvas-theme-text)]">{item}</p>
            </div>
          ))}
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
              "flex w-full items-center justify-between gap-4 px-5 py-2.5 text-left text-sm",
              item.disabled
                ? "cursor-not-allowed text-[var(--canvas-theme-text-muted)] opacity-45"
                : "text-[var(--canvas-theme-text)] hover:bg-[var(--canvas-theme-hover)]",
              item.tone === "danger" && !item.disabled ? "text-[#B42318]" : "",
            ].join(" ")}
          >
            <span className="font-medium">{item.label}</span>
            {item.shortcut ? (
              <span className="text-xs font-semibold text-[var(--canvas-theme-text-muted)]">{item.shortcut}</span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}
