/*
 * CanvasNodeCard
 * Renders a single draggable image node on the canvas.
 * Receives all state and callbacks from CanvasBoard – no internal state except rendering.
 */

"use client";

import React, { useEffect, useRef, useState } from "react";
import type { AddedObject, CanvasEdge, CanvasNode, EditorTool, InputPort, Marker, SelectedItem, SketchGroup, SketchLine } from "../../types/canvas";
import { getVisibleInputPorts, getDefaultInputPorts } from "../../types/canvas";
import { Image as ImageIcon, ImagePlus, Copy, Trash2, RefreshCw, Sparkles } from "lucide-react";
import ContextualToolbar from "../widgets/ContextualToolbar";
import FloatingQuickPanel from "../widgets/FloatingQuickPanel";
import MarkerPin from "../widgets/MarkerPin";
import SketchLayer from "../widgets/SketchLayer";
import { INPUT_PORT_HANDLE_CENTER_OFFSET, INPUT_PORT_GAP, type ImageHandlePosition } from "./imageGraph";

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
  edges: CanvasEdge[];
  selected: boolean;
  showSelectionTools?: boolean;
  selectedItem: SelectedItem;
  activeTool: EditorTool;
  markers: Marker[];
  addedObjects: AddedObject[];
  sketchLines: SketchLine[];
  sketchGroups: SketchGroup[];
  selectedSketchLineIds: string[];
  activeNodeId: string;
  viewportZoom: number;
  isConnectionTarget?: boolean;
  /** Port ID currently hovered during a draft edge drag */
  hoveredPortId?: string | null;
  /** Port ID where a replace/cancel popover is showing */
  pendingReplacePortId?: string | null;
  onSelect: (id: string, event?: React.MouseEvent | React.PointerEvent) => void;
  onStartConnection: (nodeId: string, handle: ImageHandlePosition, event: React.PointerEvent<HTMLButtonElement>) => void;
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
  /** Called when user confirms "Replace" on an occupied port (Q3) */
  onRequestPortReplace?: (portId: string) => void;
  /** Called when user cancels the replace popover */
  onCancelPortReplace?: () => void;
};

export default function CanvasNodeCard({
  node,
  edges,
  selected,
  showSelectionTools = true,
  selectedItem,
  activeTool,
  markers,
  addedObjects,
  sketchLines,
  sketchGroups,
  selectedSketchLineIds,
  activeNodeId,
  viewportZoom,
  isConnectionTarget = false,
  hoveredPortId,
  pendingReplacePortId,
  onSelect,
  onStartConnection,
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
  onRequestPortReplace,
  onCancelPortReplace,
}: CanvasNodeCardProps) {
  const isOutput = node.role === "output";
  const isActiveNode = node.id === activeNodeId;
  const uiScale = 1 / viewportZoom;
  const objectScale = node.scale ?? 1;
  const displayWidth = node.width * objectScale;
  const displayHeight = node.height * objectScale;

  // Port rendering (Q1: dynamic — connected + 1 empty slot)
  const nodePorts = node.inputPorts || getDefaultInputPorts();
  const visiblePorts = getVisibleInputPorts(nodePorts, edges, node.id);
  const connectedPortIds = new Set(
    edges.filter((e) => e.targetId === node.id).map((e) => e.targetPortId),
  );

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
        // Prevent canvas pan and suppress browser text-selection on header/toolbar
        // elements that visually overlap when the user drags this node.
        e.preventDefault();
        e.stopPropagation();
        onSelect(node.id, e);
        if (activeTool !== "region") {
          onDragStart(node.id, e);
        }
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
        <div className="relative">
          <div
            className={[
              "relative overflow-hidden rounded-xl border bg-[#F7F8FA] transition-colors",
              selected
                ? "border-[#22D3EE] ring-4 ring-[#22D3EE]/15"
                : isConnectionTarget
                  ? "border-[#22D3EE] ring-4 ring-[#22D3EE]/10"
                  : "border-transparent",
            ].join(" ")}
            style={{ height: displayHeight }}
            onClick={(e) => {
              if (
                activeTool === "mark-position"
              ) {
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

            {/* Overlays: only rendered on the active node */}
            {isActiveNode && (
              <div
                className="absolute inset-0 z-20"
                onPointerDown={(e) => e.stopPropagation()}
              >

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

            {selected ? (
              <SelectionChrome
                label={node.role === "output" ? "Image" : "Reference"}
                size={`${Math.round(displayWidth)} × ${Math.round(displayHeight)}`}
                viewportZoom={viewportZoom}
              />
            ) : null}

            {(node.regionMask?.selectionRatio && activeTool !== "region") ? (
              <div className="absolute top-2 right-2 z-40 flex items-center gap-1.5 rounded-lg bg-[#111827]/80 px-2.5 py-1.5 backdrop-blur-md text-white shadow-[0_4px_12px_rgba(0,0,0,0.15)] ring-1 ring-white/10 transition-opacity">
                <span className="text-[10px] font-bold tracking-widest uppercase text-[#22D3EE]">
                  🎨 Mask Active {Math.round(node.regionMask.selectionRatio * 100)}%
                </span>
              </div>
            ) : null}
          </div>

          {/* Left side: dynamic input ports, ordered by image index */}
          {visiblePorts.map((port, visibleIndex) => {
            const isConnected = connectedPortIds.has(port.id);
            const isHovered = hoveredPortId === port.id;
            const isPendingReplace = pendingReplacePortId === port.id;
            const isMaxReached = visiblePorts.length === nodePorts.length && !isConnected;
            const totalVisible = visiblePorts.length;

            let topPx = displayHeight / 2;
            if (totalVisible > 1) {
              const clusterHeight = (totalVisible - 1) * INPUT_PORT_GAP;
              const startY = (displayHeight / 2) - (clusterHeight / 2);
              topPx = startY + visibleIndex * INPUT_PORT_GAP;
            }

            return (
              <div
                key={port.id}
                className="absolute z-[150]"
                style={{
                  left: `${-(INPUT_PORT_HANDLE_CENTER_OFFSET + 16)}px`,
                  top: `${topPx}px`,
                  transform: "translateY(-50%)",
                }}
              >
                <InputPortHandle
                  port={port}
                  isConnected={isConnected}
                  isHovered={isHovered}
                  isPendingReplace={isPendingReplace}
                  isMaxReached={isMaxReached}
                  isNodeActive={selected || isConnectionTarget}
                  onPointerDown={(event) => onStartConnection(node.id, "left", event)}
                />
                {isPendingReplace && onRequestPortReplace && onCancelPortReplace ? (
                  <ReplacePortPopover
                    viewportZoom={viewportZoom}
                    onReplace={() => onRequestPortReplace(port.id)}
                    onCancel={onCancelPortReplace}
                  />
                ) : null}
              </div>
            );
          })}

          {/* Right side: single output handle (unchanged) */}
          <ImageNodeHandle
            side="right"
            active={selected || isConnectionTarget}
            onPointerDown={(event) => onStartConnection(node.id, "right", event)}
          />
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
              <p
                className="line-clamp-2 text-center text-xs leading-snug text-[var(--canvas-theme-text-muted)]"
                title={node.prompt || ""}
              >
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

      {/* Selection toolbars */}
      {selected && showSelectionTools ? (
        <div
          className="absolute inset-0 z-[120] pointer-events-none"
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div className="pointer-events-auto">
            <ContextualToolbar
              itemLabel={
                node.role === "output"
                  ? "Image"
                  : node.role === "reference"
                    ? "Reference"
                    : "Object"
              }
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

      {/* Context menu */}
      {selected && selectedItem.type === "node" && selectedItem.menu ? (
        <div onPointerDown={(e) => e.stopPropagation()}>
          <ContextMenu
            x={selectedItem.menu.x}
            y={selectedItem.menu.y}
            onToast={onToast}
            onDelete={() => onDelete(node.id)}
          />
        </div>
      ) : null}
    </div>
  );
}

/** Single output handle on the right side — unchanged from original design. */
function ImageNodeHandle({
  side,
  active,
  onPointerDown,
}: {
  side: ImageHandlePosition;
  active: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  const handleOffset = -20;

  return (
    <button
      type="button"
      data-canvas-interactive="true"
      className={[
        "absolute top-1/2 z-[150] grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full border text-white shadow-lg shadow-black/25 transition",
        active
          ? "border-[#8A8A8A] bg-[#5F5F5F]"
          : "border-[#4A4A4A] bg-[#3F3F3F] hover:border-[#8A8A8A] hover:bg-[#5F5F5F]",
      ].join(" ")}
      style={{
        left: side === "left" ? `${handleOffset}px` : "auto",
        right: side === "right" ? `${handleOffset}px` : "auto",
        transform: `translateY(-50%)`,
        transformOrigin: "center",
      }}
      aria-label={`Start image connection from ${side} handle`}
      onPointerDown={onPointerDown}
    >
      <ImageIcon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

/**
 * InputPortHandle — renders a single named input port on the left side of a node.
 * Shows a badge with the 1-based index and has 4 visual states:
 * - default (gray outline)
 * - connected (filled dark)
 * - hovered (cyan glow during drag)
 * - occupied-pending (amber, when replace/cancel popover is active)
 */
function InputPortHandle({
  port,
  isConnected,
  isHovered,
  isPendingReplace,
  isMaxReached,
  isNodeActive,
  onPointerDown,
}: {
  port: InputPort;
  isConnected: boolean;
  isHovered: boolean;
  isPendingReplace: boolean;
  isMaxReached: boolean;
  isNodeActive: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  let bgClass = "border-[#4A4A4A] bg-[#2F3033] hover:border-[#A3A3A3] hover:bg-[#4B4C50]";
  let labelClass = "border-[#4B5563] bg-[#1F2937] text-[#E5E7EB]";

  if (isPendingReplace) {
    bgClass = "border-[#F59E0B] bg-[#92400E] ring-2 ring-[#F59E0B]/30";
    labelClass = "border-[#F59E0B]/50 bg-[#451A03] text-[#FEF3C7]";
  } else if (isHovered) {
    bgClass = "border-[#22D3EE] bg-[#164E63] ring-2 ring-[#22D3EE]/30";
    labelClass = "border-[#22D3EE]/50 bg-[#083344] text-[#CFFAFE]";
  } else if (isConnected) {
    bgClass = "border-[#9CA3AF] bg-[#4B5563]";
    labelClass = "border-[#6B7280] bg-[#374151] text-white";
  } else {
    // Empty slot — dashed outline to signal "drop here"
    bgClass = "border-[#6B7280] bg-[#111827]/30 border-dashed hover:border-[#9CA3AF] hover:bg-[#374151]/60";
    labelClass = "border-[#4B5563] bg-[#111827] text-[#D1D5DB]";
  }

  return (
    <div className="group/port relative flex items-center">
      <button
        type="button"
        data-canvas-interactive="true"
        className={[
          "relative grid h-8 w-8 place-items-center rounded-full border text-white shadow-lg shadow-black/25 transition",
          bgClass,
        ].join(" ")}
        aria-label={`${port.label}${isConnected ? " (connected)" : " (empty)"}${isMaxReached ? " — max ports reached" : ""}`}
        title={isMaxReached ? "Max input ports reached" : port.label}
        onPointerDown={onPointerDown}
      >
        <ImageIcon className="h-3.5 w-3.5" aria-hidden="true" />
        <span className="absolute -bottom-1 -right-1 grid h-4 min-w-4 place-items-center rounded-full border border-[#111827] bg-white px-1 text-[9px] font-black leading-none text-[#111827]">
          {port.index + 1}
        </span>
      </button>
      <span
        className={[
          "absolute left-full ml-2 whitespace-nowrap rounded-md border px-2 py-1 text-[10px] font-bold shadow-lg shadow-black/20 pointer-events-none transition",
          isNodeActive || isHovered || isPendingReplace
            ? "translate-x-0 opacity-100"
            : "-translate-x-1 opacity-0 group-hover/port:translate-x-0 group-hover/port:opacity-100",
          labelClass,
        ].join(" ")}
      >
        {port.label}
      </span>
    </div>
  );
}

/**
 * ReplacePortPopover — shown when a user drops a connection on an occupied port (Q3).
 * Two buttons: "Replace" removes old edge and creates new one, "Cancel" reverts.
 * Auto-dismisses on outside click (→ Cancel).
 */
function ReplacePortPopover({
  viewportZoom,
  onReplace,
  onCancel,
}: {
  viewportZoom: number;
  onReplace: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutsideClick = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onCancel();
      }
    };
    window.addEventListener("pointerdown", handleOutsideClick);
    return () => window.removeEventListener("pointerdown", handleOutsideClick);
  }, [onCancel]);

  const scale = 1 / viewportZoom;

  return (
    <div
      ref={ref}
      className="absolute z-[200] mt-1"
      style={{
        left: "0px",
        top: "100%",
        transform: `scale(${scale})`,
        transformOrigin: "top left",
      }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1 rounded-xl border border-[#F59E0B]/60 bg-[#1C1917] p-1 shadow-xl shadow-black/40">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onReplace(); }}
          className="rounded-lg bg-[#F59E0B] px-2.5 py-1 text-[11px] font-bold text-[#1C1917] transition hover:bg-[#FBBF24]"
        >
          Replace
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onCancel(); }}
          className="rounded-lg px-2.5 py-1 text-[11px] font-bold text-[#9CA3AF] transition hover:bg-[#374151] hover:text-white"
        >
          Cancel
        </button>
      </div>
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
        <img
          src={imageUrl}
          alt={title}
          className="absolute inset-0 h-full w-full select-none object-contain pointer-events-none"
          draggable={false}
          decoding="async"
        />
      ) : null}
    </>
  );
}

function SelectionChrome({
  label,
  size,
  viewportZoom,
}: {
  label: string;
  size: string;
  viewportZoom: number;
}) {
  const uiScale = 1 / viewportZoom;

  return (
    <>
      <div
        className="absolute z-30 rounded-lg bg-[#3B82F6] px-2.5 py-1 text-xs font-black text-white"
        style={{
          left: `${-4 * uiScale}px`,
          top: `${-34 * uiScale}px`,
          transform: `scale(${uiScale})`,
          transformOrigin: "top left",
        }}
      >
        {label}
      </div>
      <div
        className="absolute z-30 rounded-lg border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] px-2.5 py-1 text-xs font-black text-[var(--canvas-theme-text-muted)] shadow-sm"
        style={{
          right: `${-4 * uiScale}px`,
          bottom: `${-32 * uiScale}px`,
          transform: `scale(${uiScale})`,
          transformOrigin: "bottom right",
        }}
      >
        {size}
      </div>
    </>
  );
}

function ObjectBox({
  object,
  selected,
  onSelect,
}: {
  object: AddedObject;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      className={`added-object absolute z-30 rounded-2xl border bg-white/85 text-center shadow-xl transition ${selected ? "border-[#3B82F6] ring-4 ring-[#3B82F6]/15" : "border-[#22C55E]"
        }`}
      style={{
        left: `${object.x}%`,
        top: `${object.y}%`,
        width: `${object.w}%`,
        height: `${object.h}%`,
        transform: `rotate(${object.rotation}deg)`,
      }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      <span className="grid h-full place-items-center rounded-2xl bg-[#ECFDF3]/80 px-3 text-xs font-black text-[#111827]">
        {object.label}
      </span>
      {selected ? (
        <>
          <span className="absolute -right-3 -top-8 grid h-7 w-7 place-items-center rounded-full bg-[#111827] text-white shadow-lg">
            ↻
          </span>
          <span className="absolute -bottom-2 -right-2 h-5 w-5 rounded-full border-2 border-[#3B82F6] bg-white" />
        </>
      ) : null}
    </button>
  );
}

function ContextMenu({
  x,
  y,
  onToast,
  onDelete,
}: {
  x: number;
  y: number;
  onToast: (message: string) => void;
  onDelete: () => void;
}) {
  const items = [
    ["Duplicate", Copy],
    ["Replace image", ImagePlus],
    ["Use as layout source", RefreshCw],
    ["Use as style reference", Sparkles],
    ["Generate similar concept", Sparkles],
    ["Remove", Trash2],
  ] as const;

  return (
    <div
      className="fixed z-[90] w-56 rounded-2xl border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] p-2 shadow-2xl shadow-[var(--canvas-theme-shadow)] backdrop-blur"
      style={{ left: x, top: y }}
    >
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
