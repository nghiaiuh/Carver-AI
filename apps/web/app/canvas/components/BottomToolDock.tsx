/*
 * Flow: Renders one interactive canvas workspace component.
 * 1. Receive canvas state and callbacks from the workspace.
 * 2. Render the focused control, overlay, or board UI.
 * 3. Send user actions back up through typed handlers.
 */

"use client";

import {
  Circle,
  Cloud,
  Layers,
  Grid3X3,
  ImagePlus,
  MapPin,
  MousePointer2,
  Pencil,
  SlidersHorizontal,
  Sparkles,
  Square,
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
  { id: "draw-region", label: "Shape", icon: Square },
  { id: "pen", label: "Pen", icon: Pencil },
  { id: "text-note", label: "Text", icon: Type },
  { id: "add-object", label: "Object", icon: Sparkles },
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
  onResetZoom,
}: BottomToolDockProps) {
  const zoomLabel = `${Math.round(zoom * 100)}%`;

  return (
    <>
      <div className="absolute bottom-6 left-6 z-50 flex items-center gap-2 text-[#666]">
        <div className="flex h-8 items-center gap-2 rounded-full bg-white px-2">
          <DockIcon label="Select frame" icon={Circle} onClick={onResetZoom} />
          <DockIcon label="Layers" icon={Layers} onClick={() => onToast("Layers")} />
          <DockIcon label="Cloud sync" icon={Cloud} onClick={() => onToast("Synced")} />
          <button
            type="button"
            title="Controls"
            onClick={(event) => {
              event.stopPropagation();
              onToast("Canvas controls");
            }}
            className="grid h-9 w-9 place-items-center rounded-xl bg-[#EDEDED] text-[#555]"
          >
            <SlidersHorizontal className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
        </div>
        <span className="h-5 w-px bg-[#E6E6E6]" aria-hidden="true" />
        <button
          type="button"
          title="Reset zoom"
          onClick={(event) => {
            event.stopPropagation();
            onResetZoom();
          }}
          className="rounded-full px-2 text-xs font-medium tabular-nums text-[#666] hover:bg-[#F5F5F5]"
        >
          {zoomLabel}
        </button>
      </div>

      <div className="absolute bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1 rounded-2xl border border-[#E5E7EB] bg-white p-1.5 shadow-[0_2px_14px_rgba(0,0,0,0.08)]">
        {tools.map((tool, index) => {
          const Icon = tool.icon;
          const selected = activeTool === tool.id || (tool.id === "grid" && gridVisible);
          const needsDivider = index === 5 || index === 6;
          return (
            <div key={tool.id} className="flex items-center">
              {needsDivider ? <span className="mx-1.5 h-6 w-px bg-[#ECECEC]" aria-hidden="true" /> : null}
              <button
                type="button"
                title={tool.label}
                onClick={(event) => {
                  event.stopPropagation();
                  if (tool.id === "grid") onToggleGrid();
                  else if (tool.id === "add-object") onAddObject();
                  else if (tool.id === "add-source") onToast("Source thumbnail added");
                  else if (tool.id === "generate") onGenerate();
                  else onTool(tool.id);
                }}
                className={[
                  "grid h-9 w-9 place-items-center rounded-xl transition",
                  selected ? "bg-[#232323] text-white" : "text-[#3D3D3D] hover:bg-[#F5F5F5]",
                ].join(" ")}
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}

function DockIcon({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof Circle;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={label}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      className="grid h-7 w-7 place-items-center rounded-full text-[#666] transition hover:bg-[#F5F5F5] hover:text-[#111]"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
