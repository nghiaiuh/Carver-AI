"use client";

import { Camera, MoveRight } from "lucide-react";
import type {
  CanvasCameraShotPreset,
  CanvasCameraShotSetNode,
  CanvasConnectionKind,
  ImageHandlePosition,
} from "../../types/canvas";
import { getCanvasNodeVisualScale } from "../../utils/canvasNodePorts";

type CanvasCameraShotSetNodeCardProps = {
  node: CanvasCameraShotSetNode;
  selected: boolean;
  isConnectionTarget?: boolean;
  onSelect: (id: string, event?: React.MouseEvent | React.PointerEvent) => void;
  onDragStart: (id: string, event: React.PointerEvent) => void;
  onSelectContextMenu: (id: string, x: number, y: number) => void;
  onToggleShot: (nodeId: string, shotId: CanvasCameraShotPreset) => void;
  onStartConnection: (
    nodeId: string,
    side: ImageHandlePosition,
    kind: CanvasConnectionKind,
    event: React.PointerEvent<HTMLButtonElement>,
    sourcePortId?: string,
  ) => void;
};

export default function CanvasCameraShotSetNodeCard({
  node,
  selected,
  isConnectionTarget = false,
  onSelect,
  onDragStart,
  onSelectContextMenu,
  onToggleShot,
  onStartConnection,
}: CanvasCameraShotSetNodeCardProps) {
  const scale = getCanvasNodeVisualScale(node);
  const width = node.width * scale;
  const height = node.height * scale;
  const frameClass = selected
    ? "border-[var(--canvas-theme-selection)] ring-2 ring-[var(--canvas-theme-selection-ring)]"
    : isConnectionTarget
      ? "border-[var(--canvas-theme-connector-active)] ring-2 ring-[var(--canvas-theme-guide-soft)]"
      : "border-[var(--canvas-theme-border-strong)] hover:border-[var(--canvas-theme-selection)]";

  return (
    <div
      data-canvas-node-id={node.id}
      className="group absolute select-none"
      style={{ left: node.x, top: node.y, width, height, zIndex: selected ? 80 : 5 }}
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
      <div className={`relative h-full w-full overflow-hidden rounded-2xl border bg-[var(--canvas-theme-surface-panel)]/96 p-3 shadow-[0_10px_26px_var(--canvas-theme-shadow)] ${frameClass}`}>
        <div className="flex items-center gap-2 text-[var(--canvas-theme-text)]">
          <span className="grid h-7 w-7 place-items-center rounded-xl bg-[var(--canvas-theme-selection-soft)] text-[var(--canvas-theme-selection)]">
            <Camera className="h-4 w-4" aria-hidden="true" />
          </span>
          <div>
            <p className="text-sm font-semibold">{node.title}</p>
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--canvas-theme-text-muted)]">Camera Planner 2.5D</p>
          </div>
        </div>

        <p className="mt-3 text-[11px] leading-4 text-[var(--canvas-theme-text-soft)]">
          Select a shot to pass a precise camera instruction into a connected AI node.
        </p>

        <div className="mt-3 grid grid-cols-2 gap-1.5">
          {node.cameraShotSet.shots.map((shot) => (
            <button
              key={shot.id}
              type="button"
              aria-pressed={shot.selected}
              title={shot.instruction}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onToggleShot(node.id, shot.id);
              }}
              className={`rounded-xl border px-2 py-1.5 text-left text-[10px] font-semibold transition ${
                shot.selected
                  ? "border-[var(--canvas-theme-selection)] bg-[var(--canvas-theme-selection-soft)] text-[var(--canvas-theme-selection)]"
                  : "border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-muted)] text-[var(--canvas-theme-text-soft)] hover:bg-[var(--canvas-theme-hover)]"
              }`}
            >
              {shot.label}
            </button>
          ))}
        </div>
      </div>

      <button
        type="button"
        title="Connect camera plan"
        aria-label="Connect camera plan"
        className="absolute right-[-16px] top-[45px] z-20 grid h-8 w-8 place-items-center rounded-full border border-[var(--canvas-theme-handle-border)] bg-[var(--canvas-theme-surface-panel)] text-[var(--canvas-theme-connection-text)] shadow-[0_8px_18px_var(--canvas-theme-shadow)] transition hover:scale-105"
        onPointerDown={(event) => {
          event.stopPropagation();
          onStartConnection(node.id, "right", "text", event, "camera-shot-set-output-text");
        }}
      >
        <MoveRight className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
