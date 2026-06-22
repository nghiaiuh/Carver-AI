"use client";

import type { MaskData } from "../types/canvas";

export const MAX_MASK_DIMENSION = 2048;
export const MASK_COLOR = { r: 0, g: 212, b: 255 };
export const MASK_ALPHA = 0.38;
export const MAX_MASK_HISTORY = 30;

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function normalizeMaskDimensions(width: number, height: number) {
  if (width <= 0 || height <= 0) {
    return { width: 1, height: 1 };
  }

  const largestSide = Math.max(width, height);
  if (largestSide <= MAX_MASK_DIMENSION) {
    return { width: Math.round(width), height: Math.round(height) };
  }

  const scale = MAX_MASK_DIMENSION / largestSide;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function computeSelectionRatio(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return 0;

  const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
  let selected = 0;
  const total = canvas.width * canvas.height;

  for (let index = 3; index < data.length; index += 4) {
    if (data[index] > 8) selected += 1;
  }

  return total > 0 ? selected / total : 0;
}

export function exportMaskData(canvas: HTMLCanvasElement): MaskData | undefined {
  const selectionRatio = computeSelectionRatio(canvas);
  if (selectionRatio <= 0) return undefined;

  return {
    width: canvas.width,
    height: canvas.height,
    dataUrl: canvas.toDataURL("image/png"),
    selectionRatio,
    updatedAt: Date.now(),
  };
}

export function loadMaskDataToCanvas(
  canvas: HTMLCanvasElement,
  mask: MaskData | undefined,
) {
  return new Promise<void>((resolve) => {
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      resolve();
      return;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);
    if (!mask?.dataUrl) {
      resolve();
      return;
    }

    const image = new window.Image();
    image.decoding = "async";
    image.onload = () => {
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve();
    };
    image.onerror = () => resolve();
    image.src = mask.dataUrl;
  });
}

export function renderMaskOverlay(
  maskCanvas: HTMLCanvasElement,
  overlayCanvas: HTMLCanvasElement,
) {
  const maskContext = maskCanvas.getContext("2d", { willReadFrequently: true });
  const overlayContext = overlayCanvas.getContext("2d");
  if (!maskContext || !overlayContext) return;

  const maskImageData = maskContext.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
  const overlayImageData = overlayContext.createImageData(maskCanvas.width, maskCanvas.height);
  const maskPixels = maskImageData.data;
  const overlayPixels = overlayImageData.data;

  for (let index = 0; index < maskPixels.length; index += 4) {
    const alpha = maskPixels[index + 3];
    if (alpha <= 0) continue;

    overlayPixels[index] = MASK_COLOR.r;
    overlayPixels[index + 1] = MASK_COLOR.g;
    overlayPixels[index + 2] = MASK_COLOR.b;
    overlayPixels[index + 3] = Math.round(alpha * MASK_ALPHA);
  }

  overlayContext.putImageData(overlayImageData, 0, 0);
}
