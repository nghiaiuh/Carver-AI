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
  itemLabel: "Image" | "Reference" | "Object" | "Assistant";
  viewportZoom?: number;
  onQuickEdit: () => void;
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
  const uiScale = 1 / viewportZoom;

  return (
    <div
      className="contextual-toolbar absolute left-1/2 z-[100] flex items-center gap-1 rounded-2xl border border-[#E5E3DC] bg-white/95 p-1.5 shadow-[0_8px_24px_rgba(0,0,0,0.08)] backdrop-blur-md"
      style={{
        top: `${-56 * uiScale}px`,
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
        className="flex items-center gap-1.5 rounded-xl bg-[#1A1918] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-[#2C2A26] active:scale-95"
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
        className="flex h-7 w-5 items-center justify-center rounded-lg text-[#827E75] hover:bg-[#F2F0E9]"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>

      <div className="h-4 w-[1px] bg-[#E5E3DC] mx-0.5" />

      {/* Region Brush */}
      <button
        type="button"
        title="Region Edit"
        onClick={(e) => {
          e.stopPropagation();
          onTool("region");
        }}
        className="flex h-7 w-7 items-center justify-center rounded-xl text-[#4A4843] transition hover:bg-[#F2F0E9]"
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
        className="flex h-7 w-7 items-center justify-center rounded-xl text-[#4A4843] transition hover:bg-[#F2F0E9]"
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
        className="flex h-7 w-7 items-center justify-center rounded-xl text-[#4A4843] transition hover:bg-[#F2F0E9]"
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
        className="flex h-7 w-7 items-center justify-center rounded-xl text-rose-600 transition hover:bg-rose-50"
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
        className="flex h-7 w-7 items-center justify-center rounded-xl text-[#4A4843] transition hover:bg-[#F2F0E9]"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
    </div>
  );
}
