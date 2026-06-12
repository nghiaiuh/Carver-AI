export type EnhanceMode =
  | "image_generation"
  | "image_editing"
  | "design_analysis"
  | "plant_recommendation"
  | "material_change"
  | "layout_preservation";

export type LandscapeIntent =
  | "add_object"
  | "remove_object"
  | "replace_object"
  | "change_material"
  | "enhance_realism"
  | "redesign_area"
  | "preserve_layout"
  | "planting_design"
  | "lighting_design"
  | "water_feature"
  | "rockery_waterfall"
  | "koi_pond"
  | "paving_design"
  | "architecture_replace"
  | "unknown";

export type EnhanceProjectContext = {
  style?: string;
  areaType?: string;
  hasImage?: boolean;
  lockedObjects?: string[];
};

export type PromptSpecificityScore = {
  score: number;
  reasons: string[];
  shouldUseAiFallback: boolean;
};

export type DetectedLandscapeContext = {
  normalizedPrompt: string;
  intent: LandscapeIntent;
  objects: string[];
  targetAreas: string[];
  style: string | null;
  preserveRules: string[];
  negativeRules: string[];
  material: string | null;
  replacementObject: string | null;
  detectedPreserveDirectives: string[];
  detectedModeHints: EnhanceMode[];
};

export type EnhancePromptInput = {
  prompt: string;
  mode?: EnhanceMode;
  useAiFallback?: boolean;
  forceAiFallback?: boolean;
  projectContext?: EnhanceProjectContext;
};

export type EnhancePromptResult = {
  originalPrompt: string;
  enhancedPrompt: string;
  ruleScaffold: string;
  mode: EnhanceMode;
  detectedIntent: LandscapeIntent;
  score: number;
  usedAiFallback: boolean;
  detectedObjects: string[];
  detectedTargetAreas: string[];
  detectedStyle?: string | null;
  preserveRules: string[];
  negativeRules: string[];
  fallbackReason: string | null;
  fallbackError: string | null;
  attemptedAiFallback: boolean;
  scoringReasons: string[];
};
