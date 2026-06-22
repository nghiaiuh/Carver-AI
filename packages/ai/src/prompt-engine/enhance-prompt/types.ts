import type { EnhanceMode, EnhanceProjectContext, LandscapeIntent } from "./enhanceTypes";

export type { EnhanceMode, LandscapeIntent } from "./enhanceTypes";

export type PreservationProfile =
  | "full_garden"
  | "architecture_edit"
  | "planting_edit"
  | "material_edit"
  | "water_feature_edit"
  | "minimal";

export type ImageReferenceInfo = {
  imageLabel: "Image A" | "Image B" | "Image C" | "Image D";
  role:
    | "direct_edit_target"
    | "architectural_reference"
    | "plant_reference"
    | "material_reference"
    | "style_reference"
    | "layout_reference";
  targetArea?: string;
  targetObject?: string;
};

export type ProjectContext = EnhanceProjectContext & {
  preservationProfile?: PreservationProfile;
};

export type BuildStructuredPromptInput = {
  originalPrompt: string;
  mode?: EnhanceMode;
  intent: LandscapeIntent;
  targetObjects?: string[];
  targetAreas?: string[];
  replacementObjects?: string[];
  materials?: string[];
  plants?: string[];
  styles?: string[];
  references?: ImageReferenceInfo[];
  projectContext?: ProjectContext;
  score?: number;
};

export type StructuredPromptResult = {
  prompt: string;
  promptFormat: "structured_editing_prompt_v1";
  sections: string[];
};
