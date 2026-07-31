import type { CanvasNode } from "../types/canvas";
import { screenToCanvasWorldPoint } from "./canvasViewport";

export type CanvasPoint = { x: number; y: number };
export type CanvasSelectionRect = { x: number; y: number; width: number; height: number };

export function clampCanvasValue(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function getCanvasNodeDisplayBounds(node: CanvasNode): CanvasSelectionRect {
  const scale = node.scale ?? 1;
  return { x: node.x, y: node.y, width: node.width * scale, height: node.height * scale };
}

export function getCanvasPointerPoint(
  event: PointerEvent | React.PointerEvent | WheelEvent,
  container: HTMLElement,
): CanvasPoint {
  const rect = container.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

export function getCanvasWorldPoint({ point, pan, zoom }: { point: CanvasPoint; pan: CanvasPoint; zoom: number }): CanvasPoint {
  return screenToCanvasWorldPoint(point, { pan, zoom });
}

export function canvasPointDistance(a: CanvasPoint, b: CanvasPoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function createCanvasSelectionRect(a: CanvasPoint, b: CanvasPoint): CanvasSelectionRect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y) };
}

export function canvasRectsIntersect(a: CanvasSelectionRect, b: CanvasSelectionRect) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}
