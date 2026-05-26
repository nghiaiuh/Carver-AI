"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AddedObject, EditorTool, Marker, Region, SelectedItem } from "./CanvasWorkspace";
import BottomToolDock from "./BottomToolDock";
import MiniMap from "./MiniMap";
import SelectableImage from "./SelectableImage";

type CanvasBoardProps = {
  selectedItem: SelectedItem;
  activeTool: EditorTool;
  gridVisible: boolean;
  markers: Marker[];
  regions: Region[];
  addedObjects: AddedObject[];
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
}: CanvasBoardProps) {
  const containerRef = useRef<HTMLElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panStart = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const isPanning = useRef(false);

  // ── Wheel zoom ──────────────────────────────────────────────────────────────
  // PAN_DAMPING: 0 = zoom tại centre, 1 = zoom chính xác tại con trỏ
  const PAN_DAMPING = 0.3;

  const handleWheel = useCallback((event: WheelEvent) => {
    event.preventDefault();

    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();

    // Cursor position relative to container centre (in canvas space)
    const cursorX = (event.clientX - rect.left - rect.width / 2) * PAN_DAMPING;
    const cursorY = (event.clientY - rect.top - rect.height / 2) * PAN_DAMPING;

    setZoom((prev) => {
      const delta = event.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
      const next = clamp(prev + delta, MIN_ZOOM, MAX_ZOOM);
      const ratio = next / prev - 1;
      // Shift pan so the point under cursor stays fixed (damped)
      setPan((p) => ({
        x: p.x - cursorX * ratio,
        y: p.y - cursorY * ratio,
      }));
      return next;
    });
  }, []);

  // ── Middle-button / Space drag pan ────────────────────────────────────────
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

  const handleMouseMove = useCallback((event: React.MouseEvent<HTMLElement>) => {
    if (!isPanning.current || !panStart.current) return;
    const dx = event.clientX - panStart.current.x;
    const dy = event.clientY - panStart.current.y;
    setPan({ x: panStart.current.panX + dx, y: panStart.current.panY + dy });
  }, []);

  const handleMouseUp = useCallback(() => {
    isPanning.current = false;
    panStart.current = null;
  }, []);

  // Register wheel listener (needs passive:false to preventDefault)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // ── Zoom controls ─────────────────────────────────────────────────────────
  const zoomIn = () =>
    setZoom((prev) => clamp(parseFloat((prev + ZOOM_STEP).toFixed(2)), MIN_ZOOM, MAX_ZOOM));
  const zoomOut = () =>
    setZoom((prev) => clamp(parseFloat((prev - ZOOM_STEP).toFixed(2)), MIN_ZOOM, MAX_ZOOM));
  const resetZoom = () => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  return (
    <section
      ref={containerRef}
      className="relative h-full flex-1 overflow-hidden bg-[#F7F8FA]"
      style={{ cursor: isPanning.current ? "grabbing" : "default" }}
      onClick={() => onSelect({ type: "none" })}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {gridVisible ? <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(#E5E7EB_1px,transparent_1px),linear-gradient(90deg,#E5E7EB_1px,transparent_1px)] bg-[size:32px_32px] opacity-55" /> : null}
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
          transition: isPanning.current ? "none" : "transform 0.05s linear",
        }}
      >
        <SelectableImage
          selectedItem={selectedItem}
          activeTool={activeTool}
          markers={markers}
          regions={regions}
          addedObjects={addedObjects}
          onSelect={onSelect}
          onImageAction={onImageAction}
          onQuickEdit={onQuickEdit}
          onMultiAngle={onMultiAngle}
          onAddObject={onAddObject}
          onTool={onTool}
          onRealityCheck={onRealityCheck}
          onToast={onToast}
        />
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
