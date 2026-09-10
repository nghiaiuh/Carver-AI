/*
 * Flow: Builds conservative 2.5D evidence from one normalized source image.
 * 1. Produce a deterministic, explicitly heuristic depth proxy and confidence map.
 * 2. Reproject source pixels only far enough to make a coarse camera guide.
 * 3. Mark inferred and unavailable target-view pixels instead of inventing coverage.
 */

import { createHash } from "node:crypto";
import type { CameraSpec, Confidence } from "@carver/shared";
import sharp from "sharp";
import { hashConditioningValue } from "./build-model-conditioning";
import type { NormalizedSourceArtifact } from "./camera-overlay";

export const COARSE_GEOMETRY_EVIDENCE_VERSION = "coarse-geometry-evidence-v1" as const;

export type CoarseGeometryArtifact = {
  /**
   * Opaque, deterministic worker-local identity. It is resolved from this
   * build result only; it is never treated as an R2 key or public asset URL.
   */
  readonly artifactId: string;
  readonly buffer: Buffer;
  readonly mimeType: "image/png";
  readonly width: number;
  readonly height: number;
  readonly contentHash: string;
  readonly sourceArtifactHash: string;
  readonly targetCameraHash?: string;
  readonly version: typeof COARSE_GEOMETRY_EVIDENCE_VERSION;
};

export type CoarseGeometryEvidenceResult = {
  readonly depthMap: CoarseGeometryArtifact;
  readonly depthConfidence: CoarseGeometryArtifact;
  readonly coarseCameraGuide: CoarseGeometryArtifact;
  readonly uncertaintyMask: CoarseGeometryArtifact;
  readonly coverage: {
    readonly observed: number;
    readonly inferred: number;
    readonly unobserved: number;
  };
  readonly geometryConfidence: Confidence;
};

const MAX_SOURCE_PIXELS = 40_000_000;
const clamp = (value: number, minimum = 0, maximum = 1) => Math.min(maximum, Math.max(minimum, value));
const sha256 = (value: Buffer | string) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;

const artifactFor = async (params: {
  kind: "depth-map" | "depth-confidence" | "coarse-camera-guide" | "uncertainty-mask";
  raw: Buffer;
  channels: 1 | 4;
  width: number;
  height: number;
  sourceArtifactHash: string;
  targetCameraHash?: string;
}) => {
  const buffer = await sharp(params.raw, {
    raw: { width: params.width, height: params.height, channels: params.channels },
    failOn: "none",
    limitInputPixels: MAX_SOURCE_PIXELS,
  })
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false })
    .toBuffer();
  const contentHash = sha256(buffer);
  const identity = hashConditioningValue({
    version: COARSE_GEOMETRY_EVIDENCE_VERSION,
    kind: params.kind,
    sourceArtifactHash: params.sourceArtifactHash,
    targetCameraHash: params.targetCameraHash ?? null,
    contentHash,
  });

  return {
    artifactId: `worker-evidence:${params.kind}:${identity}`,
    buffer,
    mimeType: "image/png" as const,
    width: params.width,
    height: params.height,
    contentHash,
    sourceArtifactHash: params.sourceArtifactHash,
    ...(params.targetCameraHash ? { targetCameraHash: params.targetCameraHash } : {}),
    version: COARSE_GEOMETRY_EVIDENCE_VERSION,
  } satisfies CoarseGeometryArtifact;
};

const sourceRelativeOffset = (camera: CameraSpec, width: number, height: number) => {
  const [cameraX, cameraY, cameraZ] = camera.pose.position;
  const [targetX, targetY, targetZ] = camera.pose.target;
  const deltaX = cameraX - targetX;
  const deltaY = cameraY - targetY;
  const deltaZ = cameraZ - targetZ;
  const distance = Math.hypot(deltaX, deltaY, deltaZ);
  if (!Number.isFinite(distance) || distance <= Number.EPSILON) {
    throw new Error("Coarse geometry evidence requires a non-degenerate target camera.");
  }

  // This is intentionally a bounded visual proxy, not calibrated scene depth.
  const focalWeight = clamp(72 / camera.projection.horizontalFovDeg, 0.45, 1.2);
  return {
    x: clamp((deltaX / distance) * width * 0.1 * focalWeight, -width * 0.12, width * 0.12),
    y: clamp((-deltaY / distance) * height * 0.08 * focalWeight, -height * 0.1, height * 0.1),
  };
};

const lumaAt = (pixels: Buffer, width: number, height: number, x: number, y: number) => {
  const safeX = Math.min(width - 1, Math.max(0, x));
  const safeY = Math.min(height - 1, Math.max(0, y));
  const offset = (safeY * width + safeX) * 4;
  return (pixels[offset]! * 0.2126) + (pixels[offset + 1]! * 0.7152) + (pixels[offset + 2]! * 0.0722);
};

const sourceOffset = (width: number, x: number, y: number) => (y * width + x) * 4;

/**
 * Produces a bounded 2.5D proxy from image-space cues only. It deliberately
 * carries heuristic confidence and an uncertainty mask so later consumers do
 * not mistake it for measured depth or complete target-view coverage.
 */
export const buildCoarseGeometryEvidence = async (params: {
  source: NormalizedSourceArtifact;
  camera: CameraSpec;
  targetCameraHash: string;
}): Promise<CoarseGeometryEvidenceResult> => {
  const decoded = await sharp(params.source.buffer, {
    failOn: "none",
    limitInputPixels: MAX_SOURCE_PIXELS,
  })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const width = decoded.info.width;
  const height = decoded.info.height;
  if (!width || !height || decoded.info.channels !== 4) {
    throw new Error("Coarse geometry evidence requires a decoded RGBA source image.");
  }

  const offset = sourceRelativeOffset(params.camera, width, height);
  const depth = Buffer.alloc(width * height);
  const confidence = Buffer.alloc(width * height);
  const uncertainty = Buffer.alloc(width * height);
  const guide = Buffer.alloc(width * height * 4);
  let observed = 0;
  let inferred = 0;
  let unobserved = 0;
  let confidenceTotal = 0;

  for (let y = 0; y < height; y += 1) {
    const vertical = height === 1 ? 0.5 : y / (height - 1);
    for (let x = 0; x < width; x += 1) {
      const pixelIndex = y * width + x;
      const luminance = lumaAt(decoded.data, width, height, x, y);
      const horizontalContrast = Math.abs(
        lumaAt(decoded.data, width, height, x + 1, y) - lumaAt(decoded.data, width, height, x - 1, y),
      ) / 510;
      const verticalContrast = Math.abs(
        lumaAt(decoded.data, width, height, x, y + 1) - lumaAt(decoded.data, width, height, x, y - 1),
      ) / 510;
      const localContrast = clamp(horizontalContrast + verticalContrast);
      // Nearer lower image regions and dark/light separation are only weak
      // image-space priors; the confidence remains intentionally low.
      const depthProxy = clamp((vertical * 0.68) + ((1 - luminance / 255) * 0.22) + (localContrast * 0.1));
      const confidenceValue = clamp(0.14 + (vertical * 0.22) + (localContrast * 0.16), 0.14, 0.52);
      const sourceX = Math.round(x - offset.x * (0.22 + depthProxy * 0.78));
      const sourceY = Math.round(y - offset.y * (0.22 + depthProxy * 0.78));
      const isAvailable = sourceX >= 0 && sourceX < width && sourceY >= 0 && sourceY < height;
      const isDirectObservation = isAvailable && Math.abs(sourceX - x) <= 0.5 && Math.abs(sourceY - y) <= 0.5;
      const guideOffset = sourceOffset(width, x, y);

      depth[pixelIndex] = Math.round(depthProxy * 255);
      confidence[pixelIndex] = Math.round(confidenceValue * 255);
      confidenceTotal += confidenceValue;

      if (!isAvailable) {
        unobserved += 1;
        uncertainty[pixelIndex] = 255;
        guide[guideOffset] = 20;
        guide[guideOffset + 1] = 24;
        guide[guideOffset + 2] = 28;
        guide[guideOffset + 3] = 255;
        continue;
      }

      const sampledOffset = sourceOffset(width, sourceX, sourceY);
      guide[guideOffset] = decoded.data[sampledOffset]!;
      guide[guideOffset + 1] = decoded.data[sampledOffset + 1]!;
      guide[guideOffset + 2] = decoded.data[sampledOffset + 2]!;
      guide[guideOffset + 3] = decoded.data[sampledOffset + 3]!;
      if (isDirectObservation) {
        observed += 1;
        uncertainty[pixelIndex] = Math.round(clamp(1 - confidenceValue, 0.48, 0.86) * 255);
      } else {
        inferred += 1;
        uncertainty[pixelIndex] = Math.round(clamp(1 - confidenceValue * 0.62, 0.68, 0.94) * 255);
      }
    }
  }

  const pixelCount = width * height;
  const coverage = {
    observed: observed / pixelCount,
    inferred: inferred / pixelCount,
    unobserved: unobserved / pixelCount,
  } as const;
  const meanConfidence = confidenceTotal / pixelCount;
  const geometryConfidence = {
    value: clamp(
      meanConfidence * (coverage.observed + coverage.inferred * 0.55),
      0,
      0.52,
    ),
    basis: "heuristic" as const,
    method: "image_space_depth_proxy_with_bounded_parallax",
    version: COARSE_GEOMETRY_EVIDENCE_VERSION,
  };
  const [depthMap, depthConfidence, coarseCameraGuide, uncertaintyMask] = await Promise.all([
    artifactFor({
      kind: "depth-map",
      raw: depth,
      channels: 1,
      width,
      height,
      sourceArtifactHash: params.source.contentHash,
    }),
    artifactFor({
      kind: "depth-confidence",
      raw: confidence,
      channels: 1,
      width,
      height,
      sourceArtifactHash: params.source.contentHash,
    }),
    artifactFor({
      kind: "coarse-camera-guide",
      raw: guide,
      channels: 4,
      width,
      height,
      sourceArtifactHash: params.source.contentHash,
      targetCameraHash: params.targetCameraHash,
    }),
    artifactFor({
      kind: "uncertainty-mask",
      raw: uncertainty,
      channels: 1,
      width,
      height,
      sourceArtifactHash: params.source.contentHash,
      targetCameraHash: params.targetCameraHash,
    }),
  ]);

  return {
    depthMap,
    depthConfidence,
    coarseCameraGuide,
    uncertaintyMask,
    coverage,
    geometryConfidence,
  };
};
