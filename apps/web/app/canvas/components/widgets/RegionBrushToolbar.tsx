"use client";

import { useEffect } from "react";
import { Lasso, Paintbrush, RefreshCcw, Trash2, X } from "lucide-react";
import type { CanvasWorkspaceHook } from "../../hooks/useCanvasWorkspace";

type RegionBrushToolbarProps = {
  workspace: CanvasWorkspaceHook;
};

export default function RegionBrushToolbar({ workspace }: RegionBrushToolbarProps) {
  const { brushMode, regionSelectionTool, leftSidebar, rightPanelOpen, selectedNode } = workspace.state;
  const {
    setBrushMode,
    setRegionSelectionTool,
    triggerMaskAction,
    undoMask,
    redoMask,
    exitRegionMode,
  } = workspace.actions;

  const isNodeSelected = !!selectedNode;
  const hasMask = Boolean(selectedNode?.regionMask?.selectionRatio && selectedNode.regionMask.selectionRatio > 0);
  const leftOffset = leftSidebar.open ? workspace.leftSidebarResize.width : 0;
  const rightOffset = rightPanelOpen ? workspace.rightPanelResize.width : 0;

  useEffect(() => {
    if (!isNodeSelected) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === "Escape") {
        e.preventDefault();
        exitRegionMode();
      } else if (e.key.toLowerCase() === "a") {
        setBrushMode("add");
      } else if (e.key.toLowerCase() === "s") {
        setBrushMode("subtract");
      } else if (e.key.toLowerCase() === "b") {
        setRegionSelectionTool("brush");
      } else if (e.key.toLowerCase() === "l") {
        setRegionSelectionTool("lasso");
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
  }, [exitRegionMode, hasMask, isNodeSelected, redoMask, selectedNode, setBrushMode, setRegionSelectionTool, triggerMaskAction, undoMask]);

  if (!isNodeSelected) return null;

  const actionButtonClass =
    "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold text-[var(--canvas-theme-text)] transition-colors hover:bg-[var(--canvas-theme-hover)]";
  const secondaryButtonClass =
    "flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold text-[var(--canvas-theme-text-muted)] transition-colors hover:bg-[var(--canvas-theme-hover)] hover:text-[var(--canvas-theme-text)]";
  const toolButtonClass = (active: boolean) =>
    `flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold transition-colors ${
      active
        ? "bg-[var(--canvas-theme-active)] text-[var(--canvas-theme-active-text)] shadow-sm"
        : "text-[var(--canvas-theme-text)] hover:bg-[var(--canvas-theme-hover)]"
    }`;
  const disabledButtonClass = "opacity-45 pointer-events-none";

  return (
    <div
      className="absolute bottom-5 z-[230] flex -translate-x-1/2 items-center gap-0.5 rounded-xl border border-[var(--canvas-theme-border)] bg-[var(--canvas-theme-surface-panel)] p-1 shadow-[0_2px_10px_var(--canvas-theme-shadow)] backdrop-blur"
      style={{
        left: `calc(${leftOffset}px + ((100vw - ${leftOffset}px - ${rightOffset}px) / 2))`,
        maxWidth: `calc(100vw - ${leftOffset}px - ${rightOffset}px - 2rem)`,
      }}
    >
      <div className="flex items-center gap-1 border-r border-[var(--canvas-theme-border)] pr-2">
        <button
          className={toolButtonClass(brushMode === "add")}
          onClick={() => setBrushMode("add")}
          title="Add region (A)"
        >
          <span>Add</span>
        </button>
        <button
          className={toolButtonClass(brushMode === "subtract")}
          onClick={() => setBrushMode("subtract")}
          title="Subtract region (S)"
        >
          <span>Subtract</span>
        </button>
        <button
          className={toolButtonClass(regionSelectionTool === "lasso")}
          onClick={() => setRegionSelectionTool("lasso")}
          title="Polygonal lasso tool (L)"
        >
          <Lasso className="h-4 w-4" />
          <span>Lasso</span>
        </button>
        <button
          className={toolButtonClass(regionSelectionTool === "brush")}
          onClick={() => setRegionSelectionTool("brush")}
          title="Brush tool (B)"
        >
          <Paintbrush className="h-4 w-4" />
          <span>Brush</span>
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
          className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] font-semibold text-[#DC2626] transition-colors hover:bg-[#FEF2F2] ${hasMask ? "" : disabledButtonClass}`}
          onClick={() => hasMask && triggerMaskAction("clear")}
          title="Clear Mask (Delete)"
        >
          <Trash2 className="h-4 w-4" />
          <span>Clear</span>
        </button>
      </div>

      <div className="flex items-center gap-2 pl-1">
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
