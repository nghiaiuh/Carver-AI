/*
 * Flow: Builds truthful, worker-only evidence for one source/camera pair.
 * 1. Validate the canonical source bytes and normalize their orientation.
 * 2. Produce a deterministic camera overlay as an inspection artifact.
 * 3. Report missing geometry inputs explicitly instead of inventing coverage.
 */

import type { CameraSpec, SceneEvidence } from "@carver/shared";
import { SCENE_EVIDENCE_SCHEMA_VERSION } from "@carver/shared";
import { hashConditioningValue } from "./build-model-conditioning";
import {
  buildCameraOverlay,
  normalizeSourceArtifact,
  type CameraOverlayArtifact,
  type NormalizedSourceArtifact,
} from "./camera-overlay";

export const SCENE_EVIDENCE_BUILDER_VERSION = "scene-evidence-v1" as const;

export const SCENE_EVIDENCE_DEGRADATION_CODES = {
  sourceArtifactUnavailable: "SOURCE_ARTIFACT_UNAVAILABLE",
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
};

export type SceneEvidenceBuildResult = {
  readonly evidence: SceneEvidence;
  readonly artifacts: SceneEvidenceArtifacts;
};

const nonEmpty = (value: string | undefined | null) => value?.trim() ?? "";

const evidenceIdFor = (params: {
  sourceAssetId: string;
  sourceContentHash: string;
  targetCameraHash: string;
  protectedRegionMaskAssetId?: string;
  sourceArtifactHash?: string;
  cameraOverlayHash?: string;
}) =>
  `scene-evidence:${hashConditioningValue({
    builderVersion: SCENE_EVIDENCE_BUILDER_VERSION,
    sourceAssetId: params.sourceAssetId,
    sourceContentHash: params.sourceContentHash,
    targetCameraHash: params.targetCameraHash,
    protectedRegionMaskAssetId: params.protectedRegionMaskAssetId ?? null,
    sourceArtifactHash: params.sourceArtifactHash ?? null,
    cameraOverlayHash: params.cameraOverlayHash ?? null,
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
 * MA-009 intentionally does not claim depth, coverage, or a camera guide.
 * Those arrive in MA-010. A successful source/overlay receipt is therefore
 * `partial`, never falsely `ready`.
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
  const sourceContentHash = nonEmpty(params.source.contentHash);
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

  let cameraOverlay: CameraOverlayArtifact;
  try {
    cameraOverlay = await buildCameraOverlay({
      source: normalizedSource,
      camera: params.targetCamera,
      targetCameraHash,
    });
  } catch {
    return {
      evidence: unavailableEvidence({
        sourceAssetId,
        sourceContentHash,
        targetCameraHash,
        protectedRegionMaskAssetId: params.protectedRegionMaskAssetId,
        degradationCodes: [
          SCENE_EVIDENCE_DEGRADATION_CODES.cameraOverlayUnavailable,
          SCENE_EVIDENCE_DEGRADATION_CODES.depthUnavailable,
          SCENE_EVIDENCE_DEGRADATION_CODES.coarseCameraGuideUnavailable,
          SCENE_EVIDENCE_DEGRADATION_CODES.uncertaintyMaskUnavailable,
        ],
      }),
      artifacts: { normalizedSource },
    };
  }

  const degradationCodes = [
    SCENE_EVIDENCE_DEGRADATION_CODES.depthUnavailable,
    SCENE_EVIDENCE_DEGRADATION_CODES.coarseCameraGuideUnavailable,
    SCENE_EVIDENCE_DEGRADATION_CODES.uncertaintyMaskUnavailable,
  ];
  const evidence: SceneEvidence = {
    schemaVersion: SCENE_EVIDENCE_SCHEMA_VERSION,
    evidenceId: evidenceIdFor({
      sourceAssetId,
      sourceContentHash,
      targetCameraHash,
      protectedRegionMaskAssetId: params.protectedRegionMaskAssetId,
      sourceArtifactHash: normalizedSource.contentHash,
      cameraOverlayHash: cameraOverlay.contentHash,
    }),
    sourceImage: { assetId: sourceAssetId },
    sourceContentHash,
    targetCameraHash,
    builderVersion: SCENE_EVIDENCE_BUILDER_VERSION,
    status: "partial",
    geometryConfidence: {
      value: null,
      basis: "unknown",
      method: "validated_source_and_camera_overlay_only",
      version: SCENE_EVIDENCE_BUILDER_VERSION,
    },
    ...(params.protectedRegionMaskAssetId
      ? { protectedRegionMask: { assetId: params.protectedRegionMaskAssetId } }
      : {}),
    degradationCodes,
  };

  return {
    evidence,
    artifacts: { normalizedSource, cameraOverlay },
  };
};
