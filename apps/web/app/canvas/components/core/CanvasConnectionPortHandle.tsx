"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Image as ImageIcon, Type } from "lucide-react";
import type { PointerEvent as ReactPointerEvent } from "react";
import type { CanvasConnectionKind } from "../../types/canvas";

type CanvasConnectionPortHandleProps = {
  ariaLabel?: string;
  count?: number;
  kind: CanvasConnectionKind;
  selected: boolean;
  active: boolean;
  interactive?: boolean;
  title?: string;
  onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => void;
};

/** Shared visual and interaction primitive for semantic canvas output ports. */
export default function CanvasConnectionPortHandle({
  ariaLabel,
  count = 0,
  kind,
  selected,
  active,
  interactive = true,
  title,
  onPointerDown,
}: CanvasConnectionPortHandleProps) {
  const styles = getConnectionHandleStyles(kind);
  const showCount = selected && count >= 2;
  const Icon = kind === "text" ? Type : ImageIcon;

  const content = (
    <AnimatePresence mode="wait" initial={false}>
      <motion.span
        key={showCount ? `count-${count}` : `icon-${kind}`}
        initial={{ opacity: 0, scale: 0.76, y: 2 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.78, y: -2 }}
        transition={{ duration: 0.16, ease: "easeOut" }}
        className="flex h-4.5 w-4.5 items-center justify-center"
        style={{ color: styles.text }}
      >
        {showCount ? (
          <span className="text-[11px] font-semibold leading-none">{count}</span>
        ) : (
          <Icon className="h-[14px] w-[14px]" strokeWidth={1.9} />
        )}
      </motion.span>
    </AnimatePresence>
  );
  const sharedProps = {
    "aria-label": ariaLabel ?? `${kind} connection${count > 1 ? ` (${count})` : ""}`,
    title: title ?? (count > 1 ? `${count} ${kind} connections` : `${kind} connection`),
    className: [
      "relative flex h-8 w-8 items-center justify-center rounded-full border shadow-[0_8px_18px_rgba(15,23,42,0.14)] transition duration-150",
      interactive ? "hover:scale-[1.04]" : "cursor-default",
    ].join(" "),
    style: {
      borderColor: styles.border,
      background: styles.background,
      boxShadow: active
        ? `0 0 0 3px ${styles.ring}, 0 8px 18px rgba(15,23,42,0.14)`
        : "0 8px 18px rgba(15,23,42,0.14)",
    },
  };

  if (!interactive) {
    return <div data-canvas-interactive="true" {...sharedProps} onPointerDown={(event) => event.stopPropagation()}>{content}</div>;
  }

  return <button type="button" data-canvas-interactive="true" {...sharedProps} onPointerDown={onPointerDown}>{content}</button>;
}

function getConnectionHandleStyles(kind: CanvasConnectionKind) {
  return kind === "text"
    ? {
      border: "var(--canvas-theme-connection-text)",
      background: "var(--canvas-theme-surface-panel)",
      ring: "var(--canvas-theme-connection-text-soft)",
      text: "var(--canvas-theme-connection-text)",
    }
    : {
      border: "var(--canvas-theme-connection-image)",
      background: "var(--canvas-theme-surface-panel)",
      ring: "var(--canvas-theme-connection-image-soft)",
      text: "var(--canvas-theme-connection-image)",
    };
}
