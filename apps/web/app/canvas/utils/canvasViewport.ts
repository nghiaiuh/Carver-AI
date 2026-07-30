export const DEFAULT_CANVAS_VIEWPORT_ZOOM = 1;
export const MIN_CANVAS_VIEWPORT_ZOOM = 0.2;
export const MAX_CANVAS_VIEWPORT_ZOOM = 4;
const CANVAS_WHEEL_LINE_HEIGHT_PX = 16;
const CANVAS_WHEEL_PAGE_HEIGHT_PX = 160;

export type CanvasViewportPoint = {
  x: number;
  y: number;
};

export type CanvasViewportState = {
  pan: CanvasViewportPoint;
  zoom: number;
};

// Viewport state is UI-only, but must be bounded before it enters durable drafts.
export function normalizeCanvasViewportZoom(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_CANVAS_VIEWPORT_ZOOM;
  }

  return Math.min(Math.max(value, MIN_CANVAS_VIEWPORT_ZOOM), MAX_CANVAS_VIEWPORT_ZOOM);
}

export function clampCanvasViewportZoom(value: number) {
  return normalizeCanvasViewportZoom(value);
}

export function screenToCanvasWorldPoint(
  point: CanvasViewportPoint,
  viewport: CanvasViewportState,
): CanvasViewportPoint {
  return {
    x: (point.x - viewport.pan.x) / viewport.zoom,
    y: (point.y - viewport.pan.y) / viewport.zoom,
  };
}

export function worldToCanvasScreenPoint(
  point: CanvasViewportPoint,
  viewport: CanvasViewportState,
): CanvasViewportPoint {
  return {
    x: point.x * viewport.zoom + viewport.pan.x,
    y: point.y * viewport.zoom + viewport.pan.y,
  };
}

export function zoomCanvasViewportAtPoint(
  viewport: CanvasViewportState,
  anchor: CanvasViewportPoint,
  nextZoomValue: number,
): CanvasViewportState {
  const nextZoom = clampCanvasViewportZoom(nextZoomValue);
  if (Math.abs(nextZoom - viewport.zoom) < 0.0001) {
    return viewport;
  }

  const worldPoint = screenToCanvasWorldPoint(anchor, viewport);

  return {
    zoom: nextZoom,
    pan: {
      x: anchor.x - worldPoint.x * nextZoom,
      y: anchor.y - worldPoint.y * nextZoom,
    },
  };
}

export function normalizeCanvasWheelDelta({
  deltaY,
  deltaMode,
  ctrlKey = false,
}: {
  deltaY: number;
  deltaMode: number;
  ctrlKey?: boolean;
}) {
  const deltaMultiplier =
    deltaMode === 1
      ? CANVAS_WHEEL_LINE_HEIGHT_PX
      : deltaMode === 2
        ? CANVAS_WHEEL_PAGE_HEIGHT_PX
        : 1;

  const normalizedDelta = deltaY * deltaMultiplier * (ctrlKey ? 0.65 : 1);
  return Math.min(Math.max(normalizedDelta, -240), 240);
}
