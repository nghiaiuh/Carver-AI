import type { PenGeometryShape, SketchPoint } from "../types/canvas";

/**
 * Geometry strokes persist only their drag anchors. The SVG layer derives the
 * actual primitive, which keeps rectangles and arrows crisp instead of
 * smoothing them as a freehand polyline.
 */
export function buildPenGeometryPoints(
  _shape: PenGeometryShape,
  start: SketchPoint,
  end: SketchPoint,
): SketchPoint[] {
  return [start, end];
}

export function hasMinimumPenGeometrySize(points: SketchPoint[], minimumSize = 4) {
  const start = points[0];
  const end = points.at(-1);
  return Boolean(start && end && Math.max(Math.abs(end.x - start.x), Math.abs(end.y - start.y)) >= minimumSize);
}
