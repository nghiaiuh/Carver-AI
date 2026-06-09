/*
 * Flow: Renders one interactive canvas workspace component.
 * 1. Receive canvas state and callbacks from the workspace.
 * 2. Render the focused control, overlay, or board UI.
 * 3. Send user actions back up through typed handlers.
 */

"use client";

import { Lock, PenLine } from "lucide-react";
import type { Region } from "./CanvasWorkspace";

type RegionOverlayProps = {
  region: Region;
  selected: boolean;
  onSelect: () => void;
};

export default function RegionOverlay({ region, selected, onSelect }: RegionOverlayProps) {
  const locked = region.kind === "locked";
  return (
    <button
      className={`region-overlay absolute z-20 rounded-2xl border-2 border-dashed text-left transition ${
        selected ? "border-[#3B82F6] ring-4 ring-[#3B82F6]/15" : locked ? "border-[#111827]/30" : "border-[#6D5DFB]/45"
      }`}
      style={{
        left: `${region.x}%`,
        top: `${region.y}%`,
        width: `${region.w}%`,
        height: `${region.h}%`,
        background: locked ? "rgba(17, 24, 39, 0.08)" : "rgba(109, 93, 251, 0.08)",
      }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      <span className={`absolute left-3 top-3 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-black shadow-sm ${locked ? "bg-white text-[#111827]" : "bg-[#6D5DFB] text-white"}`}>
        {locked ? <Lock className="h-3.5 w-3.5" aria-hidden="true" /> : <PenLine className="h-3.5 w-3.5" aria-hidden="true" />}
        {region.label}
      </span>
    </button>
  );
}
