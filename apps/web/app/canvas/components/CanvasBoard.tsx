"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import type { AddedObject, CanvasNode, CanvasEdge, EditorTool, Marker, Region, SelectedItem } from "./CanvasWorkspace";
import BottomToolDock from "./BottomToolDock";
import MiniMap from "./MiniMap";
import CanvasNodeCard from "./CanvasNodeCard";
import CanvasEdges from "./CanvasEdges";

type CanvasBoardProps = {
  selectedItem: SelectedItem;
  activeTool: EditorTool;
  gridVisible: boolean;
  markers: Marker[];
  regions: Region[];
  addedObjects: AddedObject[];
  nodes: CanvasNode[];
  edges: CanvasEdge[];
  mockConcepts: string[];
  angleResults: string[];
  onSelect: (item: SelectedItem) => void;
  onImageAction: (xPercent: number, yPercent: number) => void;
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
};

const MIN_ZOOM = 0.2;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.1;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export default function CanvasBoard({
  selectedItem,
  activeTool,
  gridVisible,
  markers,
  regions,
  addedObjects,
  nodes,
  edges,
  mockConcepts,
  angleResults,
  onSelect,
  onImageAction,
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
}: CanvasBoardProps) {
  const containerRef = useRef<HTMLElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const isPanning = useRef(false);

  // ── Node Dragging State ───────────────────────────────────────────────────
  const [draggingNodeId, setDraggingNodeId] = useState<string | null>(null);
  const dragStart = useRef<{ x: number; y: number; nodeX: number; nodeY: number } | null>(null);

  // ── Edge Creation State ───────────────────────────────────────────────────
  const [draftEdge, setDraftEdge] = useState<{ sourceId: string; targetX: number; targetY: number } | null>(null);

  // ── Paste Logic ───────────────────────────────────────────────────────────
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf("image") !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            const url = URL.createObjectURL(blob);
            onNodesChange((prev) => {
              const isFirst = prev.length === 0;
              const newNode: CanvasNode = {
                id: `node-${Date.now()}`,
                // Paste in the center of the current view
                x: -pan.x / zoom,
                y: -pan.y / zoom,
                width: 240,
                height: 180,
                imageUrl: url,
                title: isFirst ? "Site Photo" : "Pasted Image",
                prompt: null,
                role: isFirst ? "layout" : "reference",
              };
              return [...prev, newNode];
            });
            onToast("Image pasted");
          }
          break; // only handle one image paste for now
        }
      }
    };

    window.addEventListener("paste", handlePaste);
    return () => window.removeEventListener("paste", handlePaste);
  }, [pan, zoom, onNodesChange, onToast]);


  // ── Wheel zoom ──────────────────────────────────────────────────────────────
  const PAN_DAMPING = 0.3;

  const handleWheel = useCallback((event: WheelEvent) => {
    event.preventDefault();

    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();

    const cursorX = (event.clientX - rect.left - rect.width / 2) * PAN_DAMPING;
    const cursorY = (event.clientY - rect.top - rect.height / 2) * PAN_DAMPING;

    setZoom((prev) => {
      const delta = event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
      const next = clamp(prev + delta, MIN_ZOOM, MAX_ZOOM);
      const ratio = next / prev - 1;
      setPan((p) => ({
        x: p.x - cursorX * ratio,
        y: p.y - cursorY * ratio,
      }));
      return next;
    });
  }, []);

  const handleMouseDown = useCallback(
    (event: React.MouseEvent<HTMLElement>) => {
      const isMiddle = event.button === 1;
      const isSpace = (event.nativeEvent as unknown as { _spaceHeld?: boolean })._spaceHeld;
      if (!isMiddle && !isSpace) return;
      event.preventDefault();
      isPanning.current = true;
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
  const handleEdgePointerDown = (sourceId: string, event: React.PointerEvent) => {
    event.stopPropagation();
    const container = containerRef.current;
    if (!container) return;
    
    // Calculate position in canvas space
    const rect = container.getBoundingClientRect();
    const targetX = (event.clientX - rect.left - pan.x - rect.width / 2) / zoom;
    const targetY = (event.clientY - rect.top - pan.y - rect.height / 2) / zoom;

    setDraftEdge({ sourceId, targetX, targetY });
    event.currentTarget.setPointerCapture(event.pointerId);
  };


  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLElement>) => {
    if (isPanning.current && panStart.current) {
      const dx = event.clientX - panStart.current.x;
      const dy = event.clientY - panStart.current.y;
      setPan({ x: panStart.current.panX + dx, y: panStart.current.panY + dy });
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
      const rect = container.getBoundingClientRect();
      const targetX = (event.clientX - rect.left - pan.x - rect.width / 2) / zoom;
      const targetY = (event.clientY - rect.top - pan.y - rect.height / 2) / zoom;
      
      setDraftEdge(prev => prev ? { ...prev, targetX, targetY } : null);
    }

  }, [zoom, pan, draggingNodeId, draftEdge, onNodesChange]);

  const handlePointerUp = useCallback((event: React.PointerEvent) => {
    isPanning.current = false;
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
        const rect = container.getBoundingClientRect();
        const dropX = (event.clientX - rect.left - pan.x - rect.width / 2) / zoom;
        const dropY = (event.clientY - rect.top - pan.y - rect.height / 2) / zoom;

        // Check if drop is inside any node
        const targetNode = nodes.find(n => 
          n.id !== draftEdge.sourceId &&
          dropX >= n.x && dropX <= n.x + n.width &&
          dropY >= n.y && dropY <= n.y + n.height
        );

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

  const zoomIn = () => setZoom((prev) => clamp(parseFloat((prev + ZOOM_STEP).toFixed(2)), MIN_ZOOM, MAX_ZOOM));
  const zoomOut = () => setZoom((prev) => clamp(parseFloat((prev - ZOOM_STEP).toFixed(2)), MIN_ZOOM, MAX_ZOOM));
  const resetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <section
      ref={containerRef}
      className="relative h-full flex-1 overflow-hidden bg-[#F5F5F4] touch-none"
      style={{ cursor: isPanning.current ? "grabbing" : "default" }}
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
      <div className="absolute left-6 top-5 z-40 rounded-full border border-[#E5E7EB] bg-white/85 px-3 py-2 text-xs font-black text-[#667085] shadow-sm backdrop-blur">
        {activeTool === "select" ? "Select an image or object" : `Active: ${activeTool.replaceAll("-", " ")}`}
      </div>

      {/* Zoomable + pannable canvas layer */}
      <div
        className="absolute inset-0 flex items-center justify-center"
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          transformOrigin: "center center",
          willChange: "transform",
          transition: isPanning.current || draggingNodeId || draftEdge ? "none" : "transform 0.05s linear",
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
            activeNodeId={activeNodeId}
            onSelect={(id, e) => onSelect({ type: "node", id })}
            onSelectOverlay={(item) => onSelect(item)}
            onSelectContextMenu={(id, x, y) => onSelect({ type: "node", id, menu: { x, y } })}
            onDragStart={handleNodePointerDown}
            onHandlePointerDown={handleEdgePointerDown}
            onImageAction={onImageAction}
            onQuickEdit={onQuickEdit}
            onMultiAngle={onMultiAngle}
            onAddObject={onAddObject}
            onTool={onTool}
            onRealityCheck={onRealityCheck}
            onToast={onToast}
            onSetActiveNode={onSetActiveNode}
          />
        ))}
      </div>

      <MiniMap zoom={zoom} onZoomIn={zoomIn} onZoomOut={zoomOut} onResetZoom={resetZoom} />
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
      />

      {mockConcepts.length > 0 || angleResults.length > 0 ? (
        <div className="output-tray absolute bottom-7 right-7 z-40 flex max-w-[440px] gap-3 overflow-x-auto rounded-3xl border border-[#E5E7EB] bg-white/95 p-3 shadow-2xl shadow-black/12 backdrop-blur">
          {[...mockConcepts, ...angleResults].map((item, index) => (
            <div key={`${item}-${index}`} className="output-thumb w-28 shrink-0 overflow-hidden rounded-2xl border border-[#E5E7EB] bg-[#F7F8FA]">
              <div className="h-20 bg-[linear-gradient(135deg,rgba(109,93,251,.22),#fff_54%,rgba(34,197,94,.16))]" />
              <p className="px-3 py-2 text-xs font-black text-[#111827]">{item}</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
