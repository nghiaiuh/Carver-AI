import type { PenStrokeObject, SketchPoint } from "../../types/canvas";

type Point = SketchPoint;

export type EraserRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export function createEraserRect(center: Point, size: number): EraserRect {
  const half = size / 2;

  return {
    left: center.x - half,
    right: center.x + half,
    top: center.y - half,
    bottom: center.y + half,
  };
}

export function isPointInsideRect(point: Point, rect: EraserRect) {
  return point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
}

function orientation(a: Point, b: Point, c: Point) {
  const value = (b.y - a.y) * (c.x - b.x) - (b.x - a.x) * (c.y - b.y);

  if (Math.abs(value) < 0.00001) return 0;
  return value > 0 ? 1 : 2;
}

function onSegment(a: Point, b: Point, c: Point) {
  return (
    b.x <= Math.max(a.x, c.x) &&
    b.x >= Math.min(a.x, c.x) &&
    b.y <= Math.max(a.y, c.y) &&
    b.y >= Math.min(a.y, c.y)
  );
}

function lineSegmentsIntersect(a: Point, b: Point, c: Point, d: Point) {
  const o1 = orientation(a, b, c);
  const o2 = orientation(a, b, d);
  const o3 = orientation(c, d, a);
  const o4 = orientation(c, d, b);

  if (o1 !== o2 && o3 !== o4) return true;
  if (o1 === 0 && onSegment(a, c, b)) return true;
  if (o2 === 0 && onSegment(a, d, b)) return true;
  if (o3 === 0 && onSegment(c, a, d)) return true;
  if (o4 === 0 && onSegment(c, b, d)) return true;

  return false;
}

export function doesSegmentIntersectRect(start: Point, end: Point, rect: EraserRect) {
  if (isPointInsideRect(start, rect) || isPointInsideRect(end, rect)) {
    return true;
  }

  const topLeft = { x: rect.left, y: rect.top };
  const topRight = { x: rect.right, y: rect.top };
  const bottomLeft = { x: rect.left, y: rect.bottom };
  const bottomRight = { x: rect.right, y: rect.bottom };

  return (
    lineSegmentsIntersect(start, end, topLeft, topRight) ||
    lineSegmentsIntersect(start, end, topRight, bottomRight) ||
    lineSegmentsIntersect(start, end, bottomRight, bottomLeft) ||
    lineSegmentsIntersect(start, end, bottomLeft, topLeft)
  );
}

function pushUniquePoint(target: Point[], point: Point) {
  const lastPoint = target[target.length - 1];
  if (!lastPoint || lastPoint.x !== point.x || lastPoint.y !== point.y) {
    target.push(point);
  }
}

function normalizeSegmentPoints(points: Point[]) {
  if (points.length === 1) {
    return [points[0], points[0]];
  }

  return points;
}

export function clonePenStrokes(strokes: PenStrokeObject[]) {
  if (!strokes) return [];
  return strokes.map((stroke) => ({
    ...stroke,
    points: stroke.points.map((point) => ({ ...point })),
  }));
}

export function eraseStrokeByRect(stroke: PenStrokeObject, rect: EraserRect): PenStrokeObject[] {
  if (stroke.points.length === 0) return [];
  if (stroke.points.length === 1) {
    return isPointInsideRect(stroke.points[0], rect) ? [] : [stroke];
  }

  const nextSegments: Point[][] = [];
  let currentSegment: Point[] = [];
  let didErase = false;

  const flushSegment = () => {
    if (currentSegment.length === 0) return;
    nextSegments.push(normalizeSegmentPoints(currentSegment));
    currentSegment = [];
  };

  for (let index = 1; index < stroke.points.length; index += 1) {
    const previousPoint = stroke.points[index - 1];
    const currentPoint = stroke.points[index];
    const previousInside = isPointInsideRect(previousPoint, rect);
    const currentInside = isPointInsideRect(currentPoint, rect);
    const segmentIntersects = doesSegmentIntersectRect(previousPoint, currentPoint, rect);

    if (!previousInside && !currentInside && !segmentIntersects) {
      pushUniquePoint(currentSegment, previousPoint);
      pushUniquePoint(currentSegment, currentPoint);
      continue;
    }

    didErase = true;
    flushSegment();

    if (!currentInside && segmentIntersects) {
      currentSegment = [currentPoint];
    }
  }

  flushSegment();

  if (!didErase) {
    return [stroke];
  }

  return nextSegments.map((points, segmentIndex) => ({
    ...stroke,
    id: segmentIndex === 0 ? stroke.id : `${stroke.id}-split-${segmentIndex}-${Date.now()}`,
    points,
  }));
}

export function erasePenStrokesBySquare(strokes: PenStrokeObject[], center: Point, size: number) {
  const rect = createEraserRect(center, size);
  let changed = false;
  const nextStrokes: PenStrokeObject[] = [];

  for (const stroke of strokes) {
    const nextSegments = eraseStrokeByRect(stroke, rect);
    if (nextSegments.length !== 1 || nextSegments[0] !== stroke) {
      changed = true;
    }
    nextStrokes.push(...nextSegments);
  }

  return {
    changed,
    strokes: nextStrokes,
  };
}
