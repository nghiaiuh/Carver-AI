/*
 * Flow: Builds a worker-only visual receipt for one normalized target camera.
 * 1. Normalize the source pixels to an orientation-safe PNG.
 * 2. Draw only camera/framing facts already present in CameraSpec.
 * 3. Return bytes and hashes internally; persistent contracts still use asset IDs.
 */

import { createHash } from "node:crypto";
import type { CameraSpec } from "@carver/shared";
import sharp from "sharp";

export const CAMERA_OVERLAY_VERSION = "camera-overlay-v1" as const;
const MAX_SOURCE_PIXELS = 40_000_000;

export type NormalizedSourceArtifact = {
  readonly buffer: Buffer;
  readonly mimeType: "image/png";
  readonly width: number;
  readonly height: number;
  readonly contentHash: string;
};

export type CameraOverlayArtifact = {
  readonly artifactId: string;
  readonly buffer: Buffer;
  readonly mimeType: "image/png";
  readonly width: number;
  readonly height: number;
  readonly contentHash: string;
  readonly sourceArtifactHash: string;
  readonly targetCameraHash: string;
  readonly version: typeof CAMERA_OVERLAY_VERSION;
};

const sha256 = (value: Buffer | string) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;

const escapeXml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const rounded = (value: number) => Math.round(value * 100) / 100;

const arrowGeometry = (camera: CameraSpec, width: number, height: number) => {
  const [cameraX, , cameraZ] = camera.pose.position;
  const [targetX, , targetZ] = camera.pose.target;
  const angle = Math.atan2(cameraX - targetX, targetZ - cameraZ);
  const length = Math.max(20, Math.min(width, height) * 0.075);
  const centerX = width - Math.max(36, width * 0.07);
  const centerY = Math.max(38, height * 0.09);
  const endX = centerX + Math.sin(angle) * length;
  const endY = centerY - Math.cos(angle) * length;
  return {
    centerX: rounded(centerX),
    centerY: rounded(centerY),
    endX: rounded(endX),
    endY: rounded(endY),
  };
};

const buildOverlaySvg = (params: { camera: CameraSpec; width: number; height: number }) => {
  const { camera, width, height } = params;
  const arrow = arrowGeometry(camera, width, height);
  const label = escapeXml(
    `${camera.coordinateSpace} | ${rounded(camera.projection.horizontalFovDeg)} deg HFOV | ${camera.framingMode}`,
  );
  const labelWidth = Math.min(width - 24, Math.max(230, label.length * 6.2 + 24));

  return Buffer.from(
    `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="12" y="12" width="${rounded(labelWidth)}" height="28" rx="8" fill="#111827" fill-opacity="0.8"/>` +
      `<text x="24" y="31" fill="#f9fafb" font-family="Arial, sans-serif" font-size="12">${label}</text>` +
      `<circle cx="${arrow.centerX}" cy="${arrow.centerY}" r="18" fill="#111827" fill-opacity="0.8"/>` +
      `<path d="M ${arrow.centerX} ${arrow.centerY} L ${arrow.endX} ${arrow.endY}" stroke="#fbbf24" stroke-width="4" stroke-linecap="round"/>` +
      `<path d="M ${arrow.endX} ${arrow.endY} l -7 11 l 14 0 z" fill="#fbbf24" transform="rotate(${rounded((Math.atan2(arrow.endY - arrow.centerY, arrow.endX - arrow.centerX) * 180) / Math.PI - 90)} ${arrow.endX} ${arrow.endY})"/>` +
      `<circle cx="${arrow.centerX}" cy="${arrow.centerY}" r="5" fill="#f9fafb"/>` +
    `</svg>`,
    "utf8",
  );
};

/**
 * Makes EXIF orientation explicit so evidence consumers never disagree about
 * source pixel coordinates. This artifact is deliberately worker-internal:
 * it has no public URL or R2 key.
 */
export const normalizeSourceArtifact = async (sourceBuffer: Buffer): Promise<NormalizedSourceArtifact> => {
  if (!Buffer.isBuffer(sourceBuffer) || sourceBuffer.length === 0) {
    throw new Error("Source evidence requires non-empty image bytes.");
  }

  const normalized = await sharp(sourceBuffer, {
    failOn: "none",
    limitInputPixels: MAX_SOURCE_PIXELS,
  })
    .rotate()
    .ensureAlpha()
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer({ resolveWithObject: true });

  if (!normalized.info.width || !normalized.info.height) {
    throw new Error("Source evidence image has invalid dimensions.");
  }

  return {
    buffer: normalized.data,
    mimeType: "image/png",
    width: normalized.info.width,
    height: normalized.info.height,
    contentHash: sha256(normalized.data),
  };
};

export const buildCameraOverlay = async (params: {
  source: NormalizedSourceArtifact;
  camera: CameraSpec;
  targetCameraHash: string;
}): Promise<CameraOverlayArtifact> => {
  const svg = buildOverlaySvg({
    camera: params.camera,
    width: params.source.width,
    height: params.source.height,
  });
  const buffer = await sharp(params.source.buffer, {
    failOn: "none",
    limitInputPixels: MAX_SOURCE_PIXELS,
  })
    .composite([{ input: svg, top: 0, left: 0 }])
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();
  const contentHash = sha256(buffer);
  const identity = sha256([
    CAMERA_OVERLAY_VERSION,
    params.source.contentHash,
    params.targetCameraHash,
    contentHash,
  ].join("\u0000"));

  return {
    artifactId: `camera-overlay:${identity}`,
    buffer,
    mimeType: "image/png",
    width: params.source.width,
    height: params.source.height,
    contentHash,
    sourceArtifactHash: params.source.contentHash,
    targetCameraHash: params.targetCameraHash,
    version: CAMERA_OVERLAY_VERSION,
  };
};
