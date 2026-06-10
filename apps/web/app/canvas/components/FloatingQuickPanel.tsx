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
  Expand,
  Gauge,
  Paintbrush,
  RotateCw,
  SlidersHorizontal,
  WandSparkles,
} from "lucide-react";
import type { EditorTool } from "./CanvasWorkspace";

type FloatingQuickPanelProps = {
  viewportZoom?: number;
  onTool: (tool: EditorTool) => void;
  onMultiAngle: () => void;
  onRealityCheck: () => void;
  onToast: (message: string) => void;
};

const actions = [
  { label: "Expand Scene", icon: Expand, action: "expand" },
  { label: "Adjust Style", icon: Paintbrush, action: "style" },
  { label: "Crop View", icon: Crop, action: "crop" },
  { label: "Region Edit", icon: WandSparkles, tool: "draw-region" },
  { label: "Flip & Rotate", icon: RotateCw, action: "rotate" },
  { label: "Camera Angle", icon: Camera, action: "camera" },
  { label: "Reality Check", icon: Gauge, action: "reality" },
  { label: "Customize Toolbar", icon: SlidersHorizontal, action: "customize" },
] as const;

const PANEL_WIDTH = 176;
const PANEL_GAP = 18;
const PANEL_TOP_OFFSET = 32;

export default function FloatingQuickPanel({ viewportZoom = 1, onTool, onMultiAngle, onRealityCheck, onToast }: FloatingQuickPanelProps) {
  const uiScale = 1 / viewportZoom;

  return (
    <aside
      className="floating-quick-panel absolute z-[100] w-44 rounded-2xl border border-[#E5E7EB] bg-white/95 p-2 shadow-xl shadow-black/10 backdrop-blur"
      style={{
        right: `${-PANEL_WIDTH - PANEL_GAP * uiScale}px`,
        top: `${PANEL_TOP_OFFSET * uiScale}px`,
        transform: `scale(${uiScale})`,
        transformOrigin: "top left",
      }}
    >
      <p className="px-2 pb-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-[#98A2B3]">Quick Panel</p>
      <div className="grid gap-0.5">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <button
              key={action.label}
              onClick={(event) => {
              event.stopPropagation();
              if ("tool" in action) onTool(action.tool);
              if ("action" in action && action.action === "camera") onMultiAngle();
              if ("action" in action && action.action === "reality") onRealityCheck();
              if ("action" in action && ["expand", "style", "crop", "rotate", "customize"].includes(action.action)) onToast(`${action.label} applied`);
            }}
              className="flex items-center gap-2 rounded-xl px-2.5 py-2 text-left text-xs font-bold text-[#111827] transition hover:bg-[#F7F8FA]"
            >
              <Icon className="h-3.5 w-3.5 text-[#667085]" aria-hidden="true" />
              {action.label}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
