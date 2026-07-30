"use client";

import { useEffect, useRef, useState } from "react";
import { MoveRight, Star, X } from "lucide-react";
import type {
  CanvasConnectionKind,
  CanvasEdge,
  CanvasPresetGroupNode,
  ImageHandlePosition,
  SelectedItem,
} from "../../types/canvas";
import {
  PRESET_GROUP_TITLE_HEIGHT,
  getPresetChildRects,
} from "../../utils/presetGroupHelpers";

// ─── Adaptive thumbnail renderer ────────────────────────────────────────────
// Mirrors the AdaptiveImageRenderer in CanvasNodeCard: renders onto a <canvas>
// at (viewportZoom × devicePixelRatio) resolution so thumbnails stay crisp
// when zoomed in. Falls back to a plain <img> until the image has decoded.

const DEFAULT_DPR = 1;
/** Drag distance (CSS px) before a pointerdown on a thumbnail becomes a connection drag. */
const CONNECT_DRAG_THRESHOLD = 5;

function getDevicePixelRatio() {
  if (typeof window === "undefined") return DEFAULT_DPR;
  return Math.max(window.devicePixelRatio ?? DEFAULT_DPR, DEFAULT_DPR);
}

/** Cover-crop: fill the target rect while preserving source aspect ratio. */
function getCoverRect(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
): { sx: number; sy: number; sw: number; sh: number } {
  const srcRatio = srcW / srcH;
  const dstRatio = dstW / dstH;

  if (srcRatio > dstRatio) {
    const sw = srcH * dstRatio;
    return { sx: (srcW - sw) / 2, sy: 0, sw, sh: srcH };
  }
  const sh = srcW / dstRatio;
  return { sx: 0, sy: (srcH - sh) / 2, sw: srcW, sh };
}

function AdaptiveThumbRenderer({
  imageSrc,
  label,
  displayWidth,
  displayHeight,
  viewportZoom,
}: {
  imageSrc: string;
  label: string;
  displayWidth: number;
  displayHeight: number;
  viewportZoom: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const [renderedUrl, setRenderedUrl] = useState<string | null>(null);
  const ready = renderedUrl === imageSrc;

  useEffect(() => {
    let cancelled = false;
    const img = new window.Image();
    img.decoding = "async";
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      imageRef.current = img;
      setRenderedUrl(imageSrc);
    };
    img.onerror = () => {
      if (cancelled) return;
      imageRef.current = null;
    };
    img.src = imageSrc;
    return () => { cancelled = true; };
  }, [imageSrc]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img || !ready || displayWidth <= 0 || displayHeight <= 0) return;

    const rasterScale = Math.max(viewportZoom * getDevicePixelRatio(), DEFAULT_DPR);
    const rasterW = Math.max(1, Math.ceil(displayWidth * rasterScale));
    const rasterH = Math.max(1, Math.ceil(displayHeight * rasterScale));

    if (canvas.width !== rasterW) canvas.width = rasterW;
    if (canvas.height !== rasterH) canvas.height = rasterH;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    ctx.clearRect(0, 0, rasterW, rasterH);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const { sx, sy, sw, sh } = getCoverRect(img.naturalWidth, img.naturalHeight, rasterW, rasterH);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, rasterW, rasterH);
  }, [displayWidth, displayHeight, ready, viewportZoom]);

  return (
    <>
      <canvas
        ref={canvasRef}
        className="pointer-events-none absolute inset-0 h-full w-full select-none"
        aria-label={label}
        role="img"
      />
      {!ready ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageSrc}
          alt={label}
          className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover"
          draggable={false}
          decoding="async"
        />
      ) : null}
    </>
  );
}

// ─── PresetThumb — single thumbnail with drag-to-connect ────────────────────
/**
 * Wraps a single preset child thumbnail.
 *
 * Interaction model:
 * - A short tap (pointer up before CONNECT_DRAG_THRESHOLD) → select / set active (click).
 * - Dragging beyond the threshold → initiates a connection line from this child.
 *   The parent node's onStartChildConnection callback is called with the child id,
 *   handing over to CanvasBoard's draftEdge system.
 *
 * This replaces the old explicit connection-handle button; no handle UI is needed.
 */
function PresetThumb({
  childId,
  nodeId,
  label,
  imageSrc,
  thumbW,
  thumbH,
  left,
  top,
  thumbSize,
  isActive,
  isSelectedChild,
  isHovered,
  viewportZoom,
  onActivate,
  onRemove,
  onHoverChange,
  onStartChildConnection,
}: {
  childId: string;
  nodeId: string;
  label: string;
  imageSrc: string;
  thumbW: number;
  thumbH: number;
  left: number;
  top: number;
  thumbSize: number;
  isActive: boolean;
  isSelectedChild: boolean;
  isHovered: boolean;
  viewportZoom: number;
  onActivate: () => void;
  onRemove: () => void;
  onHoverChange: (hovered: boolean) => void;
  onStartChildConnection: (nodeId: string, childId: string, event: React.PointerEvent<HTMLElement>) => void;
}) {
  const pointerStart = useRef<{ x: number; y: number; id: number } | null>(null);
  const didStartDrag = useRef(false);

  return (
    <div
      role="button"
      tabIndex={0}
      title={label}
      aria-label={`Preset: ${label}`}
      className={[
        "absolute overflow-hidden rounded-xl border-2 shadow-[0_10px_22px_rgba(15,23,42,0.1)] transition cursor-grab active:cursor-grabbing",
        isActive
          ? "border-[var(--canvas-theme-selection)] shadow-[0_0_0_2px_var(--canvas-theme-selection-ring)]"
          : "border-transparent hover:border-white/60",
        isHovered ? "scale-105" : "",
        isSelectedChild ? "border-[var(--canvas-theme-selection)]" : "",
      ].join(" ")}
      style={{
        left,
        top,
        width: thumbSize,
        height: thumbSize,
        transition: "transform 120ms ease, box-shadow 120ms ease",
      }}
      onMouseEnter={() => onHoverChange(true)}
      onMouseLeave={() => onHoverChange(false)}
      onPointerDown={(event) => {
        // Stop the parent node's drag handler from firing — we'll handle pointer capture here.
        event.stopPropagation();
        pointerStart.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
        didStartDrag.current = false;
      }}
      onPointerMove={(event) => {
        if (!pointerStart.current || pointerStart.current.id !== event.pointerId) return;
        if (didStartDrag.current) return;

        const dx = event.clientX - pointerStart.current.x;
        const dy = event.clientY - pointerStart.current.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist >= CONNECT_DRAG_THRESHOLD) {
          didStartDrag.current = true;
          pointerStart.current = null;
          // Hand over to CanvasBoard draft-edge system
          onStartChildConnection(nodeId, childId, event);
        }
      }}
      onPointerUp={(event) => {
        if (pointerStart.current && pointerStart.current.id === event.pointerId && !didStartDrag.current) {
          // Short tap → select + activate
          onActivate();
        }
        pointerStart.current = null;
        didStartDrag.current = false;
      }}
      onPointerCancel={() => {
        pointerStart.current = null;
        didStartDrag.current = false;
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.stopPropagation();
          onActivate();
        }
      }}
    >
      {/* High-DPI canvas renderer — stays sharp at any zoom level */}
      <AdaptiveThumbRenderer
        imageSrc={imageSrc}
        label={label}
        displayWidth={thumbW}
        displayHeight={thumbH}
        viewportZoom={viewportZoom}
      />

      {/* Drag-to-connect visual hint — subtle right-edge glow on hover */}
      <div className="pointer-events-none absolute inset-y-0 right-0 w-1 rounded-r-md bg-[var(--canvas-theme-selection)]/0 transition-all group-hover:bg-[var(--canvas-theme-selection)]/16" />

      {/* Active star — bottom-right corner */}
      {isActive ? (
        <div className="absolute bottom-1 right-1 z-10 grid h-3.5 w-3.5 place-items-center rounded-full bg-[var(--canvas-theme-selection)] text-[var(--canvas-theme-active-text)]">
          <Star className="h-2 w-2 fill-current" aria-hidden="true" />
        </div>
      ) : null}

      {/* Remove button — top-right, visible on group hover */}
      <div
        role="button"
        tabIndex={0}
        className="absolute right-0.5 top-0.5 z-10 grid h-3.5 w-3.5 place-items-center rounded-full bg-black/50 text-white opacity-0 transition hover:bg-black/80 group-hover:opacity-100"
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
        onPointerDown={(event) => {
          // Prevent the thumb's own pointerDown from firing
          event.stopPropagation();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.stopPropagation();
            onRemove();
          }
        }}
        title="Remove preset"
      >
        <X className="h-2 w-2" aria-hidden="true" />
      </div>
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

type CanvasPresetGroupNodeCardProps = {
  node: CanvasPresetGroupNode;
  edges: CanvasEdge[];
  selected: boolean;
  selectedItem: SelectedItem;
  viewportZoom: number;
  isConnectionTarget?: boolean;
  hoveredPresetChildId?: string | null;
  onSelect: (id: string, event?: React.MouseEvent | React.PointerEvent) => void;
  onSelectPresetChild: (nodeId: string, childId: string) => void;
  onSetActivePresetChild: (nodeId: string, childId: string) => void;
  onRemovePresetChild: (nodeId: string, childId: string) => void;
  onMovePresetChild: (nodeId: string, childId: string, direction: "left" | "right") => void;
  onDragStart: (id: string, e: React.PointerEvent) => void;
  onStartConnection: (
    nodeId: string,
    handle: ImageHandlePosition,
    connectionKind: CanvasConnectionKind,
    event: React.PointerEvent<HTMLButtonElement>,
  ) => void;
  /** Called when user drags from a child thumbnail to start a connection line */
  onStartChildConnection: (nodeId: string, childId: string, event: React.PointerEvent<HTMLElement>) => void;
  onSelectContextMenu: (id: string, x: number, y: number) => void;
  onDelete: (id: string) => void;
  onPresetChildHover?: (childId: string | null) => void;
};

export default function CanvasPresetGroupNodeCard({
  node,
  edges,
  selected,
  selectedItem,
  viewportZoom,
  isConnectionTarget = false,
  hoveredPresetChildId = null,
  onSelect,
  onSelectPresetChild,
  onSetActivePresetChild,
  onRemovePresetChild,
  onMovePresetChild,
  onDragStart,
  onStartConnection,
  onStartChildConnection,
  onSelectContextMenu,
  onDelete,
  onPresetChildHover,
}: CanvasPresetGroupNodeCardProps) {
  const objectScale = node.scale ?? 1;
  const displayWidth = node.width * objectScale;
  const displayHeight = node.height * objectScale;
  const childRects = getPresetChildRects(node);
  const activeChildId = node.presetGroup.activeChildId;

  const boxHeight = displayHeight - PRESET_GROUP_TITLE_HEIGHT * objectScale;

  const handleBaseClass = [
    "absolute z-20 flex h-7 w-4 cursor-crosshair items-center justify-center",
    "rounded-full border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] shadow-[0_8px_18px_rgba(15,23,42,0.12)] backdrop-blur-md transition",
    "opacity-0 group-hover:opacity-100",
    "hover:border-[var(--canvas-theme-selection)] hover:bg-[var(--canvas-theme-hover)]",
  ].join(" ");

  return (
    <div
      data-canvas-node-id={node.id}
      className="group absolute select-none"
      style={{
        left: node.x,
        top: node.y,
        width: displayWidth,
        height: displayHeight,
        zIndex: selected ? 80 : 5,
      }}
      onPointerDown={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSelect(node.id, event);
        onDragStart(node.id, event);
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onSelectContextMenu(node.id, event.clientX, event.clientY);
      }}
    >
      {/* Left connection handle — for connecting the whole group node */}
      <button
        type="button"
        title="Drag to connect"
        aria-label="Connect from left"
        className={handleBaseClass}
        style={{ left: -8, top: boxHeight / 2 - 14 }}
        onPointerDown={(event) => {
          event.stopPropagation();
          onStartConnection(node.id, "left", "image", event);
        }}
      >
        <MoveRight className="h-2.5 w-2.5 rotate-180 text-[var(--canvas-theme-icon-muted)]" aria-hidden="true" />
      </button>

      {/* Right connection handle */}
      <button
        type="button"
        title="Drag to connect"
        aria-label="Connect from right"
        className={handleBaseClass}
        style={{ right: -8, top: boxHeight / 2 - 14 }}
        onPointerDown={(event) => {
          event.stopPropagation();
          onStartConnection(node.id, "right", "image", event);
        }}
      >
        <MoveRight className="h-2.5 w-2.5 text-[var(--canvas-theme-icon-muted)]" aria-hidden="true" />
      </button>

      {/* Gray box — contains thumbnails only */}
      <div
        className={[
          "absolute inset-x-0 top-0 overflow-hidden rounded-[18px] border shadow-[0_12px_30px_rgba(15,23,42,0.08)] transition",
          selected
            ? "border-[var(--canvas-theme-selection)] bg-[var(--canvas-theme-surface-muted)] ring-2 ring-[var(--canvas-theme-selection-ring)] ring-offset-1"
            : isConnectionTarget
              ? "border-[var(--canvas-theme-connector-active)] bg-[var(--canvas-theme-surface-muted)] ring-2 ring-[var(--canvas-theme-guide-soft)]"
              : "border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-muted)] hover:bg-[var(--canvas-theme-hover)]",
        ].join(" ")}
        style={{ height: boxHeight }}
      >


        {/* Thumbnail grid — column-first. Each cell uses PresetThumb for drag-to-connect. */}
        {childRects.map((rect) => {
          const isActive = rect.child.id === activeChildId;
          const isSelectedChild =
            selectedItem.type === "presetChild" &&
            selectedItem.nodeId === node.id &&
            selectedItem.childId === rect.child.id;
          const isHovered = hoveredPresetChildId === rect.child.id;
          const thumbW = rect.width * objectScale;
          const thumbH = rect.height * objectScale;

          return (
            <PresetThumb
              key={rect.child.id}
              childId={rect.child.id}
              nodeId={node.id}
              label={rect.child.label}
              imageSrc={rect.child.imageSrc}
              thumbW={thumbW}
              thumbH={thumbH}
              left={rect.x - node.x}
              top={rect.y - node.y}
              thumbSize={rect.width}
              isActive={isActive}
              isSelectedChild={isSelectedChild}
              isHovered={isHovered}
              viewportZoom={viewportZoom}
              onActivate={() => {
                onSetActivePresetChild(node.id, rect.child.id);
                onSelectPresetChild(node.id, rect.child.id);
              }}
              onRemove={() => onRemovePresetChild(node.id, rect.child.id)}
              onHoverChange={(hovered) => onPresetChildHover?.(hovered ? rect.child.id : null)}
              onStartChildConnection={onStartChildConnection}
            />
          );
        })}
      </div>

      {/* Title — below box, centered, constant screen-space size */}
      <div
        className="absolute inset-x-0 flex items-center justify-center"
        style={{ top: boxHeight, height: PRESET_GROUP_TITLE_HEIGHT * objectScale }}
      >
        <p className="whitespace-nowrap text-center text-[14px] font-semibold leading-tight text-[var(--canvas-theme-text)]">
          {node.title}
        </p>
      </div>
    </div>
  );
}
