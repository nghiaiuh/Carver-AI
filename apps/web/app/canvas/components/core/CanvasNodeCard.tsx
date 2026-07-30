/*
 * CanvasNodeCard
 * Renders a single draggable image node on the canvas.
 * Receives all state and callbacks from CanvasBoard - no internal state except rendering.
 */

"use client";

import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type {
  AddedObject,
  CanvasConnectionKind,
  CanvasEdge,
  CanvasNode,
  EditorTool,
  Marker,
  SelectedItem,
  SketchGroup,
  SketchLine,
} from "../../types/canvas";
import { Box, Copy, Image as ImageIcon, ImagePlus, MapPin, RefreshCw, Sparkles, Trash2, Type } from "lucide-react";
import ContextualToolbar from "../widgets/ContextualToolbar";
import {
  AGGREGATE_HANDLE_GAP,
  AGGREGATE_HANDLE_OFFSET,
  getAggregateHandleCenterY,
  getNodeConnectionCountsBySide,
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
    return "border-[var(--canvas-theme-selection)] ring-2 ring-[var(--canvas-theme-selection-ring)] shadow-[0_8px_24px_var(--canvas-theme-selection-ring)]";
  }

  if (isGenerationTarget) {
    return "border-[var(--canvas-theme-selection)] ring-2 ring-[var(--canvas-theme-selection-ring)]";
  }

  if (isConnectionTarget) {
    return "border-[var(--canvas-theme-connector-active)] ring-2 ring-[var(--canvas-theme-guide-soft)]";
  }

  return "border-[var(--canvas-theme-border)] hover:border-[var(--canvas-theme-border-strong)] shadow-[0_4px_20px_rgba(0,0,0,0.03)]";
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
  onSelect: (id: string, event?: React.MouseEvent | React.PointerEvent) => void;
  onStartConnection: (
    nodeId: string,
    handle: ImageHandlePosition,
    connectionKind: CanvasConnectionKind,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => void;
  onSelectOverlay: (item: SelectedItem) => void;
  onAddSketchLine: (line: SketchLine) => void;
  onSelectSketchLine: (id: string, additive: boolean) => void;
  onSelectSketchGroup: (id: string) => void;
  onSelectContextMenu: (id: string, x: number, y: number) => void;
  onDragStart: (id: string, e: React.PointerEvent) => void;
  onImageAction: (nodeId: string, xPercent: number, yPercent: number) => void;
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
  edges,
  selected,
  isGenerationTarget = false,
  showSelectionTools = true,
  selectedItem,
  activeTool,
  markers,
  addedObjects,
  viewportZoom,
  isConnectionTarget = false,
  onSelect,
  onStartConnection,
  onSelectOverlay,
  onSelectContextMenu,
  onDragStart,
  onImageAction,
  onQuickEdit,
  onMultiAngle,
  onAddObject,
  onTool,
  onToast,
  onSetActiveNode,
  onDelete,
}: CanvasNodeCardProps) {
  const objectScale = node.scale ?? 1;
  const displayWidth = node.width * objectScale;
  const displayHeight = node.height * objectScale;
  // Asset-backed nodes may restore their runtime URL into sourceImage.url first,
  // so rendering should not depend on imageUrl alone.
  const runtimeImageUrl = node.sourceImage?.url ?? node.imageUrl;
  const connectionCountsBySide = getNodeConnectionCountsBySide(node.id, edges);
  const leftHandles: Array<{ kind: CanvasConnectionKind; count: number }> = [];
  const rightHandles: Array<{ kind: CanvasConnectionKind; count: number }> = [];

  if (connectionCountsBySide.left.text > 0) {
    leftHandles.push({ kind: "text", count: connectionCountsBySide.left.text });
  }
  if (connectionCountsBySide.left.image > 0 || selected) {
    leftHandles.push({ kind: "image", count: connectionCountsBySide.left.image });
  }
  if (connectionCountsBySide.right.text > 0) {
    rightHandles.push({ kind: "text", count: connectionCountsBySide.right.text });
  }
  if (connectionCountsBySide.right.image > 0 || selected) {
    rightHandles.push({ kind: "image", count: connectionCountsBySide.right.image });
  }
  const nodeFrameClassName = getNodeFrameClassName({
    selected,
    isGenerationTarget,
    isConnectionTarget,
  });
  const legacyOverlayHost = isGenerationTarget || selected;
  const nodeMarkers = markers.filter(
    (marker) => marker.targetNodeId === node.id || (!marker.targetNodeId && legacyOverlayHost),
  );
  const nodeObjects = addedObjects.filter(
    (object) => object.targetNodeId === node.id || (!object.targetNodeId && legacyOverlayHost),
  );

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
              "relative overflow-hidden rounded-[18px] border bg-[var(--canvas-theme-surface-soft)] shadow-[0_18px_42px_rgba(23,50,37,0.08)] transition-colors",
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
                onImageAction(node.id, x, y);
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
              <div className="flex h-full w-full items-center justify-center text-[var(--canvas-theme-text-muted)]">
                <ImagePlus className="h-8 w-8 opacity-50" />
              </div>
            )}
            <div className="pointer-events-none absolute inset-0 bg-[rgba(255,255,255,0.03)]" />

            {nodeObjects.map((object) => (
              <button
                key={object.id}
                type="button"
                className="added-object absolute z-30 flex min-h-7 min-w-10 items-center justify-center gap-1 rounded-lg border border-[var(--canvas-theme-selection)] bg-[var(--canvas-theme-selection-soft)]/95 px-2 text-[10px] font-semibold text-[var(--canvas-theme-text)] shadow-[0_4px_12px_rgba(23,50,37,0.16)] transition hover:bg-[var(--canvas-theme-surface-panel)]"
                style={{
                  left: `${object.x}%`,
                  top: `${object.y}%`,
                  width: `${object.w}%`,
                  height: `${object.h}%`,
                  transform: `translate(-50%, -50%) rotate(${object.rotation}deg)`,
                }}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectOverlay({ type: "object", id: object.id });
                }}
                title={object.label}
              >
                <Box className="h-3 w-3 shrink-0" aria-hidden />
                <span className="max-w-full truncate">{object.label}</span>
              </button>
            ))}

            {nodeMarkers.map((marker) => (
              <button
                key={marker.id}
                type="button"
                className="marker-pin absolute z-40 -translate-x-1/2 -translate-y-full text-left"
                style={{ left: `${marker.x}%`, top: `${marker.y}%` }}
                onPointerDown={(event) => event.stopPropagation()}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectOverlay({ type: "marker", id: marker.id });
                }}
                title={marker.label}
              >
                <span className="grid h-7 w-7 place-items-center rounded-full border-2 border-[var(--canvas-theme-handle-bg)] bg-[var(--canvas-theme-selection)] text-[var(--canvas-theme-active-text)] shadow-md">
                  <MapPin className="h-3.5 w-3.5" aria-hidden />
                </span>
              </button>
            ))}
          </div>

          {leftHandles.map((handle, index) => (
            <ConnectionHandleSlot
              key={`left-${handle.kind}`}
              count={handle.count}
              kind={handle.kind}
              side="left"
              selected={selected}
              isConnectionTarget={isConnectionTarget}
              displayHeight={displayHeight}
              visibleIndex={index}
              totalVisible={leftHandles.length}
              onPointerDown={(event) => onStartConnection(node.id, "left", handle.kind, event)}
            />
          ))}
          {rightHandles.map((handle, index) => (
            <ConnectionHandleSlot
              key={`right-${handle.kind}`}
              count={handle.count}
              kind={handle.kind}
              side="right"
              selected={selected}
              isConnectionTarget={isConnectionTarget}
              displayHeight={displayHeight}
              visibleIndex={index}
              totalVisible={rightHandles.length}
              onPointerDown={(event) => onStartConnection(node.id, "right", handle.kind, event)}
            />
          ))}
        </div>

        <div className="px-1 pb-1 text-left" style={{ marginTop: "10px" }}>
          <h3 className="truncate font-[var(--font-botanical-display)] text-[17px] leading-tight text-[var(--canvas-theme-text)]">
            {node.title}
          </h3>
          {node.prompt ? (
            <p
              className="mt-1 line-clamp-1 text-xs leading-snug text-[var(--canvas-theme-text-muted)]"
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

function getHandleTopOffset({
  displayHeight,
  visibleIndex,
  totalVisible,
}: {
  displayHeight: number;
  visibleIndex: number;
  totalVisible: number;
}) {
  if (totalVisible <= 1) {
    return getAggregateHandleCenterY(0, displayHeight);
  }

  const clusterHeight = (totalVisible - 1) * AGGREGATE_HANDLE_GAP;
  const startY = getAggregateHandleCenterY(0, displayHeight) - clusterHeight / 2;
  return startY + visibleIndex * AGGREGATE_HANDLE_GAP;
}

function getConnectionHandleStyles(kind: CanvasConnectionKind) {
  if (kind === "text") {
    return {
      border: "var(--canvas-theme-connection-text)",
      background: "var(--canvas-theme-surface-panel)",
      ring: "var(--canvas-theme-connection-text-soft)",
      text: "var(--canvas-theme-connection-text)",
    };
  }

  return {
    border: "var(--canvas-theme-connection-image)",
    background: "var(--canvas-theme-surface-panel)",
    ring: "var(--canvas-theme-connection-image-soft)",
    text: "var(--canvas-theme-connection-image)",
  };
}

function ConnectionHandleSlot({
  count,
  kind,
  side,
  selected,
  isConnectionTarget,
  displayHeight,
  visibleIndex,
  totalVisible,
  onPointerDown,
}: {
  count: number;
  kind: CanvasConnectionKind;
  side: ImageHandlePosition;
  selected: boolean;
  isConnectionTarget: boolean;
  displayHeight: number;
  visibleIndex: number;
  totalVisible: number;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  const shouldRenderVisibleHandle = count > 0 || (selected && kind === "image");
  const shouldRenderHiddenLaunchZone = count === 0 && selected && kind === "text";
  const top = getHandleTopOffset({
    displayHeight,
    visibleIndex,
    totalVisible,
  });

  if (!shouldRenderVisibleHandle && !shouldRenderHiddenLaunchZone) {
    return null;
  }

  return (
    <div
      className="absolute z-[150]"
      style={{
        width: "32px",
        height: "32px",
        top,
        left: side === "left" ? `${-AGGREGATE_HANDLE_OFFSET}px` : "auto",
        right: side === "right" ? `${-AGGREGATE_HANDLE_OFFSET}px` : "auto",
        transform: "translateY(-50%)",
      }}
    >
      {shouldRenderVisibleHandle ? (
        <AggregateConnectionHandle
          count={count}
          kind={kind}
          selected={selected}
          active={selected || isConnectionTarget}
          onPointerDown={onPointerDown}
        />
      ) : null}
      {shouldRenderHiddenLaunchZone ? (
        <button
          type="button"
          data-canvas-interactive="true"
          aria-label={`Create ${kind} connection`}
          className="absolute inset-0 h-8 w-8 rounded-full opacity-0"
          onPointerDown={onPointerDown}
        />
      ) : null}
    </div>
  );
}

function AggregateConnectionHandle({
  count,
  kind,
  selected,
  active,
  onPointerDown,
}: {
  count: number;
  kind: CanvasConnectionKind;
  selected: boolean;
  active: boolean;
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => void;
}) {
  const styles = getConnectionHandleStyles(kind);
  const showCount = selected && count >= 2;
  const Icon = kind === "text" ? Type : ImageIcon;

  return (
    <button
      type="button"
      data-canvas-interactive="true"
      aria-label={`${kind} connection${count > 1 ? ` (${count})` : ""}`}
      title={count > 1 ? `${count} ${kind} connections` : `${kind} connection`}
      className="relative flex h-8 w-8 items-center justify-center rounded-full border shadow-[0_8px_18px_rgba(15,23,42,0.14)] transition duration-150 hover:scale-[1.04]"
      style={{
        borderColor: styles.border,
        background: styles.background,
        boxShadow: active
          ? `0 0 0 3px ${styles.ring}, 0 8px 18px rgba(15,23,42,0.14)`
          : "0 8px 18px rgba(15,23,42,0.14)",
      }}
      onPointerDown={onPointerDown}
    >
      <AnimatePresence mode="wait" initial={false}>
        <motion.span
          key={showCount ? `count-${count}` : `icon-${kind}`}
          initial={{ opacity: 0, scale: 0.76, y: 2 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.78, y: -2 }}
          transition={{ duration: 0.16, ease: "easeOut" }}
          className="flex h-4.5 w-4.5 items-center justify-center"
          style={{ color: styles.text }}
        >
          {showCount ? (
            <span className="text-[11px] font-semibold leading-none">{count}</span>
          ) : (
            <Icon className="h-[14px] w-[14px]" strokeWidth={1.9} />
          )}
        </motion.span>
      </AnimatePresence>
    </button>
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
