"use client";

import {
  Grid3X3,
  ImagePlus,
  Lock,
  MapPin,
  MousePointer2,
  PackagePlus,
  PenLine,
  Sparkles,
  Type,
} from "lucide-react";
import type { EditorTool } from "./CanvasWorkspace";

type BottomToolDockProps = {
  activeTool: EditorTool;
  gridVisible: boolean;
  onTool: (tool: EditorTool) => void;
  onToggleGrid: () => void;
  onAddObject: () => void;
  onGenerate: () => void;
  onToast: (message: string) => void;
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
  onTool,
  onToggleGrid,
  onAddObject,
  onGenerate,
  onToast,
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
    </div>
  );
}
