"use client";

import { Image as ImageIcon, Map, MoveRight, Palette, PencilRuler } from "lucide-react";
import type {
  CanvasConnectionKind,
  CanvasContextGroupNode,
  CanvasNode,
  ImageHandlePosition,
} from "../../types/canvas";
import { getCanvasNodeVisualScale } from "../../utils/canvasNodePorts";
import {
  CONTEXT_GROUP_LABELS,
  getContextGroupDescription,
  resolveContextGroupItems,
} from "../../utils/contextGroupHelpers";

type CanvasContextGroupNodeCardProps = {
  node: CanvasContextGroupNode;
  allNodes: CanvasNode[];
  selected: boolean;
  isConnectionTarget?: boolean;
  onSelect: (id: string, event?: React.MouseEvent | React.PointerEvent) => void;
  onDragStart: (id: string, event: React.PointerEvent) => void;
  onSelectContextMenu: (id: string, x: number, y: number) => void;
  onStartConnection: (
    nodeId: string,
    side: ImageHandlePosition,
    kind: CanvasConnectionKind,
    event: React.PointerEvent<HTMLButtonElement>,
    sourcePortId?: string,
  ) => void;
};

function ContextGroupIcon({ kind }: { kind: CanvasContextGroupNode["contextGroup"]["kind"] }) {
  if (kind === "site-set") return <Map className="h-4 w-4" aria-hidden="true" />;
  if (kind === "sketch-layer") return <PencilRuler className="h-4 w-4" aria-hidden="true" />;
  return <Palette className="h-4 w-4" aria-hidden="true" />;
}

export default function CanvasContextGroupNodeCard({
  node,
  allNodes,
  selected,
  isConnectionTarget = false,
  onSelect,
  onDragStart,
  onSelectContextMenu,
  onStartConnection,
}: CanvasContextGroupNodeCardProps) {
  const scale = getCanvasNodeVisualScale(node);
  const width = node.width * scale;
  const height = node.height * scale;
  const items = resolveContextGroupItems(node, allNodes);
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
            <ContextGroupIcon kind={node.contextGroup.kind} />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{node.title}</p>
            <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-[var(--canvas-theme-text-muted)]">
              {CONTEXT_GROUP_LABELS[node.contextGroup.kind]}
            </p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 gap-2">
          {items.slice(0, 6).map((item) => (
            <div key={item.id} title={item.title} className="relative aspect-square overflow-hidden rounded-xl bg-[var(--canvas-theme-surface-muted)]">
              {item.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.imageUrl} alt="" className="h-full w-full object-cover" draggable={false} />
              ) : (
                <ImageIcon className="absolute inset-0 m-auto h-4 w-4 text-[var(--canvas-theme-icon-muted)]" aria-hidden="true" />
              )}
            </div>
          ))}
          {items.length === 0 ? (
            <div className="col-span-3 rounded-xl border border-dashed border-[var(--canvas-theme-border)] px-3 py-5 text-center text-xs text-[var(--canvas-theme-text-muted)]">
              Select source images, then create this context group.
            </div>
          ) : null}
        </div>

        <p className="mt-3 line-clamp-2 text-[11px] leading-4 text-[var(--canvas-theme-text-soft)]">
          {getContextGroupDescription(node)}
        </p>
      </div>

      <button
        type="button"
        title="Connect this group"
        aria-label="Connect context group"
        className="absolute right-[-16px] top-[45px] z-20 grid h-8 w-8 place-items-center rounded-full border border-[var(--canvas-theme-handle-border)] bg-[var(--canvas-theme-surface-panel)] text-[var(--canvas-theme-connection-image)] shadow-[0_8px_18px_var(--canvas-theme-shadow)] transition hover:scale-105"
        onPointerDown={(event) => {
          event.stopPropagation();
          onStartConnection(node.id, "right", "image", event, "context-group-output-image");
        }}
      >
        <MoveRight className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
