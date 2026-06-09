/*
 * Flow: Participates in the Landscape Prompt Compiler.
 * 1. Receive raw landscape prompt context.
 * 2. Detect task intent, scope, risk, or constraints.
 * 3. Return structured prompt data for enhance/generate APIs.
 */

export type LandscapeTaskType =
  | "add_object"
  | "remove_object"
  | "replace_object"
  | "change_material"
  | "change_lighting"
  | "enhance_quality"
  | "planting_design"
  | "house_replacement"
  | "rockery_replacement"
  | "koi_pond_edge_design"
  | "courtyard_paving"
  | "tree_row_addition"
  | "reference_image_match"
  | "full_redesign"
  | "strict_local_edit"
  | "unknown";

export type EditScope =
  | "local_edit"
  | "area_edit"
  | "object_edit"
  | "global_style_edit"
  | "full_redesign"
  | "unknown";

export type PromptRiskLevel = "low" | "medium" | "high";

export type PromptMode = "auto" | "review" | "expert";

export type EditBrief = {
  title: string;
  summary: string;
  detectedIntent: string;
  targetArea?: string;
  targetObject?: string;
  preserve: string[];
  modify: string[];
  avoid: string[];
  quality: string[];
};

export type PromptEngineContext = unknown;

export type EnhanceLandscapePromptInput = {
  rawPrompt: string;
  projectContext?: PromptEngineContext;
  imageContext?: PromptEngineContext;
  referenceImages?: unknown[];
  userStylePreset?: string;
  generationMode?: string;
  promptMode?: PromptMode;
};

export type EnhanceLandscapePromptResult = {
  rawPrompt: string;
  enhancedPrompt: string;
  taskType: LandscapeTaskType;
  editScope: EditScope;
  riskLevel: PromptRiskLevel;
  targetArea?: string;
  targetObject?: string;
  preserveRules: string[];
  negativeConstraints: string[];
  formulaUsed: string;
  editBrief: EditBrief;
  shouldShowReview: boolean;
};

export type EnhancePromptDraftInput = Omit<EnhanceLandscapePromptInput, "promptMode" | "generationMode">;

export type EnhancePromptDraftResult = {
  rawPrompt: string;
  enhancedDraft: string;
  taskType: LandscapeTaskType;
  editScope: EditScope;
  riskLevel: PromptRiskLevel;
  targetArea?: string;
  targetObject?: string;
  formulaUsed: string;
  editBrief: EditBrief;
  shouldShowReview: boolean;
};

export type PromptMeta = Omit<EnhanceLandscapePromptResult, "rawPrompt" | "enhancedPrompt" | "preserveRules" | "negativeConstraints"> & {
  preserveRules: string[];
  negativeConstraints: string[];
  enhancedPrompt?: string;
};
