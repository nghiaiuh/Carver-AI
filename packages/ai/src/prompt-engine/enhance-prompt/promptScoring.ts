import type { DetectedLandscapeContext, EnhanceMode, PromptSpecificityScore } from "./enhanceTypes";

export function scorePromptSpecificity(
  prompt: string,
  mode: EnhanceMode,
  context: DetectedLandscapeContext,
): PromptSpecificityScore {
  let score = 0;
  const reasons: string[] = [];

  if (context.intent !== "unknown") {
    score += 20;
    reasons.push("Detected a clear editing intent.");
  }

  if (context.objects.length > 0) {
    score += 20;
    reasons.push("Detected specific landscape objects.");
  }

  if (context.targetAreas.length > 0) {
    score += 15;
    reasons.push("Detected a target area.");
  }

  if (context.style) {
    score += 15;
    reasons.push("Detected a style preset.");
  }

  if (context.detectedPreserveDirectives.length > 0) {
    score += 15;
    reasons.push("Detected preservation rules from the user prompt.");
  }

  if (context.material || context.objects.some((object) => /(pond|waterfall|house|gazebo|paving|palm|bamboo|bonsai)/i.test(object))) {
    score += 10;
    reasons.push("Detected material, planting, architecture, or water-feature detail.");
  }

  if (mode || context.detectedModeHints.length > 0) {
    score += 5;
    reasons.push("Detected a clear output mode.");
  }

  const shouldUseAiFallback = score < 45 || prompt.trim().length < 12 || context.intent === "unknown";

  if (shouldUseAiFallback) {
    reasons.push("Prompt is too vague for high-confidence local enhancement.");
  }

  return {
    score,
    reasons,
    shouldUseAiFallback,
  };
}
