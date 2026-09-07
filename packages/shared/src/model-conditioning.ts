/*
 * Flow: Defines the provider-neutral multimodal conditioning boundary.
 * 1. Keep semantic intent, source identity, camera state, and evidence separate.
 * 2. Reference only stable asset IDs; runtime URLs and image bytes never cross this boundary.
 * 3. Let provider adapters map this contract to their own request formats later.
 */

import type { CameraSpec } from "./novel-view";

export const MODEL_CONDITIONING_SCHEMA_VERSION = 1 as const;
export const SCENE_EVIDENCE_SCHEMA_VERSION = 1 as const;
export const PROMPT_SPEC_SCHEMA_VERSION = 1 as const;

export type TaskMode = "view_only" | "design_then_view" | "plan_to_perspective";

/** A durable asset identity. It deliberately contains no URL, storage path, or bytes. */
export type AssetRef = {
  readonly assetId: string;
};

export type Confidence = {
  readonly value: number | null;
  readonly basis: "measured" | "estimated" | "heuristic" | "unknown";
  readonly method: string;
  readonly version: string;
};

export type Provenance = {
  readonly origin:
    | "user_authored"
    | "captured"
    | "model_estimate"
    | "geometric_derivation"
    | "generated"
    | "unknown";
  readonly inputAssetIds: readonly string[];
  readonly method: string;
  readonly version: string;
  readonly assumptions: readonly string[];
};

export type AuthoritativeSourceKind = "site_image" | "design_result" | "plan" | "unknown";

export type AuthoritativeSource = {
  readonly image: AssetRef & {
    readonly width: number;
    readonly height: number;
    readonly mimeType: string;
  };
  readonly nodeId: string;
  readonly kind: AuthoritativeSourceKind;
  readonly provenance: Provenance;
};

export type ReferenceInputRole = "layout" | "style" | "material" | "object" | "composition";

export type ReferenceInput = {
  readonly contextId: string;
  readonly image: AssetRef;
  readonly role: ReferenceInputRole;
  readonly sourceNodeId: string;
  /**
   * Optional while older snapshots do not serialize graph edge IDs with every
   * expanded reference. Newer graph resolvers may fill it without changing
   * the provider-neutral contract.
   */
  readonly sourceEdgeId?: string;
  readonly required: boolean;
  readonly provenance: Provenance;
};

export type SceneConstraints = {
  readonly preserveExactly: readonly string[];
  readonly changeOnly: readonly string[];
  readonly forbiddenChanges: readonly string[];
  readonly protectedRegionIds: readonly string[];
  readonly newlyRevealedPolicy: "conservative_continuation" | "require_observation";
};

export type PromptSpec = {
  readonly schemaVersion: typeof PROMPT_SPEC_SCHEMA_VERSION;
  readonly taskType: TaskMode;
  readonly authoritativeSourceDescription: string;
  readonly targetCameraInstruction: string;
  readonly preserveExactly: readonly string[];
  readonly changeOnly: readonly string[];
  readonly newlyRevealedAreas: readonly string[];
  readonly forbiddenChanges: readonly string[];
  readonly outputValidation: readonly string[];
  readonly planHash: string;
};

export type SceneEvidence = {
  readonly schemaVersion: typeof SCENE_EVIDENCE_SCHEMA_VERSION;
  readonly evidenceId: string;
  readonly sourceImage: AssetRef;
  readonly sourceContentHash: string;
  readonly targetCameraHash: string;
  readonly builderVersion: string;
  readonly status: "ready" | "partial" | "unavailable";
  readonly depthMap?: AssetRef;
  readonly depthConfidence?: AssetRef;
  readonly coarseCameraGuide?: AssetRef;
  readonly uncertaintyMask?: AssetRef;
  readonly protectedRegionMask?: AssetRef;
  readonly semanticMasks?: readonly AssetRef[];
  readonly cameraOverlay?: AssetRef;
  readonly geometryConfidence: Confidence;
  readonly coverage?: {
    readonly observed: number;
    readonly inferred: number;
    readonly unobserved: number;
  };
  readonly degradationCodes: readonly string[];
};

/**
 * The immutable, provider-neutral package assembled for one multi-angle
 * request/shot. Provider models, endpoints, output counts, upload handles,
 * FormData, and image bytes intentionally do not belong here.
 */
export type ModelConditioning = {
  readonly schemaVersion: typeof MODEL_CONDITIONING_SCHEMA_VERSION;
  readonly conditioningId: string;
  readonly conditioningHash: string;
  readonly taskMode: TaskMode;
  readonly authoritativeSource: AuthoritativeSource;
  readonly targetCamera: CameraSpec;
  readonly sceneEvidence: SceneEvidence;
  readonly referenceImages: readonly ReferenceInput[];
  /** Structured constraints stay separate from provider prompt rendering. */
  readonly constraints: SceneConstraints;
  readonly instructions: PromptSpec;
  readonly metadata: {
    readonly promptCompilerVersion: string;
    readonly cameraNormalizationVersion: string;
    readonly geometryPipelineVersion?: string;
  };
};

/** Roles are semantic image purposes, not provider multipart field names. */
export type ConditioningImageRole =
  | "authoritative_source"
  | "camera_guide"
  | "uncertainty_guide"
  | "protected_region"
  | "reference";
