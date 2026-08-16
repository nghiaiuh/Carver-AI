"use client";

import {
  CANVAS_GROUP_COLOR_OPTIONS,
  type CanvasNodeGroup,
} from "../../utils/canvasNodeGroups";
import {
  getGroupPortButtonLayout,
  GROUP_OUTPUT_IMAGE_PORT_ID,
} from "../../utils/canvasGroupPorts";
import CanvasConnectionPortHandle from "./CanvasConnectionPortHandle";

type CanvasNodeGroupFrameProps = {
  group: CanvasNodeGroup;
  selected: boolean;
  onPointerDown: (groupId: string, event: React.PointerEvent<HTMLDivElement>) => void;
  onStartConnection: (groupId: string, event: React.PointerEvent<HTMLButtonElement>) => void;
};

/** Visual container, style toolbar, and shared image output port for a node group. */
export default function CanvasNodeGroupFrame({
  group,
  selected,
  onPointerDown,
  onStartConnection,
}: CanvasNodeGroupFrameProps) {
  const activeColor = CANVAS_GROUP_COLOR_OPTIONS.find((color) => color.id === group.color) ?? CANVAS_GROUP_COLOR_OPTIONS[0];
  const outputPortLayout = getGroupPortButtonLayout(group, GROUP_OUTPUT_IMAGE_PORT_ID);
  const frameClass = selected
    ? "border-[var(--canvas-theme-selection)] ring-2 ring-[var(--canvas-theme-selection-ring)]"
    : "border-[var(--canvas-theme-border-strong)]";

  return (
    <div
      className="pointer-events-none absolute"
      style={{ left: group.bounds.x, top: group.bounds.y, width: group.bounds.width, height: group.bounds.height }}
      aria-label={`${group.label}, ${group.nodeIds.length} items`}
    >
      <div
        className={`pointer-events-auto absolute inset-0 z-0 rounded-2xl border shadow-[0_8px_24px_var(--canvas-theme-shadow)] ${selected ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"} ${frameClass}`}
        style={{ background: `color-mix(in srgb, ${activeColor.accent} 12%, var(--canvas-theme-surface-panel))` }}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          onPointerDown(group.id, event);
        }}
        onClick={(event) => event.stopPropagation()}
      />

      <div className="absolute -top-6 left-0 z-[3] flex items-center gap-1.5 rounded-lg bg-[var(--canvas-theme-surface-panel)] px-2 py-1 text-[10px] font-semibold text-[var(--canvas-theme-text)] shadow-sm">
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: activeColor.accent }} />
        <span className="max-w-40 truncate">{group.label}</span>
        <span className="text-[var(--canvas-theme-text-muted)]">{group.nodeIds.length}</span>
      </div>

      {selected && outputPortLayout ? (
        <div
          className="pointer-events-auto absolute z-20"
          style={{
            left: outputPortLayout.left,
            top: outputPortLayout.top,
            width: outputPortLayout.size,
            height: outputPortLayout.size,
            transform: "translate(-50%, -50%)",
          }}
        >
          <CanvasConnectionPortHandle
            ariaLabel={`Connect ${group.label}`}
            kind="image"
            selected={selected}
            active={selected}
            title="Connect grouped images"
            onPointerDown={(event) => onStartConnection(group.id, event)}
          />
        </div>
      ) : null}
    </div>
  );
}
