"use client";

import type { PenStrokeObject } from "../core/CanvasWorkspace";

type Point = {
  x: number;
  y: number;
};

type PenStrokeLayerProps = {
  strokes: PenStrokeObject[];
  draftStroke: PenStrokeObject | null;
  activeTool: string;
  eraserPreview: {
    x: number;
    y: number;
    size: number;
    visible: boolean;
  };
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
    const midX = (current.x + next.x) / 2;
    const midY = (current.y + next.y) / 2;

    path += ` Q ${current.x} ${current.y} ${midX} ${midY}`;
  }

  const last = points[points.length - 1];
  path += ` L ${last.x} ${last.y}`;

  return path;
}

function getPenStrokeBounds(stroke: PenStrokeObject) {
  const xs = stroke.points.map((point) => point.x);
  const ys = stroke.points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const padding = stroke.strokeWidth / 2 + 6;

  return {
    x: minX - padding,
    y: minY - padding,
    width: Math.max(maxX - minX + padding * 2, 12),
    height: Math.max(maxY - minY + padding * 2, 12),
  };
}

function StrokePath({
  stroke,
  selected,
}: {
  stroke: PenStrokeObject;
  selected: boolean;
}) {
  return (
    <path
      d={buildSmoothPath(stroke.points)}
      fill="none"
      stroke={selected ? "#1F7AFF" : stroke.color}
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
        {strokes.map((stroke) => (
          <StrokePath key={stroke.id} stroke={stroke} selected={selectedStrokeId === stroke.id} />
        ))}
        {draftStroke ? <StrokePath stroke={draftStroke} selected={false} /> : null}
      </svg>

      {activeTool === "select"
        ? strokes.map((stroke) => {
            const bounds = getPenStrokeBounds(stroke);

            return (
              <button
                key={`${stroke.id}-hitbox`}
                type="button"
                className="pointer-events-auto absolute cursor-pointer rounded-md bg-transparent"
                style={{
                  left: bounds.x,
                  top: bounds.y,
                  width: bounds.width,
                  height: bounds.height,
                  outline: selectedStrokeId === stroke.id ? "1px dashed rgba(31,122,255,0.65)" : "none",
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
          className="pointer-events-none absolute border border-[rgba(17,24,39,0.45)] bg-transparent shadow-[0_0_0_1px_rgba(255,255,255,0.7)]"
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
