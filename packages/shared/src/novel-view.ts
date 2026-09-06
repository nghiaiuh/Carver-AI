export const NOVEL_VIEW_PROMPT_COMPILER_VERSION = "novel-view-v1" as const;
export const CAMERA_SPEC_SCHEMA_VERSION = 1 as const;
export const CAMERA_NORMALIZATION_VERSION = "camera-normalization-v1" as const;
export const CAMERA_SPEC_CONVENTION = "rh_y_up_camera_minus_z_v1" as const;

export type CameraVector3 = readonly [number, number, number];
export type CameraVector2 = readonly [number, number];

export type CameraProvenance = {
  readonly origin: "user_authored" | "captured" | "model_estimate" | "geometric_derivation" | "generated";
  readonly inputAssetIds: readonly string[];
  readonly method: string;
  readonly version: string;
  readonly assumptions: readonly string[];
};

export type CameraPose = {
  readonly position: CameraVector3;
  readonly target: CameraVector3;
  readonly up: CameraVector3;
};

export type PerspectiveProjection = {
  readonly model: "pinhole";
  readonly horizontalFovDeg: number;
  readonly aspectRatio: number;
  readonly principalPointUv: CameraVector2;
};

/**
 * Legacy camera distances are virtual scene units until a calibrated scene
 * frame is introduced. This marker prevents UI metres from becoming facts.
 */
export type VirtualCameraScale = {
  readonly unit: "relative";
  readonly calibration: "uncalibrated";
  readonly reference: "source_frame" | "plan_frame";
};

export type CameraSpec = {
  readonly schemaVersion: typeof CAMERA_SPEC_SCHEMA_VERSION;
  readonly normalizationVersion: string;
  readonly convention: typeof CAMERA_SPEC_CONVENTION;
  readonly coordinateSpace: "source_relative" | "plan_world";
  readonly pose: CameraPose;
  readonly projection: PerspectiveProjection;
  readonly framingMode: "preserve_subject" | "preserve_footprint" | "custom";
  readonly virtualScale: VirtualCameraScale;
  readonly authored?: {
    readonly azimuthDeltaDeg?: number;
    readonly elevationDeltaDeg?: number;
    readonly distanceRatio?: number;
    readonly focalLengthEquivalentMm?: number;
    readonly rollDeg?: number;
  };
  readonly provenance: CameraProvenance;
};

/**
 * Snapshot-compatible input for the existing CameraShotDirective shape.
 * The normalizer verifies that exactly the selected mode's transform exists.
 */
export type LegacyCameraShot = {
  readonly mode: "plan" | "orbit";
  readonly shotId?: string;
  readonly shotSetNodeId?: string;
  readonly plan?: {
    readonly u: number;
    readonly v: number;
    readonly targetU: number;
    readonly targetV: number;
    readonly height: number;
    readonly targetHeight?: number;
    readonly lens: number;
    readonly pitch: number;
    readonly roll?: number;
    readonly viewDirection: "auto" | "look-at-target" | "manual";
  };
  readonly orbit?: {
    readonly rotate: number;
    readonly tilt: number;
    readonly distance: number;
    readonly lens: number;
  };
};

export type LegacyPlanWorldSize = {
  readonly width: number;
  readonly depth: number;
};

export type LegacyCameraAdaptationOptions = {
  readonly aspectRatio?: number;
  readonly planWorldSize?: LegacyPlanWorldSize;
  readonly framingMode?: CameraSpec["framingMode"];
  readonly inputAssetIds?: readonly string[];
  readonly provenance?: Partial<CameraProvenance>;
};

export type ChangeAngleOperation = {
  operation: "novel_view_reconstruction";
  executionMode: "image_edit";
  shot: {
    id: string;
    name: string;
    mode: "orbit";
    azimuthDeg: number;
    elevationDeg: number;
    distanceM?: number;
    lensMm?: number;
    target: "scene_center";
  };
  scene: {
    targetId: string;
    targetName?: string;
  };
};

export type ReconstructionRisk = "low" | "moderate" | "high" | "very_high";

export type NovelViewGenerationPolicy = {
  preserveSceneIdentity: true;
  preserveLayout: true;
  preserveObjectPositions: true;
  preserveMaterials: true;
  allowRedesign: false;
  allowRelocation: false;
  allowMirroring: false;
};

export type ImageGenerationRequest = {
  operation: "novel_view_reconstruction";
  sourceImageId: string;
  shotId: string;
  camera: {
    mode: "orbit";
    azimuthDeg: number;
    elevationDeg: number;
    distanceM?: number;
    lensMm?: number;
    target: "scene_center";
  };
  /** Canonical camera state carried with new requests; absent on legacy requests. */
  cameraSpec?: CameraSpec;
  prompt: string;
  policy: NovelViewGenerationPolicy;
};
