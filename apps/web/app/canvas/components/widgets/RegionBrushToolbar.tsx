"use client";

import { useEffect, useRef, useState } from "react";
import { Eraser, Paintbrush, Redo2, RefreshCcw, Trash2, Undo2, X } from "lucide-react";
import type { CanvasWorkspaceHook } from "../../hooks/useCanvasWorkspace";

type RegionBrushToolbarProps = {
  workspace: CanvasWorkspaceHook;
};

export default function RegionBrushToolbar({ workspace }: RegionBrushToolbarProps) {
  const { brushMode, brushSize, brushSoftness, selectedNode } = workspace.state;
  const {
    setBrushMode,
    setBrushSize,
    setBrushSoftness,
    triggerMaskAction,
    undoMask,
    redoMask,
    exitRegionMode,
  } = workspace.actions;
  const [brushPopoverOpen, setBrushPopoverOpen] = useState(false);
  const brushPopoverRef = useRef<HTMLDivElement>(null);

  const isNodeSelected = !!selectedNode;
  const canUndo = Boolean(selectedNode?.maskHistory?.past.length);
  const canRedo = Boolean(selectedNode?.maskHistory?.future.length);
  const hasMask = Boolean(selectedNode?.regionMask?.selectionRatio && selectedNode.regionMask.selectionRatio > 0);
  const maskPercent = selectedNode?.regionMask ? Math.round(selectedNode.regionMask.selectionRatio * 100) : 0;

  useEffect(() => {
    if (!isNodeSelected) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === "Escape") {
        e.preventDefault();
        setBrushPopoverOpen(false);
        exitRegionMode();
      } else if (e.key.toLowerCase() === "a" || e.key.toLowerCase() === "b") {
        setBrushMode("add");
      } else if (e.key.toLowerCase() === "s" || e.key.toLowerCase() === "e") {
        setBrushMode("subtract");
      } else if (e.key.toLowerCase() === "i") {
        triggerMaskAction("invert");
      } else if ((e.key === "Delete" || e.key === "Backspace") && hasMask) {
        triggerMaskAction("clear");
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.stopPropagation();
        if (!selectedNode) return;
        if (e.shiftKey) {
          redoMask(selectedNode.id);
        } else {
          undoMask(selectedNode.id);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, { capture: true });
  }, [exitRegionMode, hasMask, isNodeSelected, redoMask, selectedNode, setBrushMode, triggerMaskAction, undoMask]);

  useEffect(() => {
    if (!brushPopoverOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (brushPopoverRef.current?.contains(event.target as Node)) return;
      setBrushPopoverOpen(false);
    };

    window.addEventListener("pointerdown", handlePointerDown);
    return () => window.removeEventListener("pointerdown", handlePointerDown);
  }, [brushPopoverOpen]);

  if (!isNodeSelected) return null;

  const actionButtonClass =
    "flex h-9 items-center gap-2 rounded-xl px-3 text-[12px] font-semibold text-[var(--canvas-theme-text)] transition-colors hover:bg-[var(--canvas-theme-hover)]";
  const secondaryButtonClass =
    "flex h-9 items-center gap-2 rounded-xl px-3 text-[12px] font-semibold text-[var(--canvas-theme-text-muted)] transition-colors hover:bg-[var(--canvas-theme-hover)] hover:text-[var(--canvas-theme-text)]";
  const toolButtonClass = (active: boolean) =>
    `flex h-9 items-center gap-2 rounded-xl px-3 text-[12px] font-semibold transition-colors ${
      active
        ? "bg-[var(--canvas-theme-active)] text-[var(--canvas-theme-active-text)] shadow-sm"
        : "text-[var(--canvas-theme-text)] hover:bg-[var(--canvas-theme-hover)]"
    }`;
  const disabledButtonClass = "opacity-45 pointer-events-none";

  return (
    <div className="fixed bottom-24 left-1/2 z-[230] flex max-w-[calc(100vw-2rem)] -translate-x-1/2 items-center gap-2 rounded-2xl border border-[var(--canvas-theme-border)] bg-[color:color-mix(in_srgb,var(--canvas-theme-surface-panel)_92%,white_8%)] px-3 py-2 shadow-[0_18px_45px_var(--canvas-theme-shadow)] backdrop-blur">
      <div className="flex items-center gap-1 border-r border-[var(--canvas-theme-border)] pr-2">
        <div ref={brushPopoverRef} className="relative">
          {brushPopoverOpen ? (
            <div className="absolute bottom-full left-0 mb-2 w-[220px] rounded-2xl border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] p-3 shadow-[0_18px_45px_var(--canvas-theme-shadow)]">
              <div className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--canvas-theme-text-muted)]">
                    <span>Size</span>
                    <span className="text-[var(--canvas-theme-text)]">{brushSize}px</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="500"
                    value={brushSize}
                    onChange={(e) => setBrushSize(Number(e.target.value))}
                    className="h-1.5 w-full cursor-pointer accent-[var(--canvas-theme-active)]"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--canvas-theme-text-muted)]">
                    <span>Softness</span>
                    <span className="text-[var(--canvas-theme-text)]">{brushSoftness}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={brushSoftness}
                    onChange={(e) => setBrushSoftness(Number(e.target.value))}
                    className="h-1.5 w-full cursor-pointer accent-[var(--canvas-theme-active)]"
                  />
                </div>
              </div>
            </div>
          ) : null}
          <button
            className={toolButtonClass(brushMode === "add")}
            onClick={() => {
              setBrushMode("add");
              setBrushPopoverOpen((open) => !open);
            }}
            title="Add region (A / B)"
          >
            <Paintbrush className="h-4 w-4" />
            <span>Add</span>
          </button>
        </div>
        <button
          className={toolButtonClass(brushMode === "subtract")}
          onClick={() => setBrushMode("subtract")}
          title="Subtract region (S / E)"
        >
          <Eraser className="h-4 w-4" />
          <span>Subtract</span>
        </button>
      </div>

      <div className="flex items-center gap-1 border-r border-[var(--canvas-theme-border)] pr-2">
        <button
          className={`${secondaryButtonClass} ${canUndo ? "" : disabledButtonClass}`}
          onClick={() => selectedNode && undoMask(selectedNode.id)}
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="h-4 w-4" />
          <span>Undo</span>
        </button>
        <button
          className={`${secondaryButtonClass} ${canRedo ? "" : disabledButtonClass}`}
          onClick={() => selectedNode && redoMask(selectedNode.id)}
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 className="h-4 w-4" />
          <span>Redo</span>
        </button>
      </div>

      <div className="flex items-center gap-1 border-r border-[var(--canvas-theme-border)] pr-2">
        <button
          className={actionButtonClass}
          onClick={() => triggerMaskAction("invert")}
          title="Invert Mask (I)"
        >
          <RefreshCcw className="h-4 w-4" />
          <span>Invert</span>
        </button>
        <button
          className={`flex h-9 items-center gap-2 rounded-xl px-3 text-[12px] font-semibold text-[#DC2626] transition-colors hover:bg-[#FEF2F2] ${hasMask ? "" : disabledButtonClass}`}
          onClick={() => hasMask && triggerMaskAction("clear")}
          title="Clear Mask (Delete)"
        >
          <Trash2 className="h-4 w-4" />
          <span>Clear</span>
        </button>
      </div>

      <div className="flex items-center gap-2 pl-1">
        <div className="max-w-[180px] truncate rounded-full bg-[var(--canvas-theme-surface-soft)] px-3 py-1.5 text-[11px] font-semibold text-[var(--canvas-theme-text-muted)]">
          {selectedNode?.title ?? "Selected image"}
          {hasMask ? ` • Mask ${maskPercent}%` : ""}
        </div>
        <button
          className={secondaryButtonClass}
          onClick={exitRegionMode}
          title="Exit region mode (Esc)"
        >
          <X className="h-4 w-4" />
          <span>Exit</span>
        </button>
      </div>
    </div>
  );
}
