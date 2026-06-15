/*
 * Flow: Renders one interactive canvas workspace component.
 * 1. Receive canvas state and callbacks from the workspace.
 * 2. Render the focused control, overlay, or board UI.
 * 3. Send user actions back up through typed handlers.
 */

"use client";

import { useState } from "react";
import type { EditorTool, SelectedItem, SketchGroup, SketchLine, SketchPoint } from "../../types/canvas";

type SketchLayerProps = {
  activeTool: EditorTool;
  selectedItem: SelectedItem;
  sketchLines: SketchLine[];
  sketchGroups: SketchGroup[];
  selectedSketchLineIds: string[];
  onAddLine: (line: SketchLine) => void;
  onSelectLine: (id: string, additive: boolean) => void;
  onSelectGroup: (id: string) => void;
};

const pointString = (points: SketchPoint[]) => points.map((point) => `${point.x},${point.y}`).join(" ");

const toPercentPoint = (event: React.PointerEvent<SVGSVGElement>): SketchPoint => {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * 100,
    y: ((event.clientY - rect.top) / rect.height) * 100,
  };
};

export default function SketchLayer({
  activeTool,
  selectedItem,
  sketchLines,
  sketchGroups,
  selectedSketchLineIds,
  onAddLine,
  onSelectLine,
  onSelectGroup,
}: SketchLayerProps) {
  const [draftPoints, setDraftPoints] = useState<SketchPoint[]>([]);
  const drawing = activeTool === "pen";

  const startDrawing = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!drawing) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraftPoints([toPercentPoint(event)]);
  };

  const continueDrawing = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!drawing || draftPoints.length === 0) return;
    event.stopPropagation();
    const nextPoint = toPercentPoint(event);
    setDraftPoints((points) => [...points, nextPoint]);
  };

  const finishDrawing = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!drawing || draftPoints.length < 2) {
      setDraftPoints([]);
      return;
    }

    event.stopPropagation();
    onAddLine({
      id: `sketch-line-${Date.now()}`,
      points: draftPoints,
      color: "#2563EB",
      width: 1.8,
    });
    setDraftPoints([]);
  };

  return (
    <svg
      className={`absolute inset-0 z-30 h-full w-full ${drawing ? "cursor-crosshair" : "pointer-events-none"}`}
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      onPointerDown={startDrawing}
      onPointerMove={continueDrawing}
      onPointerUp={finishDrawing}
      onPointerCancel={() => setDraftPoints([])}
    >
      {sketchGroups.map((group) => {
        const selected = selectedItem.type === "sketchGroup" && selectedItem.id === group.id;
        return (
          <g key={group.id} className="pointer-events-auto cursor-pointer" onClick={() => onSelectGroup(group.id)}>
            <rect
              x={group.bounds.x}
              y={group.bounds.y}
              width={group.bounds.w}
              height={group.bounds.h}
              rx={2}
              fill="transparent"
              stroke={selected ? "#111827" : "#22C55E"}
              strokeDasharray="2 1.6"
              strokeWidth={0.45}
            />
            <text x={group.bounds.x} y={Math.max(group.bounds.y - 1.5, 3)} fontSize="2.7" fontWeight="800" fill={selected ? "#111827" : "#15803D"}>
              {group.nameTag}
            </text>
          </g>
        );
      })}

      {sketchLines.map((line) => {
        const selected = selectedSketchLineIds.includes(line.id) || (selectedItem.type === "sketchLine" && selectedItem.id === line.id);
        return (
          <polyline
            key={line.id}
            points={pointString(line.points)}
            fill="none"
            stroke={selected ? "#F97316" : line.groupId ? "#16A34A" : line.color}
            strokeWidth={selected ? line.width + 0.8 : line.width}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
            className="pointer-events-auto cursor-pointer"
            onClick={(event) => {
              event.stopPropagation();
              onSelectLine(line.id, event.shiftKey);
            }}
          />
        );
      })}

      {draftPoints.length > 1 ? (
        <polyline
          points={pointString(draftPoints)}
          fill="none"
          stroke="#2563EB"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      ) : null}
    </svg>
  );
}
