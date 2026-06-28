"use client";

import React from "react";

type ResizeHandleProps = {
  side: "left" | "right";
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onDoubleClick?: () => void;
  isResizing?: boolean;
  ariaLabel: string;
};

export default function ResizeHandle({
  side,
  onPointerDown,
  onDoubleClick,
  isResizing = false,
  ariaLabel,
}: ResizeHandleProps) {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      data-canvas-ui="true"
      className={[
        "absolute top-0 z-[90] h-full w-3 cursor-col-resize select-none",
        side === "right" ? "-right-1.5" : "-left-1.5",
      ].join(" ")}
      onPointerDown={onPointerDown}
      onDoubleClick={onDoubleClick}
    >
      <div
        className={[
          "mx-auto h-full rounded-full transition-all duration-150",
          isResizing
            ? "w-[3px] bg-[#2563EB] shadow-[0_0_18px_rgba(37,99,235,0.28)]"
            : "w-px bg-[var(--canvas-theme-border)] hover:w-[3px] hover:bg-[var(--canvas-theme-border-strong)]",
        ].join(" ")}
      />
    </div>
  );
}
