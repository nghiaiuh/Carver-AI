import { detectLandscapeContext } from "./landscapeRules";
import { scorePromptSpecificity } from "./promptScoring";
import { buildRuleBasedEnhancedPrompt, buildRuleBasedScaffold } from "./promptTemplates";
import { enhancePromptWithOpenAI } from "./openAiEnhanceFallback";
import type { EnhanceMode, EnhancePromptInput, EnhancePromptResult } from "./enhanceTypes";

const DEFAULT_MODE: EnhanceMode = "image_editing";

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
  const ruleScaffold = buildRuleBasedScaffold(originalPrompt, context, mode);

  let enhancedPrompt = buildRuleBasedEnhancedPrompt(originalPrompt, context);
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
