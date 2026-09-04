import type { CanvasNode } from "../types/canvas";
import { getDefaultInputPorts } from "../types/canvas";
import { MAX_CANVAS_VIEWPORT_ZOOM } from "./canvasViewport";

const MAX_PASTED_IMAGE_WIDTH = 420;
const MAX_PASTED_IMAGE_HEIGHT = 320;
const FALLBACK_PASTED_IMAGE_WIDTH = 240;
const FALLBACK_PASTED_IMAGE_HEIGHT = 180;

export function loadCanvasImageDimensions(imageUrl: string) {
  return new Promise<{ width: number; height: number } | null>((resolve) => {
    const image = new window.Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => resolve(null);
    image.src = imageUrl;
  });
}

export function getPastedCanvasImageSize(dimensions: { width: number; height: number } | null) {
  if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) {
    return { width: FALLBACK_PASTED_IMAGE_WIDTH, height: FALLBACK_PASTED_IMAGE_HEIGHT };
  }
  const pixelRatio = typeof window === "undefined" ? 1 : Math.max(window.devicePixelRatio || 1, 1);
  const maxScale = MAX_CANVAS_VIEWPORT_ZOOM * pixelRatio;
  const crispWidth = dimensions.width / maxScale;
  const crispHeight = dimensions.height / maxScale;
  const fit = Math.min(MAX_PASTED_IMAGE_WIDTH / crispWidth, MAX_PASTED_IMAGE_HEIGHT / crispHeight, 1);
  return { width: Math.max(1, Math.round(crispWidth * fit)), height: Math.max(1, Math.round(crispHeight * fit)) };
}

export function cloneCanvasNodeForPaste(node: CanvasNode, existingNodeCount: number): CanvasNode {
  const copy = structuredClone(node) as CanvasNode;
  return {
    ...copy,
    id: `node-${Date.now()}-${existingNodeCount}`,
    x: copy.x + 36,
    y: copy.y + 36,
    title: copy.title.endsWith(" Copy") ? copy.title : `${copy.title} Copy`,
    createdAt: new Date().toISOString(),
    inputPorts: copy.inputPorts?.map((port) => ({ ...port })) ?? getDefaultInputPorts(),
  };
}

export function getClipboardImageBlob(data: DataTransfer | null) {
  const items = data?.items;
  if (!items) return null;
  for (let index = 0; index < items.length; index += 1) {
    if (items[index].type.startsWith("image/")) return items[index].getAsFile();
  }
  return null;
}

/** Returns only image files dragged from the operating system into the canvas. */
export function getDroppedCanvasImageFiles(data: DataTransfer | null) {
  return Array.from(data?.files ?? []).filter((file) => file.type.startsWith("image/"));
}

/** File metadata remains available while the browser protects the file list during dragover. */
export function hasCanvasFileDrop(data: Pick<DataTransfer, "types"> | null) {
  return Array.from(data?.types ?? []).includes("Files");
}

export function extractCanvasImageUrlFromClipboard(data: DataTransfer | null) {
  if (!data) return null;
  const uriList = data.getData("text/uri-list").trim();
  if (uriList) return uriList.split(/\r?\n/).find((line) => line && !line.startsWith("#")) ?? null;
  const html = data.getData("text/html");
  const srcMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i);
  if (srcMatch?.[1]) return srcMatch[1];
  const text = data.getData("text/plain").trim();
  return /^https?:\/\//i.test(text) || text.startsWith("/api/assets/") ? text : null;
}
