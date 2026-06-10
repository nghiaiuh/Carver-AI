/*
 * Flow: Renders one interactive canvas workspace component.
 * 1. Receive canvas state and callbacks from the workspace.
 * 2. Render the focused control, overlay, or board UI.
 * 3. Send user actions back up through typed handlers.
 */

"use client";

import {
  Download,
  Eraser,
  ImagePlus,
  Lock,
  Maximize2,
  MoreHorizontal,
  Move,
  MousePointer2,
  Scan,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import type { EditorTool } from "./CanvasWorkspace";

type ContextualToolbarProps = {
  itemLabel: "Image" | "Reference" | "Object";
  viewportZoom?: number;
  onQuickEdit: () => void;
  onMultiAngle: () => void;
  onAddObject: () => void;
  onTool: (tool: EditorTool) => void;
  onToast: (message: string) => void;
};

const tools = [
  { label: "Quick Edit", icon: WandSparkles, action: "quick-edit" },
  { label: "Enhance", icon: Sparkles, action: "enhance" },
  { label: "Erase", icon: Eraser, tool: "erase" },
  { label: "Edit Elements", icon: MousePointer2, tool: "edit-elements" },
  { label: "Mark Position", icon: Scan, tool: "mark-position" },
  { label: "Lock Area", icon: Lock, tool: "lock-area" },
  { label: "Multi-Angles", icon: Maximize2, action: "multi-angle" },
  { label: "Move Object", icon: Move, tool: "move-object" },
  { label: "Add Object", icon: ImagePlus, action: "add-object" },
  { label: "More", icon: MoreHorizontal, action: "more" },
  { label: "Export", icon: Download, action: "export" },
] as const;

export default function ContextualToolbar({
  itemLabel,
  viewportZoom = 1,
  onQuickEdit,
  onMultiAngle,
  onAddObject,
  onTool,
  onToast,
}: ContextualToolbarProps) {
  const uiScale = 1 / viewportZoom;

  return (
    <div
      className="contextual-toolbar absolute left-1/2 z-[100] flex items-center gap-0.5 rounded-xl border border-[#E5E7EB] bg-white/95 p-1 shadow-xl shadow-black/10 backdrop-blur"
      style={{
        top: `${-62 * uiScale}px`,
        transform: `translateX(-50%) scale(${uiScale})`,
        transformOrigin: "top center",
      }}
    >
      <span className="mr-0.5 rounded-lg bg-[#111827] px-2.5 py-1.5 text-[11px] font-black text-white">{itemLabel}</span>
      {tools.map((tool) => {
        const Icon = tool.icon;
        return (
          <button
            key={tool.label}
            title={tool.label}
            onClick={(event) => {
              event.stopPropagation();
              if ("action" in tool && tool.action === "quick-edit") onQuickEdit();
              if ("action" in tool && tool.action === "multi-angle") onMultiAngle();
              if ("action" in tool && tool.action === "add-object") onAddObject();
              if ("action" in tool && tool.action === "enhance") onToast("Enhance applied");
              if ("action" in tool && tool.action === "export") onToast("Export mock");
              if ("tool" in tool) onTool(tool.tool);
            }}
            className="grid h-7 w-7 place-items-center rounded-lg text-[#667085] transition hover:bg-[#F7F8FA] hover:text-[#111827]"
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        );
      })}
    </div>
  );
}
