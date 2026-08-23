export const NOVEL_VIEW_PROMPT_COMPILER_VERSION = "novel-view-v1" as const;

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
  prompt: string;
  policy: NovelViewGenerationPolicy;
};
