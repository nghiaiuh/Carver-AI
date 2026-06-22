"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import type { CanvasNode, MaskData } from "../../types/canvas";
import {
  MASK_ALPHA,
  MASK_COLOR,
  clamp,
  exportMaskData,
  loadMaskDataToCanvas,
  normalizeMaskDimensions,
  renderMaskOverlay,
} from "../../utils/regionMask";

const MIN_EDITOR_ZOOM = 0.25;
const MAX_EDITOR_ZOOM = 8;

type RegionMaskLightboxProps = {
  node: CanvasNode;
  brushMode: "add" | "subtract";
  brushSize: number;
  brushSoftness: number;
  maskTrigger: { action: "invert" | "clear"; timestamp: number } | null;
  onBeginMaskChange: (nodeId: string) => void;
  onCommitMask: (nodeId: string, mask: MaskData | undefined) => void;
  onBrushSizeChange: (value: number) => void;
  onBrushSoftnessChange: (value: number) => void;
  onClose: () => void;
};

type Point = {
  x: number;
  y: number;
};

function getImageSource(node: CanvasNode) {
  return node.sourceImage?.url ?? node.imageUrl;
}

function drawBrushStamp(
  context: CanvasRenderingContext2D,
  point: Point,
  radius: number,
  softness: number,
  mode: "add" | "subtract",
  variant: "mask" | "overlay",
) {
  const innerRadius = radius * (1 - softness / 100);
  const gradient = context.createRadialGradient(point.x, point.y, innerRadius, point.x, point.y, radius);

  if (mode === "subtract") {
    gradient.addColorStop(0, "rgba(0, 0, 0, 1)");
    gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
    context.globalCompositeOperation = "destination-out";
  } else {
    const alpha = variant === "mask" ? 1 : MASK_ALPHA;
    const color =
      variant === "mask"
        ? "255, 255, 255"
        : `${MASK_COLOR.r}, ${MASK_COLOR.g}, ${MASK_COLOR.b}`;
    gradient.addColorStop(0, `rgba(${color}, ${alpha})`);
    gradient.addColorStop(1, `rgba(${color}, 0)`);
    context.globalCompositeOperation = "source-over";
  }

  context.fillStyle = gradient;
  context.beginPath();
  context.arc(point.x, point.y, radius, 0, Math.PI * 2);
  context.fill();
}

function drawBrushSegment(
  context: CanvasRenderingContext2D,
  from: Point,
  to: Point,
  radius: number,
  softness: number,
  mode: "add" | "subtract",
  variant: "mask" | "overlay",
) {
  const distance = Math.hypot(to.x - from.x, to.y - from.y);
  const step = Math.max(1, radius * 0.25);
  const totalSteps = Math.max(1, Math.ceil(distance / step));

  for (let index = 0; index <= totalSteps; index += 1) {
    const progress = index / totalSteps;
    drawBrushStamp(
      context,
      {
        x: from.x + (to.x - from.x) * progress,
        y: from.y + (to.y - from.y) * progress,
      },
      radius,
      softness,
      mode,
      variant,
    );
  }
}

export default function RegionMaskLightbox({
  node,
  brushMode,
  brushSize,
  brushSoftness,
  maskTrigger,
  onBeginMaskChange,
  onCommitMask,
  onBrushSizeChange,
  onBrushSoftnessChange,
  onClose,
}: RegionMaskLightboxProps) {
  const imageUrl = getImageSource(node);
  const stageRef = useRef<HTMLDivElement>(null);
  const maskCanvasRef = useRef<HTMLCanvasElement>(null);
  const overlayCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const panningRef = useRef(false);
  const lastPointRef = useRef<Point | null>(null);
  const panStartRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null);
  const [editorZoom, setEditorZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [imageSize, setImageSize] = useState(() => ({
    width: node.sourceImage?.width ?? node.width,
    height: node.sourceImage?.height ?? node.height,
  }));
  const [spacePressed, setSpacePressed] = useState(false);
  const [altPressed, setAltPressed] = useState(false);
  const [cursorState, setCursorState] = useState<{ visible: boolean; x: number; y: number }>({
    visible: false,
    x: 0,
    y: 0,
  });

  const effectiveBrushMode = altPressed ? "subtract" : brushMode;
  const maskSize = useMemo(() => {
    if (node.regionMask) {
      return {
        width: node.regionMask.width,
        height: node.regionMask.height,
      };
    }

    return normalizeMaskDimensions(imageSize.width, imageSize.height);
  }, [imageSize.height, imageSize.width, node.regionMask]);

  const fitScale = useMemo(() => {
    if (stageSize.width <= 0 || stageSize.height <= 0 || imageSize.width <= 0 || imageSize.height <= 0) {
      return 1;
    }

    return Math.min(stageSize.width / imageSize.width, stageSize.height / imageSize.height);
  }, [imageSize.height, imageSize.width, stageSize.height, stageSize.width]);

  const displayScale = fitScale * editorZoom;
  const displayWidth = imageSize.width * displayScale;
  const displayHeight = imageSize.height * displayScale;

  const resetView = useCallback(() => {
    setEditorZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  const redrawOverlayFromMask = useCallback(() => {
    const maskCanvas = maskCanvasRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    if (!maskCanvas || !overlayCanvas) return;

    renderMaskOverlay(maskCanvas, overlayCanvas);
  }, []);

  const commitCurrentMask = useCallback(() => {
    const maskCanvas = maskCanvasRef.current;
    if (!maskCanvas) return;
    onCommitMask(node.id, exportMaskData(maskCanvas));
  }, [node.id, onCommitMask]);

  const getMaskPoint = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const overlayCanvas = overlayCanvasRef.current;
    if (!overlayCanvas) return null;

    const rect = event.currentTarget.getBoundingClientRect();
    const normalizedX = (event.clientX - rect.left) / rect.width;
    const normalizedY = (event.clientY - rect.top) / rect.height;

    if (normalizedX < 0 || normalizedX > 1 || normalizedY < 0 || normalizedY > 1) {
      return null;
    }

    return {
      x: normalizedX * overlayCanvas.width,
      y: normalizedY * overlayCanvas.height,
    };
  }, []);

  const getBrushRadiusInMaskPx = useCallback(
    (rect: DOMRect) => ((brushSize / rect.width) * maskSize.width) / 2,
    [brushSize, maskSize.width],
  );

  const syncCursorPosition = useCallback((event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    setCursorState({
      visible: localX >= 0 && localX <= rect.width && localY >= 0 && localY <= rect.height,
      x: localX,
      y: localY,
    });
  }, []);

  const applyStrokeSegment = useCallback(
    (from: Point, to: Point, radius: number, mode: "add" | "subtract") => {
      const maskCanvas = maskCanvasRef.current;
      const overlayCanvas = overlayCanvasRef.current;
      if (!maskCanvas || !overlayCanvas) return;

      const maskContext = maskCanvas.getContext("2d", { willReadFrequently: true });
      const overlayContext = overlayCanvas.getContext("2d");
      if (!maskContext || !overlayContext) return;

      drawBrushSegment(maskContext, from, to, radius, brushSoftness, mode, "mask");
      drawBrushSegment(overlayContext, from, to, radius, brushSoftness, mode, "overlay");
    },
    [brushSoftness],
  );

  useEffect(() => {
    const image = new window.Image();
    image.decoding = "async";
    image.onload = () => {
      setImageSize({ width: image.naturalWidth, height: image.naturalHeight });
      resetView();
    };
    image.src = imageUrl;
  }, [imageUrl, resetView]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver(() => {
      setStageSize({
        width: stage.clientWidth,
        height: stage.clientHeight,
      });
    });

    observer.observe(stage);
    setStageSize({
      width: stage.clientWidth,
      height: stage.clientHeight,
    });

    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const maskCanvas = maskCanvasRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    if (!maskCanvas || !overlayCanvas) return;

    if (maskCanvas.width !== maskSize.width) maskCanvas.width = maskSize.width;
    if (maskCanvas.height !== maskSize.height) maskCanvas.height = maskSize.height;
    if (overlayCanvas.width !== maskSize.width) overlayCanvas.width = maskSize.width;
    if (overlayCanvas.height !== maskSize.height) overlayCanvas.height = maskSize.height;

    void loadMaskDataToCanvas(maskCanvas, node.regionMask).then(() => {
      redrawOverlayFromMask();
    });
  }, [maskSize.height, maskSize.width, node.regionMask, redrawOverlayFromMask]);

  useEffect(() => {
    if (!maskTrigger) return;

    const maskCanvas = maskCanvasRef.current;
    const overlayCanvas = overlayCanvasRef.current;
    if (!maskCanvas || !overlayCanvas) return;

    const maskContext = maskCanvas.getContext("2d", { willReadFrequently: true });
    const overlayContext = overlayCanvas.getContext("2d");
    if (!maskContext || !overlayContext) return;

    if (maskTrigger.action === "clear") {
      if (!node.regionMask?.selectionRatio) return;
      onBeginMaskChange(node.id);
      maskContext.clearRect(0, 0, maskCanvas.width, maskCanvas.height);
      overlayContext.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
      commitCurrentMask();
      return;
    }

    onBeginMaskChange(node.id);
    const imageData = maskContext.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    const pixels = imageData.data;
    for (let index = 0; index < pixels.length; index += 4) {
      pixels[index] = 255;
      pixels[index + 1] = 255;
      pixels[index + 2] = 255;
      pixels[index + 3] = 255 - pixels[index + 3];
    }
    maskContext.putImageData(imageData, 0, 0);
    redrawOverlayFromMask();
    commitCurrentMask();
  }, [commitCurrentMask, maskTrigger, node.id, node.regionMask?.selectionRatio, onBeginMaskChange, redrawOverlayFromMask]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === " ") {
        event.preventDefault();
        setSpacePressed(true);
      }

      if (event.key === "Alt") {
        setAltPressed(true);
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.key === " ") setSpacePressed(false);
      if (event.key === "Alt") setAltPressed(false);
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    window.addEventListener("keyup", handleKeyUp, { capture: true });

    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
      window.removeEventListener("keyup", handleKeyUp, { capture: true });
    };
  }, []);

  const handleCanvasPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (spacePressed) return;

    const point = getMaskPoint(event);
    if (!point) return;

    event.preventDefault();
    event.stopPropagation();
    onBeginMaskChange(node.id);
    drawingRef.current = true;
    lastPointRef.current = point;
    syncCursorPosition(event);

    const radius = getBrushRadiusInMaskPx(event.currentTarget.getBoundingClientRect());
    applyStrokeSegment(point, point, radius, effectiveBrushMode);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleCanvasPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    syncCursorPosition(event);

    if (!drawingRef.current) return;
    const point = getMaskPoint(event);
    const lastPoint = lastPointRef.current;
    if (!point || !lastPoint) return;

    event.preventDefault();
    event.stopPropagation();
    const radius = getBrushRadiusInMaskPx(event.currentTarget.getBoundingClientRect());
    applyStrokeSegment(lastPoint, point, radius, effectiveBrushMode);
    lastPointRef.current = point;
  };

  const finishStroke = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;

    event.preventDefault();
    event.stopPropagation();
    drawingRef.current = false;
    lastPointRef.current = null;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    commitCurrentMask();
  };

  const handleStagePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (!spacePressed) return;

    event.preventDefault();
    panningRef.current = true;
    panStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleStagePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (!panningRef.current || !panStartRef.current) return;

    event.preventDefault();
    setPan({
      x: panStartRef.current.panX + (event.clientX - panStartRef.current.x),
      y: panStartRef.current.panY + (event.clientY - panStartRef.current.y),
    });
  };

  const handleStagePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    event.stopPropagation();
    if (!panningRef.current) return;

    panningRef.current = false;
    panStartRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setEditorZoom((current) => clamp(Number((current + (event.deltaY < 0 ? 0.12 : -0.12)).toFixed(2)), MIN_EDITOR_ZOOM, MAX_EDITOR_ZOOM));
  };

  return (
    <div
      className="absolute inset-0 z-[130] bg-[var(--canvas-theme-canvas)]"
      data-canvas-ui="true"
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onPointerUp={(event) => event.stopPropagation()}
    >
      <div
        ref={stageRef}
        className={`relative h-full w-full overflow-hidden px-10 pb-[96px] pt-10 ${spacePressed ? "cursor-grab" : "cursor-default"}`}
        onPointerDown={handleStagePointerDown}
        onPointerMove={handleStagePointerMove}
        onPointerUp={handleStagePointerUp}
        onPointerCancel={handleStagePointerUp}
        onWheel={handleWheel}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 z-20 grid h-10 w-10 place-items-center rounded-full border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] text-[var(--canvas-theme-text)] shadow-lg shadow-[var(--canvas-theme-shadow)] transition hover:bg-[var(--canvas-theme-hover)]"
          title="Exit region mode (Esc)"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>

        <div
          className="absolute left-1/2 top-1/2"
          style={{
            transform: `translate(-50%, -50%) translate(${pan.x}px, ${pan.y}px)`,
          }}
        >
          <div
            className="relative overflow-hidden rounded-[22px] border-2 border-[#00D4FF] bg-[#0B1220] shadow-[0_30px_90px_rgba(0,0,0,0.24)]"
            style={{
              width: `${displayWidth}px`,
              height: `${displayHeight}px`,
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt={node.title}
              className="absolute inset-0 h-full w-full select-none object-fill pointer-events-none"
              draggable={false}
            />
            <canvas
              ref={overlayCanvasRef}
              className="absolute inset-0"
              style={{
                width: `${displayWidth}px`,
                height: `${displayHeight}px`,
                cursor: spacePressed ? "grab" : "none",
              }}
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handleCanvasPointerMove}
              onPointerUp={finishStroke}
              onPointerCancel={finishStroke}
              onPointerLeave={() => setCursorState((current) => ({ ...current, visible: false }))}
            />
            {cursorState.visible && !spacePressed ? (
              <div
                className="pointer-events-none absolute left-0 top-0 z-20 rounded-full border border-[rgba(15,23,42,0.55)] bg-white/5 shadow-[0_0_0_1px_rgba(255,255,255,0.2)]"
                style={{
                  width: `${brushSize}px`,
                  height: `${brushSize}px`,
                  transform: `translate(${cursorState.x - brushSize / 2}px, ${cursorState.y - brushSize / 2}px)`,
                }}
              >
                <span className="grid h-full w-full place-items-center text-sm font-bold text-white">
                  {effectiveBrushMode === "add" ? "+" : "-"}
                </span>
              </div>
            ) : null}
          </div>
        </div>

        <canvas ref={maskCanvasRef} className="hidden" />
      </div>

      <div className="pointer-events-none absolute left-5 top-5 z-20 flex gap-2">
        <div className="pointer-events-auto rounded-full border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] px-3 py-2 text-[11px] font-semibold text-[var(--canvas-theme-text-muted)] shadow-lg shadow-[var(--canvas-theme-shadow)]">
          Zoom {Math.round(editorZoom * 100)}%
        </div>
        {node.regionMask?.selectionRatio ? (
          <div className="pointer-events-auto rounded-full border border-[#22D3EE]/25 bg-[var(--canvas-theme-surface-panel)] px-3 py-2 text-[11px] font-semibold text-[#0891B2] shadow-lg shadow-[var(--canvas-theme-shadow)]">
            Mask {Math.round(node.regionMask.selectionRatio * 100)}%
          </div>
        ) : null}
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] px-3 py-2 text-[11px] font-semibold text-[var(--canvas-theme-text-muted)] shadow-lg shadow-[var(--canvas-theme-shadow)]">
          <span>Size {brushSize}px</span>
          <input
            type="range"
            min="1"
            max="500"
            value={brushSize}
            onChange={(event) => onBrushSizeChange(Number(event.target.value))}
            className="w-28 cursor-pointer accent-[var(--canvas-theme-active)]"
            aria-label="Brush size"
          />
        </div>
        <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] px-3 py-2 text-[11px] font-semibold text-[var(--canvas-theme-text-muted)] shadow-lg shadow-[var(--canvas-theme-shadow)]">
          <span>Soft {brushSoftness}%</span>
          <input
            type="range"
            min="0"
            max="100"
            value={brushSoftness}
            onChange={(event) => onBrushSoftnessChange(Number(event.target.value))}
            className="w-24 cursor-pointer accent-[var(--canvas-theme-active)]"
            aria-label="Brush softness"
          />
        </div>
        <button
          type="button"
          onClick={resetView}
          className="pointer-events-auto rounded-full border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] px-3 py-2 text-[11px] font-semibold text-[var(--canvas-theme-text)] shadow-lg shadow-[var(--canvas-theme-shadow)] transition hover:bg-[var(--canvas-theme-hover)]"
        >
          Fit
        </button>
      </div>
    </div>
  );
}
