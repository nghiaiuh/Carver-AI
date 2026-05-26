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

export default function FloatingQuickPanel({ onTool, onMultiAngle, onRealityCheck, onToast }: FloatingQuickPanelProps) {
  return (
    <aside className="floating-quick-panel absolute -right-[236px] top-8 z-40 w-[210px] rounded-3xl border border-[#E5E7EB] bg-white/95 p-3 shadow-2xl shadow-black/12 backdrop-blur">
      <p className="px-2 pb-2 text-xs font-black uppercase tracking-[0.18em] text-[#98A2B3]">Quick Panel</p>
      <div className="grid gap-1">
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
              className="flex items-center gap-3 rounded-2xl px-3 py-2.5 text-left text-sm font-bold text-[#111827] transition hover:bg-[#F7F8FA]"
            >
              <Icon className="h-4 w-4 text-[#667085]" aria-hidden="true" />
              {action.label}
            </button>
          );
        })}
      </div>
    </aside>
  );
}
