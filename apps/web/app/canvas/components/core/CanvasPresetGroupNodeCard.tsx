"use client";

import { ArrowLeft, ArrowRight, FolderClosed, Link2, MoveRight, Star, X } from "lucide-react";
import type { CanvasEdge, CanvasPresetGroupNode, ImageHandlePosition, SelectedItem } from "../../types/canvas";
import { getPresetChildRects, sortPresetChildren } from "../../utils/presetGroup";

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
  onStartConnection: (nodeId: string, handle: ImageHandlePosition, event: React.PointerEvent<HTMLButtonElement>) => void;
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
  onSelectContextMenu,
  onDelete,
  onPresetChildHover,
}: CanvasPresetGroupNodeCardProps) {
  const uiScale = 1 / viewportZoom;
  const objectScale = node.scale ?? 1;
  const displayWidth = node.width * objectScale;
  const displayHeight = node.height * objectScale;
  const childRects = getPresetChildRects(node);
  const activeChildId = node.presetGroup.activeChildId;
  const activeChild =
    node.presetGroup.children.find((child) => child.id === activeChildId) ??
    sortPresetChildren(node.presetGroup.children)[0] ??
    null;

  // Connection handle style — same sizing/appearance as CanvasNodeCard handles
  const handleBaseClass = [
    "absolute top-1/2 z-20 flex h-7 w-4 -translate-y-1/2 cursor-crosshair items-center justify-center",
    "rounded-full border border-[#CBD5E1] bg-white shadow-sm transition",
    "opacity-0 group-hover:opacity-100",
    "hover:border-[#22D3EE] hover:bg-[#F0FDFE]",
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
        zIndex: selected ? 80 : 10,
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
      {/* Left connection handle */}
      <button
        type="button"
        title="Drag to connect"
        aria-label="Connect from left"
        className={handleBaseClass}
        style={{ left: -8 }}
        onPointerDown={(event) => {
          event.stopPropagation();
          onStartConnection(node.id, "left", event);
        }}
      >
        <MoveRight className="h-2.5 w-2.5 rotate-180 text-[#94A3B8]" aria-hidden="true" />
      </button>

      {/* Right connection handle */}
      <button
        type="button"
        title="Drag to connect"
        aria-label="Connect from right"
        className={handleBaseClass}
        style={{ right: -8 }}
        onPointerDown={(event) => {
          event.stopPropagation();
          onStartConnection(node.id, "right", event);
        }}
      >
        <MoveRight className="h-2.5 w-2.5 text-[#94A3B8]" aria-hidden="true" />
      </button>

      <div
        className={[
          "relative h-full overflow-hidden rounded-[28px] border bg-[#F7F8FA] shadow-[0_22px_48px_rgba(15,23,42,0.08)] transition",
          selected
            ? "border-[#22D3EE] ring-4 ring-[#22D3EE]/15"
            : isConnectionTarget
              ? "border-[#22D3EE] ring-4 ring-[#22D3EE]/10"
              : "border-[var(--canvas-theme-border)] hover:border-[var(--canvas-theme-border-strong)]",
        ].join(" ")}
      >
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-white via-[#F7F8FA] to-transparent" />

        {childRects.map((rect) => {
          const isActive = rect.child.id === activeChildId;
          const isSelectedChild =
            selectedItem.type === "presetChild" &&
            selectedItem.nodeId === node.id &&
            selectedItem.childId === rect.child.id;
          const isLinked = edges.some(
            (edge) =>
              edge.sourceId === node.id ||
              (edge.targetId === node.id && edge.targetPresetChildId === rect.child.id),
          );
          const isHovered = hoveredPresetChildId === rect.child.id;

          return (
            <button
              key={rect.child.id}
              type="button"
              title={`${rect.child.slot}: ${rect.child.label}`}
              className={[
                "absolute overflow-hidden rounded-2xl border bg-white shadow-sm transition",
                isActive ? "border-[#22D3EE] ring-2 ring-[#22D3EE]/20" : "border-white/80 hover:border-[#CBD5E1]",
                isHovered ? "ring-2 ring-[#22D3EE]/25 scale-105" : "",
                isSelectedChild ? "shadow-[0_0_0_2px_rgba(34,211,238,0.25)]" : "",
              ].join(" ")}
              style={{
                left: rect.x - node.x,
                top: rect.y - node.y,
                width: rect.width,
                height: rect.height,
                transition: "transform 120ms ease, box-shadow 120ms ease",
              }}
              onPointerDown={(event) => {
                event.stopPropagation();
              }}
              onClick={(event) => {
                event.stopPropagation();
                onSetActivePresetChild(node.id, rect.child.id);
                onSelectPresetChild(node.id, rect.child.id);
              }}
              onMouseEnter={() => onPresetChildHover?.(rect.child.id)}
              onMouseLeave={() => onPresetChildHover?.(null)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={rect.child.imageSrc} alt={rect.child.label} className="h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />

              {/* Label at bottom */}
              <div className="absolute inset-x-0 bottom-0 px-1.5 py-1 text-center">
                <p className="line-clamp-2 text-[9px] font-semibold leading-tight text-white">
                  {rect.child.label}
                </p>
              </div>

              {/* Slot badge — visible on hover */}
              <div className="absolute left-1 top-1 rounded-full bg-black/55 px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-[0.08em] text-white opacity-0 transition group-hover:opacity-100">
                {rect.child.slot}
              </div>

              {/* Linked indicator */}
              {isLinked ? (
                <div className="absolute right-1.5 top-1.5 grid h-4 w-4 place-items-center rounded-full bg-[#DBEAFE] text-[#1D4ED8]">
                  <Link2 className="h-2.5 w-2.5" aria-hidden="true" />
                </div>
              ) : null}

              {/* Active star */}
              {isActive ? (
                <div className="absolute bottom-1.5 right-1.5 grid h-4 w-4 place-items-center rounded-full bg-[#22D3EE] text-white">
                  <Star className="h-2.5 w-2.5 fill-current" aria-hidden="true" />
                </div>
              ) : null}

              {/* Remove button */}
              <div
                role="button"
                tabIndex={0}
                className="absolute right-1 top-1 grid h-4 w-4 place-items-center rounded-full bg-black/55 text-white opacity-0 transition hover:bg-black/80 group-hover:opacity-100"
                onClick={(event) => {
                  event.stopPropagation();
                  onRemovePresetChild(node.id, rect.child.id);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.stopPropagation();
                    onRemovePresetChild(node.id, rect.child.id);
                  }
                }}
                title="Remove preset"
              >
                <X className="h-2.5 w-2.5" aria-hidden="true" />
              </div>
            </button>
          );
        })}

        {/* Folder info bar at bottom */}
        <div className="absolute inset-x-0 bottom-0 p-4">
          <div className="rounded-[24px] border border-[#DCE3EC] bg-white/92 px-4 py-4 backdrop-blur">
            <div className="flex items-center gap-3">
              <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[#EFF6FF] text-[#1D4ED8]">
                <FolderClosed className="h-8 w-8" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--canvas-theme-text-muted)]">
                  {node.presetGroup.category}
                </p>
                <h3 className="truncate text-base font-semibold tracking-[-0.02em] text-[var(--canvas-theme-text)]">
                  {node.title}
                </h3>
                <p className="text-xs text-[var(--canvas-theme-text-muted)]">
                  {node.presetGroup.children.length} preset{node.presetGroup.children.length === 1 ? "" : "s"} linked
                </p>
              </div>

              {/* Delete button — shown when selected */}
              {selected ? (
                <button
                  type="button"
                  title="Delete folder node"
                  className="grid h-8 w-8 shrink-0 place-items-center rounded-xl border border-[#FEE2E2] bg-[#FEF2F2] text-[#B42318] transition hover:bg-[#FEE2E2]"
                  style={{
                    transform: `scale(${uiScale})`,
                    transformOrigin: "center",
                  }}
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(node.id);
                  }}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              ) : null}
            </div>

            {/* Active child inspector — shown when selected */}
            {selected && activeChild ? (
              <div
                className="mt-3 rounded-2xl border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-soft)] p-3"
                style={{
                  transform: `scale(${uiScale})`,
                  transformOrigin: "top left",
                  width: `${100 / uiScale}%`,
                }}
              >
                <p className="truncate text-xs font-semibold text-[var(--canvas-theme-text)]">
                  Active: {activeChild.label}
                </p>
                <p className="truncate text-[11px] text-[var(--canvas-theme-text-muted)]">
                  Slot: {activeChild.slot}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    className="grid h-8 w-8 place-items-center rounded-xl border border-[var(--canvas-theme-border)] bg-white text-[var(--canvas-theme-text)]"
                    onClick={(event) => {
                      event.stopPropagation();
                      onMovePresetChild(node.id, activeChild.id, "left");
                    }}
                    title="Move preset left"
                  >
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="grid h-8 w-8 place-items-center rounded-xl border border-[var(--canvas-theme-border)] bg-white text-[var(--canvas-theme-text)]"
                    onClick={(event) => {
                      event.stopPropagation();
                      onMovePresetChild(node.id, activeChild.id, "right");
                    }}
                    title="Move preset right"
                  >
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-8 items-center rounded-xl border border-[var(--canvas-theme-border)] bg-white px-3 text-[11px] font-semibold text-[#B42318]"
                    onClick={(event) => {
                      event.stopPropagation();
                      onRemovePresetChild(node.id, activeChild.id);
                    }}
                  >
                    Remove active
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
