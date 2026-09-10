/*
 * Flow: Builds truthful, worker-only evidence for one source/camera pair.
 * 1. Validate the canonical source bytes and normalize their orientation.
 * 2. Produce deterministic, conservative 2.5D evidence for the target camera.
 * 3. Carry uncertainty and coverage explicitly instead of claiming measured geometry.
 */

import type { CameraSpec, SceneEvidence } from "@carver/shared";
import { SCENE_EVIDENCE_SCHEMA_VERSION } from "@carver/shared";
import { hashConditioningValue, hashSourceImageContent } from "./build-model-conditioning";
import {
  buildCameraOverlay,
  normalizeSourceArtifact,
  type CameraOverlayArtifact,
  type NormalizedSourceArtifact,
} from "./camera-overlay";
import {
  buildCoarseGeometryEvidence,
  type CoarseGeometryArtifact,
} from "./coarse-geometry-evidence";

export const SCENE_EVIDENCE_BUILDER_VERSION = "scene-evidence-v2" as const;

export const SCENE_EVIDENCE_DEGRADATION_CODES = {
  sourceArtifactUnavailable: "SOURCE_ARTIFACT_UNAVAILABLE",
  sourceContentHashMismatch: "SOURCE_CONTENT_HASH_MISMATCH",
  cameraOverlayUnavailable: "CAMERA_OVERLAY_UNAVAILABLE",
  depthUnavailable: "DEPTH_UNAVAILABLE",
  coarseCameraGuideUnavailable: "COARSE_CAMERA_GUIDE_UNAVAILABLE",
  uncertaintyMaskUnavailable: "UNCERTAINTY_MASK_UNAVAILABLE",
} as const;

export type SceneEvidenceArtifacts = {
  /** Orientation-safe source pixels, kept in worker memory only. */
  readonly normalizedSource?: NormalizedSourceArtifact;
  /** Inspection receipt; it is not a provider image or a persistent asset. */
  readonly cameraOverlay?: CameraOverlayArtifact;
  /** Coarse worker-local evidence; never an R2 key, signed URL, or snapshot field. */
  readonly depthMap?: CoarseGeometryArtifact;
  readonly depthConfidence?: CoarseGeometryArtifact;
  readonly coarseCameraGuide?: CoarseGeometryArtifact;
  readonly uncertaintyMask?: CoarseGeometryArtifact;
};

export type SceneEvidenceBuildResult = {
  readonly evidence: SceneEvidence;
  readonly artifacts: SceneEvidenceArtifacts;
};

/** The two evidence images that are safe and useful to pass to an image provider. */
export type SceneEvidenceProviderImage = {
  readonly role: "camera_guide" | "uncertainty_guide";
  readonly assetId: string;
  readonly required: true;
  readonly buffer: Buffer;
  readonly mimeType: "image/png";
};

export const buildSceneEvidenceProviderImages = (
  artifacts: SceneEvidenceArtifacts,
): SceneEvidenceProviderImage[] => [
  ...(artifacts.coarseCameraGuide
    ? [{
        role: "camera_guide" as const,
        assetId: artifacts.coarseCameraGuide.artifactId,
        required: true as const,
        buffer: artifacts.coarseCameraGuide.buffer,
        mimeType: artifacts.coarseCameraGuide.mimeType,
      }]
    : []),
  ...(artifacts.uncertaintyMask
    ? [{
        role: "uncertainty_guide" as const,
        assetId: artifacts.uncertaintyMask.artifactId,
        required: true as const,
        buffer: artifacts.uncertaintyMask.buffer,
        mimeType: artifacts.uncertaintyMask.mimeType,
      }]
    : []),
];

const nonEmpty = (value: string | undefined | null) => value?.trim() ?? "";

const evidenceIdFor = (params: {
  sourceAssetId: string;
  sourceContentHash: string;
  targetCameraHash: string;
  protectedRegionMaskAssetId?: string;
  sourceArtifactHash?: string;
  cameraOverlayHash?: string;
  geometryArtifactHashes?: Readonly<Record<string, string>>;
}) =>
  `scene-evidence:${hashConditioningValue({
    builderVersion: SCENE_EVIDENCE_BUILDER_VERSION,
    sourceAssetId: params.sourceAssetId,
    sourceContentHash: params.sourceContentHash,
    targetCameraHash: params.targetCameraHash,
    protectedRegionMaskAssetId: params.protectedRegionMaskAssetId ?? null,
    sourceArtifactHash: params.sourceArtifactHash ?? null,
    cameraOverlayHash: params.cameraOverlayHash ?? null,
    geometryArtifactHashes: params.geometryArtifactHashes ?? null,
  })}`;

const unavailableEvidence = (params: {
  sourceAssetId: string;
  sourceContentHash: string;
  targetCameraHash: string;
  protectedRegionMaskAssetId?: string;
  degradationCodes: readonly string[];
}): SceneEvidence => ({
  schemaVersion: SCENE_EVIDENCE_SCHEMA_VERSION,
  evidenceId: evidenceIdFor(params),
  sourceImage: { assetId: params.sourceAssetId },
  sourceContentHash: params.sourceContentHash,
  targetCameraHash: params.targetCameraHash,
  builderVersion: SCENE_EVIDENCE_BUILDER_VERSION,
  status: "unavailable",
  geometryConfidence: {
    value: null,
    basis: "unknown",
    method: "source_evidence_validation_failed",
    version: SCENE_EVIDENCE_BUILDER_VERSION,
  },
  ...(params.protectedRegionMaskAssetId
    ? { protectedRegionMask: { assetId: params.protectedRegionMaskAssetId } }
    : {}),
  degradationCodes: [...params.degradationCodes],
});

/**
 * MA-010 builds a bounded 2.5D proxy, not calibrated reconstruction. A ready
 * receipt therefore still carries heuristic confidence, an uncertainty mask,
 * and coverage split into observed, inferred, and unobserved pixels.
 */
export const buildSceneEvidence = async (params: {
  source: {
    readonly assetId: string;
    readonly buffer: Buffer;
    readonly contentHash: string;
  };
  targetCamera: CameraSpec;
  targetCameraHash?: string;
  protectedRegionMaskAssetId?: string;
}): Promise<SceneEvidenceBuildResult> => {
  const sourceAssetId = nonEmpty(params.source.assetId);
  const declaredSourceContentHash = nonEmpty(params.source.contentHash);
  const measuredSourceContentHash = Buffer.isBuffer(params.source.buffer)
    ? hashSourceImageContent(params.source.buffer)
    : "";
  const sourceContentHash = measuredSourceContentHash || declaredSourceContentHash;
  let targetCameraHash = nonEmpty(params.targetCameraHash);

  try {
    targetCameraHash ||= hashConditioningValue(params.targetCamera);
  } catch {
    targetCameraHash = "invalid-camera";
  }

  if (!sourceAssetId || !sourceContentHash || targetCameraHash === "invalid-camera") {
    return {
      evidence: unavailableEvidence({
        sourceAssetId: sourceAssetId || "unknown-source",
        sourceContentHash: sourceContentHash || "unknown-source-content",
        targetCameraHash,
        protectedRegionMaskAssetId: params.protectedRegionMaskAssetId,
        degradationCodes: [
          SCENE_EVIDENCE_DEGRADATION_CODES.sourceArtifactUnavailable,
          SCENE_EVIDENCE_DEGRADATION_CODES.cameraOverlayUnavailable,
        ],
      }),
      artifacts: {},
    };
  }

  // The evidence receipt must bind to the bytes the worker actually decoded,
  // rather than trusting a caller-provided label for those bytes. This makes a
  // stale asset read or an accidental source swap explicit before conditioning.
  if (!declaredSourceContentHash || declaredSourceContentHash !== measuredSourceContentHash) {
    return {
      evidence: unavailableEvidence({
        sourceAssetId,
        sourceContentHash,
        targetCameraHash,
        protectedRegionMaskAssetId: params.protectedRegionMaskAssetId,
        degradationCodes: [
          SCENE_EVIDENCE_DEGRADATION_CODES.sourceArtifactUnavailable,
          SCENE_EVIDENCE_DEGRADATION_CODES.sourceContentHashMismatch,
          SCENE_EVIDENCE_DEGRADATION_CODES.cameraOverlayUnavailable,
        ],
      }),
      artifacts: {},
    };
  }

  let normalizedSource: NormalizedSourceArtifact;
  try {
    normalizedSource = await normalizeSourceArtifact(params.source.buffer);
  } catch {
    return {
      evidence: unavailableEvidence({
        sourceAssetId,
        sourceContentHash,
        targetCameraHash,
        protectedRegionMaskAssetId: params.protectedRegionMaskAssetId,
        degradationCodes: [
          SCENE_EVIDENCE_DEGRADATION_CODES.sourceArtifactUnavailable,
          SCENE_EVIDENCE_DEGRADATION_CODES.cameraOverlayUnavailable,
        ],
      }),
      artifacts: {},
    };
  }

  let cameraOverlay: CameraOverlayArtifact | undefined;
  let cameraOverlayUnavailable = false;
  try {
    cameraOverlay = await buildCameraOverlay({
      source: normalizedSource,
      camera: params.targetCamera,
      targetCameraHash,
    });
  } catch {
    // The overlay is an inspection receipt only; a renderer failure must not
    // prevent the independent conservative-geometry path from running.
    cameraOverlayUnavailable = true;
  }

  let geometry: Awaited<ReturnType<typeof buildCoarseGeometryEvidence>>;
  try {
    geometry = await buildCoarseGeometryEvidence({
      source: normalizedSource,
      camera: params.targetCamera,
      targetCameraHash,
    });
  } catch {
    const degradationCodes = [
      ...(cameraOverlayUnavailable ? [SCENE_EVIDENCE_DEGRADATION_CODES.cameraOverlayUnavailable] : []),
      SCENE_EVIDENCE_DEGRADATION_CODES.depthUnavailable,
      SCENE_EVIDENCE_DEGRADATION_CODES.coarseCameraGuideUnavailable,
      SCENE_EVIDENCE_DEGRADATION_CODES.uncertaintyMaskUnavailable,
    ];
    return {
      evidence: {
        schemaVersion: SCENE_EVIDENCE_SCHEMA_VERSION,
        evidenceId: evidenceIdFor({
          sourceAssetId,
          sourceContentHash,
          targetCameraHash,
          protectedRegionMaskAssetId: params.protectedRegionMaskAssetId,
          sourceArtifactHash: normalizedSource.contentHash,
          ...(cameraOverlay ? { cameraOverlayHash: cameraOverlay.contentHash } : {}),
        }),
        sourceImage: { assetId: sourceAssetId },
        sourceContentHash,
        targetCameraHash,
        builderVersion: SCENE_EVIDENCE_BUILDER_VERSION,
        status: "partial",
        geometryConfidence: {
          value: null,
          basis: "unknown",
          method: "coarse_geometry_evidence_unavailable",
          version: SCENE_EVIDENCE_BUILDER_VERSION,
        },
        ...(params.protectedRegionMaskAssetId
          ? { protectedRegionMask: { assetId: params.protectedRegionMaskAssetId } }
          : {}),
        degradationCodes,
      },
      artifacts: { normalizedSource, ...(cameraOverlay ? { cameraOverlay } : {}) },
    };
  }

  const degradationCodes = cameraOverlayUnavailable
    ? [SCENE_EVIDENCE_DEGRADATION_CODES.cameraOverlayUnavailable]
    : [];
  const evidence: SceneEvidence = {
    schemaVersion: SCENE_EVIDENCE_SCHEMA_VERSION,
    evidenceId: evidenceIdFor({
      sourceAssetId,
      sourceContentHash,
      targetCameraHash,
      protectedRegionMaskAssetId: params.protectedRegionMaskAssetId,
      sourceArtifactHash: normalizedSource.contentHash,
      ...(cameraOverlay ? { cameraOverlayHash: cameraOverlay.contentHash } : {}),
      geometryArtifactHashes: {
        depthMap: geometry.depthMap.contentHash,
        depthConfidence: geometry.depthConfidence.contentHash,
        coarseCameraGuide: geometry.coarseCameraGuide.contentHash,
        uncertaintyMask: geometry.uncertaintyMask.contentHash,
      },
    }),
    sourceImage: { assetId: sourceAssetId },
    sourceContentHash,
    targetCameraHash,
    builderVersion: SCENE_EVIDENCE_BUILDER_VERSION,
    status: cameraOverlayUnavailable ? "partial" : "ready",
    depthMap: { assetId: geometry.depthMap.artifactId },
    depthConfidence: { assetId: geometry.depthConfidence.artifactId },
    coarseCameraGuide: { assetId: geometry.coarseCameraGuide.artifactId },
    uncertaintyMask: { assetId: geometry.uncertaintyMask.artifactId },
    geometryConfidence: geometry.geometryConfidence,
    coverage: geometry.coverage,
    ...(params.protectedRegionMaskAssetId
      ? { protectedRegionMask: { assetId: params.protectedRegionMaskAssetId } }
      : {}),
    degradationCodes,
  };

  return {
    evidence,
    artifacts: {
      normalizedSource,
      ...(cameraOverlay ? { cameraOverlay } : {}),
      depthMap: geometry.depthMap,
      depthConfidence: geometry.depthConfidence,
      coarseCameraGuide: geometry.coarseCameraGuide,
      uncertaintyMask: geometry.uncertaintyMask,
    },
  };
};
