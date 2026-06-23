/*
 * Flow: Renders one interactive canvas workspace component.
 * 1. Receive canvas state and callbacks from the workspace.
 * 2. Render the focused control, overlay, or board UI.
 * 3. Send user actions back up through typed handlers.
 */

"use client";

import {
  Camera,
  Crop,
  Paintbrush,
} from "lucide-react";
import type { EditorTool } from "../../types/canvas";

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
  { label: "Region Edit", icon: Paintbrush, tool: "region" },
  { label: "Multi-Angles", icon: Camera, action: "multi-angle" },
  { label: "Crop", icon: Crop, action: "crop" },
] as const;

export default function ContextualToolbar({
  viewportZoom = 1,
  onMultiAngle,
  onTool,
  onToast,
}: ContextualToolbarProps) {
  const uiScale = 1 / viewportZoom;

  return (
    <div
      className="contextual-toolbar absolute left-1/2 z-[100] flex items-center gap-1 rounded-xl border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] px-2 py-1 shadow-xl shadow-[var(--canvas-theme-shadow)] backdrop-blur"
      style={{
        top: `${-54 * uiScale}px`,
        transform: `translateX(-50%) scale(${uiScale})`,
        transformOrigin: "top center",
      }}
    >
      {tools.map((tool) => {
        const Icon = tool.icon;
        return (
          <button
            key={tool.label}
            title={tool.label}
            onClick={(event) => {
              event.stopPropagation();
              if ("action" in tool && tool.action === "multi-angle") onMultiAngle();
              if ("action" in tool && tool.action === "crop") onToast("Crop tool coming next");
              if ("tool" in tool) onTool(tool.tool);
            }}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-transparent px-2.5 text-xs font-semibold text-black transition hover:border-[var(--canvas-theme-border)] hover:bg-[var(--canvas-theme-hover)]"
          >
            <Icon className="h-3.5 w-3.5 shrink-0 text-black" aria-hidden="true" />
            <span className="whitespace-nowrap">{tool.label}</span>
          </button>
        );
      })}
    </div>
  );
}
