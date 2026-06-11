/*
 * Flow: Renders one interactive canvas workspace component.
 * 1. Receive canvas state and callbacks from the workspace.
 * 2. Render the focused control, overlay, or board UI.
 * 3. Send user actions back up through typed handlers.
 */

"use client";

import React, { useEffect, useRef, useState } from "react";
import type { AddedObject, CanvasNode, EditorTool, Marker, Region, SelectedItem, SketchGroup, SketchLine } from "./CanvasWorkspace";
import { ImagePlus, Copy, Trash2, RefreshCw, Sparkles } from "lucide-react";
import ContextualToolbar from "../widgets/ContextualToolbar";
import FloatingQuickPanel from "../widgets/FloatingQuickPanel";
import MarkerPin from "../widgets/MarkerPin";
import RegionOverlay from "../widgets/RegionOverlay";
import SketchLayer from "../widgets/SketchLayer";

const DEFAULT_DEVICE_PIXEL_RATIO = 1;

function getDevicePixelRatio() {
  if (typeof window === "undefined") return DEFAULT_DEVICE_PIXEL_RATIO;
  return Math.max(window.devicePixelRatio || DEFAULT_DEVICE_PIXEL_RATIO, DEFAULT_DEVICE_PIXEL_RATIO);
}

function getContainedRect({
  sourceWidth,
  sourceHeight,
  targetWidth,
  targetHeight,
}: {
  sourceWidth: number;
  sourceHeight: number;
  targetWidth: number;
  targetHeight: number;
}) {
  const sourceRatio = sourceWidth / sourceHeight;
  const targetRatio = targetWidth / targetHeight;

  if (sourceRatio > targetRatio) {
    const height = targetWidth / sourceRatio;
    return {
      x: 0,
      y: (targetHeight - height) / 2,
      width: targetWidth,
      height,
    };
  }

  const width = targetHeight * sourceRatio;
  return {
    x: (targetWidth - width) / 2,
    y: 0,
    width,
    height: targetHeight,
  };
}

type CanvasNodeCardProps = {
  node: CanvasNode;
  selected: boolean;
  showSelectionTools?: boolean;
  selectedItem: SelectedItem;
  activeTool: EditorTool;
  markers: Marker[];
  regions: Region[];
  addedObjects: AddedObject[];
  sketchLines: SketchLine[];
  sketchGroups: SketchGroup[];
  selectedSketchLineIds: string[];
  activeNodeId: string;
  viewportZoom: number;
  onSelect: (id: string, event?: React.MouseEvent) => void;
  onSelectOverlay: (item: SelectedItem) => void;
  onAddSketchLine: (line: SketchLine) => void;
  onSelectSketchLine: (id: string, additive: boolean) => void;
  onSelectSketchGroup: (id: string) => void;
  onSelectContextMenu: (id: string, x: number, y: number) => void;
  onDragStart: (id: string, e: React.PointerEvent) => void;
  onImageAction: (xPercent: number, yPercent: number) => void;
  onQuickEdit: () => void;
  onMultiAngle: () => void;
  onAddObject: () => void;
  onTool: (tool: EditorTool) => void;
  onRealityCheck: () => void;
  onToast: (message: string) => void;
  onSetActiveNode: (id: string) => void;
  onDelete: (id: string) => void;
};

export default function CanvasNodeCard({
  node,
  selected,
  showSelectionTools = true,
  selectedItem,
  activeTool,
  markers,
  regions,
  addedObjects,
  sketchLines,
  sketchGroups,
  selectedSketchLineIds,
  activeNodeId,
  viewportZoom,
  onSelect,
  onSelectOverlay,
  onAddSketchLine,
  onSelectSketchLine,
  onSelectSketchGroup,
  onSelectContextMenu,
  onDragStart,
  onImageAction,
  onQuickEdit,
  onMultiAngle,
  onAddObject,
  onTool,
  onRealityCheck,
  onToast,
  onSetActiveNode,
  onDelete,
}: CanvasNodeCardProps) {
  const isOutput = node.role === "output";
  const isActiveNode = node.id === activeNodeId;
  const uiScale = 1 / viewportZoom;
  const objectScale = node.scale ?? 1;
  const displayWidth = node.width * objectScale;
  const displayHeight = node.height * objectScale;

  return (
    <div
      data-canvas-node-id={node.id}
      className="absolute select-none bg-transparent group"
      style={{
        left: node.x,
        top: node.y,
        width: displayWidth,
        zIndex: selected ? 80 : 10,
      }}
      onPointerDown={(e) => {
        // Prevent pan behavior on canvas when clicking node
        e.stopPropagation();
        onSelect(node.id, e);
        onDragStart(node.id, e);
      }}
      onDoubleClick={(event) => {
        event.stopPropagation();
        onQuickEdit();
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSelectContextMenu(node.id, event.clientX, event.clientY);
      }}
    >
      <div>
        <div 
          className={[
            "relative overflow-hidden rounded-xl border bg-[#F7F8FA] transition-colors",
            selected ? "border-[#3B82F6] ring-4 ring-[#3B82F6]/15" : "border-transparent",
          ].join(" ")}
          style={{ height: displayHeight }}
          onClick={(e) => {
            if (activeTool === "mark-position" || activeTool === "draw-region" || activeTool === "lock-area") {
              e.stopPropagation();
              onSetActiveNode(node.id);
              const rect = e.currentTarget.getBoundingClientRect();
              const x = ((e.clientX - rect.left) / rect.width) * 100;
              const y = ((e.clientY - rect.top) / rect.height) * 100;
              onImageAction(x, y);
            }
          }}
        >
          {node.imageUrl ? (
            <AdaptiveImageRenderer
              imageUrl={node.sourceImage?.url ?? node.imageUrl}
              title={node.title}
              displayWidth={displayWidth}
              displayHeight={displayHeight}
              viewportZoom={viewportZoom}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[#9CA3AF]">
              <ImagePlus className="w-8 h-8 opacity-50" />
            </div>
          )}
          
          <div className="absolute inset-0 bg-gradient-to-t from-black/10 via-transparent to-white/5 pointer-events-none" />

          {/* Overlays (Render only on active node, mimicking SelectableImage behavior) */}
          {isActiveNode && (
            <div 
              className="absolute inset-0 z-20" 
              onPointerDown={(e) => e.stopPropagation()}
            >
              {regions.map((region) => (
                <RegionOverlay
                  key={region.id}
                  region={region}
                  selected={selectedItem.type === "region" && selectedItem.id === region.id}
                  onSelect={() => onSelectOverlay({ type: "region", id: region.id })}
                />
              ))}
              {markers.map((marker) => (
                <MarkerPin
                  key={marker.id}
                  marker={marker}
                  selected={selectedItem.type === "marker" && selectedItem.id === marker.id}
                  onSelect={() => onSelectOverlay({ type: "marker", id: marker.id })}
                />
              ))}
              {addedObjects.map((object) => (
                <ObjectBox 
                  key={object.id} 
                  object={object} 
                  selected={selectedItem.type === "object" && selectedItem.id === object.id} 
                  onSelect={() => onSelectOverlay({ type: "object", id: object.id })} 
                />
              ))}
              <SketchLayer
                activeTool={activeTool}
                selectedItem={selectedItem}
                sketchLines={sketchLines}
                sketchGroups={sketchGroups}
                selectedSketchLineIds={selectedSketchLineIds}
                onAddLine={onAddSketchLine}
                onSelectLine={onSelectSketchLine}
                onSelectGroup={onSelectSketchGroup}
              />
            </div>
          )}
          {selected ? <SelectionChrome label={node.role === "output" ? "Image" : "Reference"} size={`${Math.round(displayWidth)} × ${Math.round(displayHeight)}`} viewportZoom={viewportZoom} /> : null}
        </div>
        
        <div
          className="px-1 pb-1 text-center"
          style={{
            marginTop: `${12 * uiScale}px`,
            transform: `scale(${uiScale})`,
            transformOrigin: "top center",
          }}
        >
          <h3 className="text-sm font-black text-[var(--canvas-theme-text)]">{node.title}</h3>
          {isOutput ? (
            <div className="mt-1">
              <p className="line-clamp-2 text-center text-xs leading-snug text-[var(--canvas-theme-text-muted)]" title={node.prompt || ""}>
                {node.prompt || "No prompt provided."}
              </p>
            </div>
          ) : (
            <div className="mt-1">
              <p className="text-center text-xs italic text-[var(--canvas-theme-text-muted)]">
                {node.prompt ? node.prompt : "No prompt yet"}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Selection Chrome & Toolbars (Show only when this node card is selected) */}
      {selected && showSelectionTools ? (
        <div className="absolute inset-0 z-[120] pointer-events-none" onPointerDown={(e) => e.stopPropagation()}>
          <div className="pointer-events-auto">
          <ContextualToolbar
            itemLabel={node.role === "output" ? "Image" : node.role === "reference" ? "Reference" : "Object"}
            viewportZoom={viewportZoom}
            onQuickEdit={onQuickEdit}
            onMultiAngle={onMultiAngle}
            onAddObject={onAddObject}
            onTool={onTool}
            onToast={onToast}
          />
          <FloatingQuickPanel 
            viewportZoom={viewportZoom}
            onTool={onTool} 
            onMultiAngle={onMultiAngle} 
            onRealityCheck={onRealityCheck} 
            onToast={onToast} 
          />
          </div>
        </div>
      ) : null}

      {/* Context Menu */}
      {selected && selectedItem.type === "node" && selectedItem.menu ? (
        <div onPointerDown={(e) => e.stopPropagation()}>
          <ContextMenu x={selectedItem.menu.x} y={selectedItem.menu.y} onToast={onToast} onDelete={() => onDelete(node.id)} />
        </div>
      ) : null}
    </div>
  );
}

function AdaptiveImageRenderer({
  imageUrl,
  title,
  displayWidth,
  displayHeight,
  viewportZoom,
}: {
  imageUrl: string;
  title: string;
  displayWidth: number;
  displayHeight: number;
  viewportZoom: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [renderedUrl, setRenderedUrl] = useState<string | null>(null);
  const ready = renderedUrl === imageUrl;

  useEffect(() => {
    let cancelled = false;

    const image = new window.Image();
    image.decoding = "async";
    image.onload = () => {
      if (cancelled) return;
      imageRef.current = image;
      setRenderedUrl(imageUrl);
    };
    image.onerror = () => {
      if (cancelled) return;
      imageRef.current = null;
    };
    image.src = imageUrl;

    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    if (!canvas || !image || !ready || displayWidth <= 0 || displayHeight <= 0) return;

    const rasterScale = Math.max(viewportZoom * getDevicePixelRatio(), DEFAULT_DEVICE_PIXEL_RATIO);
    const rasterWidth = Math.max(1, Math.ceil(displayWidth * rasterScale));
    const rasterHeight = Math.max(1, Math.ceil(displayHeight * rasterScale));

    if (canvas.width !== rasterWidth) canvas.width = rasterWidth;
    if (canvas.height !== rasterHeight) canvas.height = rasterHeight;

    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;

    context.clearRect(0, 0, rasterWidth, rasterHeight);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";

    const rect = getContainedRect({
      sourceWidth: image.naturalWidth,
      sourceHeight: image.naturalHeight,
      targetWidth: rasterWidth,
      targetHeight: rasterHeight,
    });

    context.drawImage(image, rect.x, rect.y, rect.width, rect.height);
  }, [displayHeight, displayWidth, ready, viewportZoom]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="h-full w-full select-none pointer-events-none"
        aria-label={title}
        role="img"
      />
      {!ready ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={imageUrl} alt={title} className="absolute inset-0 h-full w-full select-none object-contain pointer-events-none" draggable={false} decoding="async" />
      ) : null}
    </>
  );
}

function SelectionChrome({ label, size, viewportZoom }: { label: string; size: string; viewportZoom: number }) {
  const uiScale = 1 / viewportZoom;

  return (
    <>
      <div
        className="absolute z-30 rounded-lg bg-[#3B82F6] px-2.5 py-1 text-xs font-black text-white"
        style={{ left: `${-4 * uiScale}px`, top: `${-34 * uiScale}px`, transform: `scale(${uiScale})`, transformOrigin: "top left" }}
      >
        {label}
      </div>
      <div
        className="absolute z-30 rounded-lg border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] px-2.5 py-1 text-xs font-black text-[var(--canvas-theme-text-muted)] shadow-sm"
        style={{ right: `${-4 * uiScale}px`, bottom: `${-32 * uiScale}px`, transform: `scale(${uiScale})`, transformOrigin: "bottom right" }}
      >
        {size}
      </div>
    </>
  );
}

function ObjectBox({ object, selected, onSelect }: { object: AddedObject; selected: boolean; onSelect: () => void }) {
  return (
    <button
      className={`added-object absolute z-30 rounded-2xl border bg-white/85 text-center shadow-xl transition ${
        selected ? "border-[#3B82F6] ring-4 ring-[#3B82F6]/15" : "border-[#22C55E]"
      }`}
      style={{ left: `${object.x}%`, top: `${object.y}%`, width: `${object.w}%`, height: `${object.h}%`, transform: `rotate(${object.rotation}deg)` }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      <span className="grid h-full place-items-center rounded-2xl bg-[#ECFDF3]/80 px-3 text-xs font-black text-[#111827]">{object.label}</span>
      {selected ? (
        <>
          <span className="absolute -right-3 -top-8 grid h-7 w-7 place-items-center rounded-full bg-[#111827] text-white shadow-lg">↻</span>
          <span className="absolute -bottom-2 -right-2 h-5 w-5 rounded-full border-2 border-[#3B82F6] bg-white" />
        </>
      ) : null}
    </button>
  );
}

function ContextMenu({ x, y, onToast, onDelete }: { x: number; y: number; onToast: (message: string) => void; onDelete: () => void }) {
  const items = [
    ["Duplicate", Copy],
    ["Replace image", ImagePlus],
    ["Use as layout source", RefreshCw],
    ["Use as style reference", Sparkles],
    ["Generate similar concept", Sparkles],
    ["Remove", Trash2],
  ] as const;

  return (
    <div className="fixed z-[90] w-56 rounded-2xl border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] p-2 shadow-2xl shadow-[var(--canvas-theme-shadow)] backdrop-blur" style={{ left: x, top: y }}>
      {items.map(([label, Icon]) => (
        <button
          key={label}
          onClick={(event) => {
            event.stopPropagation();
            if (label === "Remove") {
              onDelete();
              return;
            }
            onToast(`${label} mock`);
          }}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left text-sm font-bold text-[var(--canvas-theme-text)] hover:bg-[var(--canvas-theme-hover)]"
        >
          <Icon className="h-4 w-4 text-[var(--canvas-theme-icon-muted)]" aria-hidden="true" />
          {label}
        </button>
      ))}
    </div>
  );
}
