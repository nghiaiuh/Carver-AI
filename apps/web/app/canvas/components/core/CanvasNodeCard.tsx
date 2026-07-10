/*
 * CanvasNodeCard
 * Renders a single draggable image node on the canvas.
 * Receives all state and callbacks from CanvasBoard - no internal state except rendering.
 */

"use client";

import React, { useEffect, useRef, useState } from "react";
import type {
  AddedObject,
  CanvasEdge,
  CanvasNode,
  EditorTool,
  InputPort,
  Marker,
  SelectedItem,
  SketchGroup,
  SketchLine,
} from "../../types/canvas";
import { getDefaultInputPorts, getVisibleInputPorts } from "../../types/canvas";
import { Copy, Image as ImageIcon, ImagePlus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import ContextualToolbar from "../widgets/ContextualToolbar";
import {
  INPUT_PORT_GAP,
  INPUT_PORT_HANDLE_CENTER_OFFSET,
  type ImageHandlePosition,
} from "./canvasConnectionGeometry";

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

function getNodeFrameClassName({
  selected,
  isGenerationTarget,
  isConnectionTarget,
}: {
  selected: boolean;
  isGenerationTarget: boolean;
  isConnectionTarget: boolean;
}) {
  if (selected) {
    return "border-[#4D735B] ring-2 ring-[#4D735B]/12";
  }

  if (isGenerationTarget) {
    return "border-[#7B6534] ring-2 ring-[#B99B52]/20";
  }

  if (isConnectionTarget) {
    return "border-[#6F8B74] ring-2 ring-[#6F8B74]/12";
  }

  return "border-white/65";
}

function getPortTopOffset({
  displayHeight,
  visibleIndex,
  totalVisible,
}: {
  displayHeight: number;
  visibleIndex: number;
  totalVisible: number;
}) {
  if (totalVisible <= 1) {
    return displayHeight / 2;
  }

  const clusterHeight = (totalVisible - 1) * INPUT_PORT_GAP;
  const startY = displayHeight / 2 - clusterHeight / 2;
  return startY + visibleIndex * INPUT_PORT_GAP;
}

function getNodeKindLabel(role: CanvasNode["role"]) {
  if (role === "output") {
    return "Image";
  }

  if (role === "reference") {
    return "Reference";
  }

  return "Object";
}

type CanvasNodeCardProps = {
  node: CanvasNode;
  edges: CanvasEdge[];
  selected: boolean;
  isGenerationTarget?: boolean;
  showSelectionTools?: boolean;
  selectedItem: SelectedItem;
  activeTool: EditorTool;
  markers: Marker[];
  addedObjects: AddedObject[];
  sketchLines: SketchLine[];
  sketchGroups: SketchGroup[];
  selectedSketchLineIds: string[];
  viewportZoom: number;
  isConnectionTarget?: boolean;
  hoveredPortId?: string | null;
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
  onRequestPortReplace?: (portId: string) => void;
  onCancelPortReplace?: () => void;
};

export default function CanvasNodeCard({
  node,
  edges,
  selected,
  isGenerationTarget = false,
  showSelectionTools = true,
  selectedItem,
  activeTool,
  viewportZoom,
  isConnectionTarget = false,
  hoveredPortId,
  pendingReplacePortId,
  onSelect,
  onStartConnection,
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
  const objectScale = node.scale ?? 1;
  const displayWidth = node.width * objectScale;
  const displayHeight = node.height * objectScale;
  // Asset-backed nodes may restore their runtime URL into sourceImage.url first,
  // so rendering should not depend on imageUrl alone.
  const runtimeImageUrl = node.sourceImage?.url ?? node.imageUrl;
  const nodePorts = node.inputPorts || getDefaultInputPorts();
  const visiblePorts = getVisibleInputPorts(nodePorts, edges, node.id);
  const connectedPortIds = new Set(edges.filter((edge) => edge.targetId === node.id).map((edge) => edge.targetPortId));
  const nodeFrameClassName = getNodeFrameClassName({
    selected,
    isGenerationTarget,
    isConnectionTarget,
  });

  return (
    <div
      data-canvas-node-id={node.id}
      className="group absolute select-none bg-transparent"
      style={{
        left: node.x,
        top: node.y,
        width: displayWidth,
        height: displayHeight,
        zIndex: selected ? 80 : 15,
      }}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSelect(node.id, event);
        if (activeTool !== "region") {
          onDragStart(node.id, event);
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
              "relative overflow-hidden rounded-[18px] border bg-[#F8F4EA] shadow-[0_18px_42px_rgba(23,50,37,0.08)] transition-colors",
              nodeFrameClassName,
            ].join(" ")}
            style={{ height: displayHeight }}
            onClick={(event) => {
              if (activeTool === "mark-position") {
                event.stopPropagation();
                onSetActiveNode(node.id);
                const rect = event.currentTarget.getBoundingClientRect();
                const x = ((event.clientX - rect.left) / rect.width) * 100;
                const y = ((event.clientY - rect.top) / rect.height) * 100;
                onImageAction(x, y);
              }
            }}
          >
            {runtimeImageUrl ? (
              <AdaptiveImageRenderer
                imageUrl={runtimeImageUrl}
                title={node.title}
                displayWidth={displayWidth}
                displayHeight={displayHeight}
                viewportZoom={viewportZoom}
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-[#9CA3AF]">
                <ImagePlus className="h-8 w-8 opacity-50" />
              </div>
            )}
            <div className="pointer-events-none absolute inset-0 bg-[rgba(255,255,255,0.03)]" />
          </div>

          {visiblePorts.map((port, visibleIndex) => {
            const isConnected = connectedPortIds.has(port.id);
            const isHovered = hoveredPortId === port.id;
            const isPendingReplace = pendingReplacePortId === port.id;
            const isMaxReached = visiblePorts.length === nodePorts.length && !isConnected;
            const totalVisible = visiblePorts.length;
            // Keep all visible input ports centered as a vertical cluster so the
            // node edge does not visually "drift" as ports are added or removed.
            const topPx = getPortTopOffset({
              displayHeight,
              visibleIndex,
              totalVisible,
            });

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

          <ImageNodeHandle
            side="right"
            active={selected || isConnectionTarget}
            onPointerDown={(event) => onStartConnection(node.id, "right", event)}
          />
        </div>

        <div className="px-1 pb-1 text-left" style={{ marginTop: "10px" }}>
          <h3 className="truncate font-[var(--font-botanical-display)] text-[17px] leading-tight text-[#102A1F]">
            {node.title}
          </h3>
          {node.prompt ? (
            <p
              className="mt-1 line-clamp-1 text-xs leading-snug text-[#6F7B6F]"
              title={node.prompt}
            >
              {node.prompt}
            </p>
          ) : null}
        </div>
      </div>

      {selected && showSelectionTools ? (
        <div
          className="pointer-events-none absolute inset-0 z-[120]"
          onPointerDown={(event) => event.stopPropagation()}
        >
          <div className="pointer-events-auto">
            <ContextualToolbar
              itemLabel={getNodeKindLabel(node.role)}
              viewportZoom={viewportZoom}
              onQuickEdit={onQuickEdit}
              onMultiAngle={onMultiAngle}
              onAddObject={onAddObject}
              onTool={onTool}
              onToast={onToast}
            />
          </div>
        </div>
      ) : null}

      {selected && selectedItem.type === "node" && selectedItem.menu ? (
        <div onPointerDown={(event) => event.stopPropagation()}>
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
        transform: "translateY(-50%)",
        transformOrigin: "center",
      }}
      aria-label={`Start image connection from ${side} handle`}
      onPointerDown={onPointerDown}
    >
      <ImageIcon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}

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
    bgClass = "border-[#202833] bg-[#2F3742] ring-2 ring-[#202833]/20";
    labelClass = "border-[#202833]/30 bg-[#202833] text-[#F8FAFC]";
  } else if (isConnected) {
    bgClass = "border-[#9CA3AF] bg-[#4B5563]";
    labelClass = "border-[#6B7280] bg-[#374151] text-white";
  } else {
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
        aria-label={`${port.label}${isConnected ? " (connected)" : " (empty)"}${isMaxReached ? " - max ports reached" : ""}`}
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
          "pointer-events-none absolute left-full ml-2 whitespace-nowrap rounded-md border px-2 py-1 text-[10px] font-bold shadow-lg shadow-black/20 transition",
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
      onPointerDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-1 rounded-xl border border-[#F59E0B]/60 bg-[#1C1917] p-1 shadow-xl shadow-black/40">
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onReplace();
          }}
          className="rounded-lg bg-[#F59E0B] px-2.5 py-1 text-[11px] font-bold text-[#1C1917] transition hover:bg-[#FBBF24]"
        >
          Replace
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onCancel();
          }}
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

    // We rasterize into a canvas sized to the current viewport zoom so nodes
    // stay crisp while users pan and zoom around the workspace.
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
        className="pointer-events-none h-full w-full select-none"
        aria-label={title}
        role="img"
      />
      {!ready ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt={title}
          className="pointer-events-none absolute inset-0 h-full w-full select-none object-contain"
          draggable={false}
          decoding="async"
        />
      ) : null}
    </>
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
