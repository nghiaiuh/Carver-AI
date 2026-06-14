import { detectLandscapeContext } from "./landscapeRules";
import { scorePromptSpecificity } from "./promptScoring";
import { enhancePromptWithOpenAI } from "./openAiEnhanceFallback";
import { buildStructuredEditingPrompt } from "./structuredPromptBuilder";
import type { EnhanceMode, EnhancePromptInput, EnhancePromptResult } from "./enhanceTypes";
import type { ImageReferenceInfo } from "./types";

const DEFAULT_MODE: EnhanceMode = "image_editing";

function detectReferencesFromPrompt(prompt: string): ImageReferenceInfo[] {
  const normalizedPrompt = prompt.toLowerCase();
  const references: ImageReferenceInfo[] = [{ imageLabel: "Image A", role: "direct_edit_target" }];

  if (normalizedPrompt.includes("anh 2") || normalizedPrompt.includes("image b")) {
    references.push({
      imageLabel: "Image B",
      role: "architectural_reference",
      targetArea: normalizedPrompt.includes("mep trai") || normalizedPrompt.includes("left edge") ? "left edge" : undefined,
      targetObject: "house / structure",
    });
  }

  if (normalizedPrompt.includes("anh 3") || normalizedPrompt.includes("image c")) {
    references.push({
      imageLabel: "Image C",
      role: "architectural_reference",
      targetArea:
        normalizedPrompt.includes("gan giua ben duoi") || normalizedPrompt.includes("lower middle")
          ? "near the lower middle area"
          : undefined,
      targetObject: "house / structure",
    });
  }

  return references;
}

export async function enhancePrompt({
  prompt,
  mode = DEFAULT_MODE,
  useAiFallback = true,
  forceAiFallback = false,
  projectContext,
}: EnhancePromptInput): Promise<EnhancePromptResult> {
  const originalPrompt = prompt.trim();
  const context = detectLandscapeContext(originalPrompt);
  const scoreResult = scorePromptSpecificity(originalPrompt, mode, context);
  const replacementObjects = context.replacementObject ? [context.replacementObject] : [];
  const materials = context.material ? [context.material] : [];
  const plants = context.intent === "planting_design" ? context.objects : [];
  const styles = context.style ? [context.style] : [];
  const references = detectReferencesFromPrompt(context.normalizedPrompt);
  const structuredPrompt = buildStructuredEditingPrompt({
    originalPrompt,
    mode,
    intent: context.intent,
    targetObjects: context.objects,
    targetAreas: context.targetAreas,
    replacementObjects,
    materials,
    plants,
    styles,
    references,
    projectContext: {
      ...projectContext,
      preservationProfile:
        context.intent === "architecture_replace"
          ? "architecture_edit"
          : context.intent === "planting_design"
            ? "planting_edit"
            : context.intent === "change_material"
              ? "material_edit"
              : context.intent === "koi_pond" || context.intent === "rockery_waterfall" || context.intent === "water_feature"
                ? "water_feature_edit"
                : "full_garden",
    },
    score: scoreResult.score,
  });
  const ruleScaffold = structuredPrompt.prompt;

  let enhancedPrompt = structuredPrompt.prompt;
  let usedAiFallback = false;
  let attemptedAiFallback = false;
  let fallbackError: string | null = null;
  const fallbackReason = forceAiFallback
    ? "AI enhancement was forced for this request."
    : useAiFallback
      ? "Hybrid enhancement uses the rule-based scaffold first, then asks AI to refine it."
      : scoreResult.shouldUseAiFallback
        ? "AI enhancement is disabled, so only the rule scaffold was applied."
        : "OpenAI enhancement is disabled, so only the rule scaffold was applied.";

  if (useAiFallback || forceAiFallback) {
    attemptedAiFallback = true;
    try {
      enhancedPrompt = await enhancePromptWithOpenAI({
        prompt: originalPrompt,
        ruleScaffold,
        mode,
        projectContext,
      });
      usedAiFallback = true;
    } catch (error) {
      usedAiFallback = false;
      fallbackError = error instanceof Error ? error.message : "OpenAI fallback failed.";
    }
  }

  return {
    originalPrompt,
    enhancedPrompt,
    ruleScaffold,
    mode,
    detectedIntent: context.intent,
    score: scoreResult.score,
    usedAiFallback,
    detectedObjects: context.objects,
    detectedTargetAreas: context.targetAreas,
    detectedStyle: context.style,
    preserveRules: context.preserveRules,
    negativeRules: context.negativeRules,
    fallbackReason,
    fallbackError,
    attemptedAiFallback,
    scoringReasons: scoreResult.reasons,
  };
}
