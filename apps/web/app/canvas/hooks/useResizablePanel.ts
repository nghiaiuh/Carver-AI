"use client";

import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { useEffect, useRef, useState } from "react";

type ResizeSide = "left" | "right";

type UseResizablePanelOptions = {
  panelRef: RefObject<HTMLDivElement | null>;
  side: ResizeSide;
  defaultWidth: number;
  minWidth: number;
  maxWidth: number;
  storageKey?: string;
};

type UseResizablePanelResult = {
  width: number;
  isResizing: boolean;
  startResize: (event: ReactPointerEvent | React.MouseEvent) => void;
  resetWidth: () => void;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeWidth(value: number, min: number, max: number) {
  return Math.round(clamp(value, min, max));
}

export default function useResizablePanel({
  panelRef,
  side,
  defaultWidth,
  minWidth,
  maxWidth,
  storageKey,
}: UseResizablePanelOptions): UseResizablePanelResult {
  const [width, setWidth] = useState(() => normalizeWidth(defaultWidth, minWidth, maxWidth));
  const [isResizing, setIsResizing] = useState(false);
  const stopResizeRef = useRef<(() => void) | null>(null);
  const hasLoadedStoredWidthRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined" || !storageKey) {
      hasLoadedStoredWidthRef.current = true;
      return;
    }

    const storedWidth = window.localStorage.getItem(storageKey);
    const parsedWidth = storedWidth ? Number(storedWidth) : Number.NaN;
    const timeoutId = window.setTimeout(() => {
      if (Number.isFinite(parsedWidth)) {
        setWidth(normalizeWidth(parsedWidth, minWidth, maxWidth));
      }

      hasLoadedStoredWidthRef.current = true;
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [storageKey, minWidth, maxWidth]);

  useEffect(() => {
    if (!hasLoadedStoredWidthRef.current || typeof window === "undefined" || !storageKey) return;
    window.localStorage.setItem(storageKey, String(width));
  }, [storageKey, width]);

  useEffect(() => {
    if (!isResizing || typeof document === "undefined") return;

    const previousCursor = document.body.style.cursor;
    const previousUserSelect = document.body.style.userSelect;

    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";

    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousUserSelect;
    };
  }, [isResizing]);

  useEffect(() => {
    return () => {
      stopResizeRef.current?.();
      setIsResizing(false);
    };
  }, []);

  const resetWidth = () => {
    setWidth(normalizeWidth(defaultWidth, minWidth, maxWidth));
  };

  const startResize = (event: ReactPointerEvent | React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    stopResizeRef.current?.();

    const panelRect = panelRef.current?.getBoundingClientRect();
    setIsResizing(true);

    const handlePointerMove = (moveEvent: PointerEvent) => {
      const nextWidth =
        side === "left"
          ? moveEvent.clientX - (panelRect?.left ?? 0)
          : (panelRect?.right ?? window.innerWidth) - moveEvent.clientX;

      setWidth(normalizeWidth(nextWidth, minWidth, maxWidth));
    };

    const stopResize = () => {
      setIsResizing(false);
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopResize);
      window.removeEventListener("pointercancel", stopResize);
      stopResizeRef.current = null;
    };

    stopResizeRef.current = stopResize;
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopResize);
    window.addEventListener("pointercancel", stopResize);
  };

  return {
    width,
    isResizing,
    startResize,
    resetWidth,
  };
}
