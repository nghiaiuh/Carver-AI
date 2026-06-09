/*
 * Flow: Renders one interactive canvas workspace component.
 * 1. Receive canvas state and callbacks from the workspace.
 * 2. Render the focused control, overlay, or board UI.
 * 3. Send user actions back up through typed handlers.
 */

"use client";

import {
  Grid3X3,
  ImagePlus,
  Lock,
  MapPin,
  Minus,
  MousePointer2,
  PackagePlus,
  PenLine,
  Plus,
  Sparkles,
  Type,
} from "lucide-react";
import type { EditorTool } from "./CanvasWorkspace";

type BottomToolDockProps = {
  activeTool: EditorTool;
  gridVisible: boolean;
  zoom: number;
  onTool: (tool: EditorTool) => void;
  onToggleGrid: () => void;
  onAddObject: () => void;
  onGenerate: () => void;
  onToast: (message: string) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
};

const tools = [
  { id: "select", label: "Select", icon: MousePointer2 },
  { id: "mark-position", label: "Mark", icon: MapPin },
  { id: "add-source", label: "Source", icon: ImagePlus },
  { id: "grid", label: "Grid", icon: Grid3X3 },
  { id: "draw-region", label: "Region", icon: PenLine },
  { id: "lock-area", label: "Lock", icon: Lock },
  { id: "text-note", label: "Text", icon: Type },
  { id: "add-object", label: "Object", icon: PackagePlus },
  { id: "generate", label: "Generate", icon: Sparkles },
] as const;

export default function BottomToolDock({
  activeTool,
  gridVisible,
  zoom,
  onTool,
  onToggleGrid,
  onAddObject,
  onGenerate,
  onToast,
  onZoomIn,
  onZoomOut,
  onResetZoom,
}: BottomToolDockProps) {
  return (
    <div className="absolute bottom-7 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-3xl border border-[#E5E7EB] bg-white/95 p-2 shadow-2xl shadow-black/12 backdrop-blur">
      {tools.map((tool) => {
        const Icon = tool.icon;
        const selected = activeTool === tool.id || (tool.id === "grid" && gridVisible);
        return (
          <button
            key={tool.id}
            title={tool.label}
            onClick={(event) => {
              event.stopPropagation();
              if (tool.id === "grid") onToggleGrid();
              else if (tool.id === "add-object") onAddObject();
              else if (tool.id === "add-source") onToast("Source thumbnail added");
              else if (tool.id === "generate") onGenerate();
              else onTool(tool.id);
            }}
            className={`flex h-11 min-w-11 items-center justify-center gap-2 rounded-2xl px-3 text-sm font-black transition ${
              selected ? "bg-[#111827] text-white shadow-lg shadow-black/15" : "text-[#667085] hover:bg-[#F7F8FA] hover:text-[#111827]"
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            <span className="hidden 2xl:inline">{tool.label}</span>
          </button>
        );
      })}

      {/* Divider */}
      <span className="mx-1 h-6 w-px shrink-0 rounded-full bg-[#E5E7EB]" aria-hidden="true" />

      {/* Zoom controls */}
      <button
        title="Zoom out (Ctrl + Scroll Down)"
        onClick={(e) => { e.stopPropagation(); onZoomOut(); }}
        className="flex h-11 w-11 items-center justify-center rounded-2xl text-[#667085] transition hover:bg-[#F7F8FA] hover:text-[#111827] disabled:opacity-30"
        disabled={zoom <= 0.2}
      >
        <Minus className="h-4 w-4" aria-hidden="true" />
      </button>

      <button
        title="Reset zoom"
        onClick={(e) => { e.stopPropagation(); onResetZoom(); }}
        className="h-11 min-w-[3.5rem] rounded-2xl px-2 text-xs font-black tabular-nums text-[#667085] transition hover:bg-[#F7F8FA] hover:text-[#111827]"
      >
        {Math.round(zoom * 100)}%
      </button>

      <button
        title="Zoom in (Ctrl + Scroll Up)"
        onClick={(e) => { e.stopPropagation(); onZoomIn(); }}
        className="flex h-11 w-11 items-center justify-center rounded-2xl text-[#667085] transition hover:bg-[#F7F8FA] hover:text-[#111827] disabled:opacity-30"
        disabled={zoom >= 4}
      >
        <Plus className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
