export const DEFAULT_CANVAS_VIEWPORT_ZOOM = 1;
export const MIN_CANVAS_VIEWPORT_ZOOM = 0.2;
export const MAX_CANVAS_VIEWPORT_ZOOM = 4;

// Viewport state is UI-only, but must be bounded before it enters durable drafts.
export function normalizeCanvasViewportZoom(value: unknown) {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return DEFAULT_CANVAS_VIEWPORT_ZOOM;
  }

  return Math.min(Math.max(value, MIN_CANVAS_VIEWPORT_ZOOM), MAX_CANVAS_VIEWPORT_ZOOM);
}
