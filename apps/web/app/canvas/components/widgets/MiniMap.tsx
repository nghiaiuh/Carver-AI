/*
 * Flow: Renders one interactive canvas workspace component.
 * 1. Receive canvas state and callbacks from the workspace.
 * 2. Render the focused control, overlay, or board UI.
 * 3. Send user actions back up through typed handlers.
 */

"use client";

import { Layers, Lock, Maximize } from "lucide-react";

type MiniMapProps = {
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
};

export default function MiniMap({ zoom, onZoomOut, onResetZoom }: MiniMapProps) {
  return (
    <div className="absolute bottom-7 left-7 z-40 w-52 rounded-[18px] border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] p-3 shadow-[0_14px_34px_var(--canvas-theme-shadow)]">
      <div
        className="relative h-28 overflow-hidden rounded-[14px]"
        style={{ backgroundColor: "var(--canvas-theme-canvas)" }}
      >
        <div className="absolute left-[18%] top-[18%] h-[50%] w-[58%] rounded-lg bg-[var(--canvas-theme-surface-muted)]" />
        <div className="absolute bottom-[16%] right-[14%] h-[18%] w-[24%] rounded bg-[var(--canvas-theme-text-muted)]" />
        <div className="absolute left-[24%] top-[25%] h-[42%] w-[48%] rounded-lg border-2 border-[var(--canvas-theme-active)] bg-[var(--canvas-theme-active)]/8" />
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs font-black text-[var(--canvas-theme-text-muted)]">{Math.round(zoom * 100)}%</span>
        <div className="flex gap-1">
          <button
            title="Zoom out"
            onClick={onZoomOut}
            className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--canvas-theme-surface-soft)] text-[var(--canvas-theme-text-muted)] transition hover:bg-[var(--canvas-theme-hover)] hover:text-[var(--canvas-theme-text)]"
          >
            <Layers className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            title="Lock zoom"
            onClick={() => {}}
            className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--canvas-theme-surface-soft)] text-[var(--canvas-theme-text-muted)] transition hover:bg-[var(--canvas-theme-hover)] hover:text-[var(--canvas-theme-text)]"
          >
            <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          <button
            title="Reset zoom to 100%"
            onClick={onResetZoom}
            className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--canvas-theme-surface-soft)] text-[var(--canvas-theme-text-muted)] transition hover:bg-[var(--canvas-theme-hover)] hover:text-[var(--canvas-theme-text)]"
          >
            <Maximize className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
