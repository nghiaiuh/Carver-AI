/*
 * Flow: Renders one interactive canvas workspace component.
 * 1. Receive canvas state and callbacks from the workspace.
 * 2. Render the focused control, overlay, or board UI.
 * 3. Send user actions back up through typed handlers.
 */

"use client";

"use client";

import { Play, ChevronDown, Link2, Crop, Trash2, MoreHorizontal, Paintbrush } from "lucide-react";
import type { EditorTool } from "../../types/canvas";

type ContextualToolbarProps = {
  itemLabel: "Image" | "Reference" | "Object" | "Assistant" | "Image Generator" | "Text note";
  viewportZoom?: number;
  onMultiAngle: () => void;
  onAddObject: () => void;
  onTool: (tool: EditorTool) => void;
  onToast: (message: string) => void;
  onDelete?: () => void;
  onRun?: () => void;
};

export default function ContextualToolbar({
  viewportZoom = 1,
  onTool,
  onToast,
  onDelete,
  onRun,
}: ContextualToolbarProps) {
  const uiScale = 1 / Math.max(viewportZoom, 0.0001);

  return (
    <div
      data-canvas-ui="true"
      className="contextual-toolbar absolute left-1/2 z-[100] flex items-center gap-1 rounded-2xl border border-[var(--canvas-theme-border-strong)] bg-[var(--canvas-theme-surface-panel)]/95 p-1.5 shadow-[0_8px_24px_var(--canvas-theme-shadow)] backdrop-blur-md"
      style={{
        top: `${-86 * uiScale}px`,
        transform: `translateX(-50%) scale(${uiScale})`,
        transformOrigin: "top center",
      }}
    >
      {/* Play / Run Action */}
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onRun ? onRun() : onToast("Running AI generation for selected node context...");
        }}
        className="flex items-center gap-1.5 rounded-xl bg-[var(--canvas-theme-active)] px-3 py-1.5 text-xs font-semibold text-[var(--canvas-theme-active-text)] shadow-sm transition hover:bg-[var(--canvas-theme-selection-hover)] active:scale-95"
      >
        <Play className="h-3.5 w-3.5 fill-current" />
        <span>Run</span>
      </button>

      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToast("Run settings");
        }}
        className="flex h-7 w-5 items-center justify-center rounded-lg text-[var(--canvas-theme-icon-muted)] transition hover:bg-[var(--canvas-theme-hover)] hover:text-[var(--canvas-theme-icon)]"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      <div className="mx-0.5 h-4 w-[1px] bg-[var(--canvas-theme-border)]" />

      {/* Region Brush */}
      <button
        type="button"
        title="Region Edit"
        onClick={(e) => {
          e.stopPropagation();
          onTool("region");
        }}
        className="flex h-7 w-7 items-center justify-center rounded-xl text-[var(--canvas-theme-icon)] transition hover:bg-[var(--canvas-theme-hover)]"
      >
        <Paintbrush className="h-3.5 w-3.5" />
      </button>

      {/* Link / Connect */}
      <button
        type="button"
        title="Connect to node"
        onClick={(e) => {
          e.stopPropagation();
          onTool("edit-elements");
        }}
        className="flex h-7 w-7 items-center justify-center rounded-xl text-[var(--canvas-theme-icon)] transition hover:bg-[var(--canvas-theme-hover)]"
      >
        <Link2 className="h-3.5 w-3.5" />
      </button>

      {/* Crop */}
      <button
        type="button"
        title="Crop node"
        onClick={(e) => {
          e.stopPropagation();
          onToast("Crop action triggered");
        }}
        className="flex h-7 w-7 items-center justify-center rounded-xl text-[var(--canvas-theme-icon)] transition hover:bg-[var(--canvas-theme-hover)]"
      >
        <Crop className="h-3.5 w-3.5" />
      </button>

      {/* Delete */}
      <button
        type="button"
        title="Delete node"
        onClick={(e) => {
          e.stopPropagation();
          onDelete ? onDelete() : onToast("Node deleted");
        }}
        className="flex h-7 w-7 items-center justify-center rounded-xl text-[var(--canvas-theme-danger)] transition hover:bg-[var(--canvas-theme-danger-soft)]"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>

      {/* More Options */}
      <button
        type="button"
        title="More options"
        onClick={(e) => {
          e.stopPropagation();
          onToast("More node actions");
        }}
        className="flex h-7 w-7 items-center justify-center rounded-xl text-[var(--canvas-theme-icon)] transition hover:bg-[var(--canvas-theme-hover)]"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
    </div>
  );
}
