"use client";

import type { PenGeometryShape, PenStrokeObject } from "../../types/canvas";

type Point = { x: number; y: number };

type PenStrokeLayerProps = {
  strokes: PenStrokeObject[];
  draftStroke: PenStrokeObject | null;
  activeTool: string;
  eraserPreview: { x: number; y: number; size: number; visible: boolean };
  selectedStrokeId: string | null;
  onSelectStroke: (strokeId: string) => void;
};

function buildSmoothPath(points: Point[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    path += ` Q ${current.x} ${current.y} ${(current.x + next.x) / 2} ${(current.y + next.y) / 2}`;
  }

  const last = points[points.length - 1];
  return `${path} L ${last.x} ${last.y}`;
}

function getPenStrokeBounds(stroke: PenStrokeObject) {
  const xs = stroke.points.map((point) => point.x);
  const ys = stroke.points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padding = stroke.strokeWidth / 2 + 8;

  return {
    x: minX - padding,
    y: minY - padding,
    width: Math.max(maxX - minX + padding * 2, 16),
    height: Math.max(maxY - minY + padding * 2, 16),
  };
}

function normalizedBounds(start: Point, end: Point, shape: PenGeometryShape) {
  const rawWidth = end.x - start.x;
  const rawHeight = end.y - start.y;
  const size = Math.max(Math.abs(rawWidth), Math.abs(rawHeight));
  const resolvedEnd =
    shape === "square"
      ? {
          x: start.x + Math.sign(rawWidth || 1) * size,
          y: start.y + Math.sign(rawHeight || 1) * size,
        }
      : end;

  return {
    left: Math.min(start.x, resolvedEnd.x),
    top: Math.min(start.y, resolvedEnd.y),
    width: Math.abs(resolvedEnd.x - start.x),
    height: Math.abs(resolvedEnd.y - start.y),
  };
}

function GeometryStroke({ stroke, selected }: { stroke: PenStrokeObject; selected: boolean }) {
  const start = stroke.points[0];
  const end = stroke.points.at(-1) ?? start;
  const shape = stroke.geometryShape ?? "rectangle";
  const bounds = normalizedBounds(start, end, shape);
  const common = {
    fill: "none",
    stroke: selected ? "var(--canvas-theme-selection)" : stroke.color,
    strokeOpacity: selected ? 1 : stroke.opacity,
    strokeWidth: selected ? stroke.strokeWidth + 2 : stroke.strokeWidth,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  if (shape === "line") return <line {...common} x1={start.x} y1={start.y} x2={end.x} y2={end.y} />;
  if (shape === "circle") {
    return <ellipse {...common} cx={bounds.left + bounds.width / 2} cy={bounds.top + bounds.height / 2} rx={bounds.width / 2} ry={bounds.height / 2} />;
  }
  if (shape === "triangle") {
    const apexX = bounds.left + bounds.width / 2;
    return <path {...common} d={`M ${apexX} ${bounds.top} L ${bounds.left + bounds.width} ${bounds.top + bounds.height} L ${bounds.left} ${bounds.top + bounds.height} Z`} />;
  }
  if (shape === "arrow") {
    const angle = Math.atan2(end.y - start.y, end.x - start.x);
    const headLength = Math.min(28, Math.max(10, Math.hypot(end.x - start.x, end.y - start.y) * 0.2));
    const headA = {
      x: end.x - headLength * Math.cos(angle - Math.PI / 6),
      y: end.y - headLength * Math.sin(angle - Math.PI / 6),
    };
    const headB = {
      x: end.x - headLength * Math.cos(angle + Math.PI / 6),
      y: end.y - headLength * Math.sin(angle + Math.PI / 6),
    };
    return <path {...common} d={`M ${start.x} ${start.y} L ${end.x} ${end.y} M ${headA.x} ${headA.y} L ${end.x} ${end.y} L ${headB.x} ${headB.y}`} />;
  }

  return <rect {...common} x={bounds.left} y={bounds.top} width={bounds.width} height={bounds.height} />;
}

function StrokePath({ stroke, selected }: { stroke: PenStrokeObject; selected: boolean }) {
  if (stroke.drawingMode === "geometry") {
    return <GeometryStroke stroke={stroke} selected={selected} />;
  }

  return (
    <path
      d={buildSmoothPath(stroke.points)}
      fill="none"
      stroke={selected ? "var(--canvas-theme-selection)" : stroke.color}
      strokeOpacity={selected ? 1 : stroke.opacity}
      strokeWidth={selected ? stroke.strokeWidth + 2 : stroke.strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  );
}

export default function PenStrokeLayer({
  strokes,
  draftStroke,
  activeTool,
  eraserPreview,
  selectedStrokeId,
  onSelectStroke,
}: PenStrokeLayerProps) {
  return (
    <>
      <svg className="pointer-events-none absolute inset-0 overflow-visible">
        {strokes.map((stroke) => <StrokePath key={stroke.id} stroke={stroke} selected={selectedStrokeId === stroke.id} />)}
        {draftStroke ? <StrokePath stroke={draftStroke} selected={false} /> : null}
      </svg>

      {activeTool === "select"
        ? strokes.map((stroke) => {
            const bounds = getPenStrokeBounds(stroke);
            return (
              <button
                key={`${stroke.id}-hitbox`}
                type="button"
                aria-label="Select drawing"
                className="pointer-events-auto absolute cursor-pointer rounded-xl bg-transparent"
                style={{
                  left: bounds.x,
                  top: bounds.y,
                  width: bounds.width,
                  height: bounds.height,
                  outline: selectedStrokeId === stroke.id ? "1px dashed var(--canvas-theme-selection)" : "none",
                  outlineOffset: 2,
                }}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectStroke(stroke.id);
                }}
              />
            );
          })
        : null}

      {activeTool === "eraser" && eraserPreview.visible ? (
        <div
          className="pointer-events-none absolute border border-[var(--canvas-theme-selection)] bg-transparent shadow-[0_0_0_1px_var(--canvas-theme-surface-panel)]"
          style={{
            left: eraserPreview.x - eraserPreview.size / 2,
            top: eraserPreview.y - eraserPreview.size / 2,
            width: eraserPreview.size,
            height: eraserPreview.size,
          }}
        />
      ) : null}
    </>
  );
}
