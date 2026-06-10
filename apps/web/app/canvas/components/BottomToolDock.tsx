/*
 * Flow: Renders one interactive canvas workspace component.
 * 1. Receive canvas state and callbacks from the workspace.
 * 2. Render the focused control, overlay, or board UI.
 * 3. Send user actions back up through typed handlers.
 */

"use client";

import { useMemo, useState } from "react";
import {
  Box,
  Layers,
  Grid3X3,
  Image,
  ImagePlus,
  Library,
  Map,
  MapPin,
  MousePointer2,
  Pencil,
  SlidersHorizontal,
  Square,
  Type,
  WandSparkles,
  X,
  type LucideIcon,
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
  canvasBackgroundColor: string;
  onCanvasBackgroundChange: (color: string) => void;
};

const tools = [
  { id: "select", label: "Select", icon: MousePointer2 },
  { id: "mark-position", label: "Mark", icon: MapPin },
  { id: "add-source", label: "Source", icon: ImagePlus },
  { id: "grid", label: "Grid", icon: Grid3X3 },
  { id: "draw-region", label: "Shape", icon: Square },
  { id: "pen", label: "Pen", icon: Pencil },
  { id: "text-note", label: "Text", icon: Type },
  { id: "add-object", label: "Object", icon: Box },
  { id: "generate", label: "Generate", icon: WandSparkles },
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
  canvasBackgroundColor,
  onCanvasBackgroundChange,
}: BottomToolDockProps) {
  const zoomLabel = `${Math.round(zoom * 100)}%`;
  const [backgroundPickerOpen, setBackgroundPickerOpen] = useState(false);
  const backgroundSwatches = useMemo(() => ["#F5F5F5", "#000000", "#FFFFFF", "#00F014", "#A855F7", "#DDD0F5"], []);

  return (
    <>
      {backgroundPickerOpen ? (
        <div className="absolute bottom-16 left-3 z-[60] w-80 overflow-hidden rounded-3xl border border-[#E5E5E5] bg-white shadow-[0_18px_45px_rgba(15,23,42,0.18)]">
          <div className="flex h-14 items-center justify-between border-b border-[#ECECEC] px-5">
            <h2 className="text-base font-semibold tracking-[-0.02em] text-[#222]">Canvas Background</h2>
            <button
              type="button"
              title="Close canvas background"
              onClick={(event) => {
                event.stopPropagation();
                setBackgroundPickerOpen(false);
              }}
              className="grid h-8 w-8 place-items-center rounded-full text-[#111] hover:bg-[#F5F5F5]"
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div className="space-y-4 p-5">
            <label
              className="relative block h-[165px] overflow-hidden rounded-lg"
              style={{
                background:
                  "linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent), linear-gradient(135deg, #ff8a8a, #f00000)",
              }}
            >
              <input
                type="color"
                value={canvasBackgroundColor}
                onChange={(event) => onCanvasBackgroundChange(event.target.value.toUpperCase())}
                className="absolute inset-0 h-full w-full cursor-crosshair opacity-0"
                aria-label="Pick canvas background color"
              />
              <span className="absolute left-0 top-1 h-5 w-5 rounded-full border-2 border-white bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.18)]" />
            </label>

            <label className="relative block h-4 rounded-full bg-[linear-gradient(90deg,#ff0000,#ffff00,#00ff00,#00ffff,#0000ff,#ff00ff,#ff0000)]">
              <input
                type="color"
                value={canvasBackgroundColor}
                onChange={(event) => onCanvasBackgroundChange(event.target.value.toUpperCase())}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                aria-label="Adjust canvas background hue"
              />
              <span className="absolute left-1 top-1/2 h-4 w-4 -translate-y-1/2 rounded-full border-2 border-white bg-[#FF1D00] shadow-[0_0_0_1px_rgba(0,0,0,0.16)]" />
            </label>

            <div className="flex items-center gap-4">
              {backgroundSwatches.map((color) => {
                const selected = canvasBackgroundColor.toUpperCase() === color;
                return (
                  <button
                    key={color}
                    type="button"
                    title={`Set background ${color}`}
                    onClick={(event) => {
                      event.stopPropagation();
                      onCanvasBackgroundChange(color);
                    }}
                    className={[
                      "h-9 w-9 rounded-full border transition",
                      selected ? "border-[#1F7AFF] ring-2 ring-[#1F7AFF]/20" : "border-[#E5E5E5] hover:scale-105",
                    ].join(" ")}
                    style={{ backgroundColor: color }}
                  />
                );
              })}
            </div>

            <div className="flex h-9 items-center gap-2 rounded-lg bg-[#F5F5F5] px-3 text-sm text-[#555]">
              <span className="text-[#777]">#</span>
              <input
                value={canvasBackgroundColor.replace("#", "")}
                onChange={(event) => {
                  const value = event.target.value.replace(/[^0-9a-f]/gi, "").slice(0, 6).toUpperCase();
                  if (value.length === 6) onCanvasBackgroundChange(`#${value}`);
                }}
                className="w-full bg-transparent font-mono uppercase outline-none"
                aria-label="Canvas background hex color"
              />
            </div>
          </div>
        </div>
      ) : null}

      <div className="absolute bottom-5 left-6 z-50 flex items-center gap-2 rounded-xl bg-[#F5F5F5] text-[#666]">
        <div className="flex h-8 items-center gap-2 px-2">
          <DockIcon label="Canvas background" icon={Image} onClick={() => setBackgroundPickerOpen((value) => !value)} />
          <DockIcon label="Library" icon={Library} onClick={() => onToast("Layers")} />
          <DockIcon label="Mini map" icon={Map} onClick={() => onToast("Synced")} />
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

      <div className="absolute bottom-5 left-1/2 z-50 flex -translate-x-1/2 items-center gap-0.5 rounded-xl border border-[#E5E7EB] bg-white p-1 shadow-[0_2px_10px_rgba(0,0,0,0.07)]">
        {tools.map((tool, index) => {
          const Icon = tool.icon;
          const selected = activeTool === tool.id || (tool.id === "grid" && gridVisible);
          const needsDivider = index === 5 || index === 6;
          return (
            <div key={tool.id} className="flex items-center">
              {needsDivider ? <span className="mx-1 h-5 w-px bg-[#ECECEC]" aria-hidden="true" /> : null}
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
                  "grid h-8 w-8 place-items-center rounded-lg transition",
                  selected ? "bg-[#232323] text-white" : "text-[#3D3D3D] hover:bg-[#F5F5F5]",
                ].join(" ")}
              >
                <Icon className="h-4 w-4" aria-hidden="true" />
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
  icon: LucideIcon;
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
      className="grid h-7 w-7 place-items-center rounded-lg text-[#666] transition hover:bg-[#F5F5F5] hover:text-[#111]"
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
