/*
 * Flow: Participates in the Landscape Prompt Compiler.
 * 1. Receive raw landscape prompt context.
 * 2. Detect task intent, scope, risk, or constraints.
 * 3. Return structured prompt data for enhance/generate APIs.
 */

import { detectEditScope } from "./detectEditScope";
import { detectRiskLevel } from "./detectRiskLevel";
import { detectTargetArea } from "./detectTargetArea";
import { detectTaskType } from "./detectTaskType";
import { buildEnhancedPrompt } from "./formulas";
import { getNegativeConstraints } from "./negativeConstraints";
import { getPreserveRules } from "./preserveRules";
import { resolveStylePreset } from "./stylePresets";
import type { EnhanceLandscapePromptInput, EnhanceLandscapePromptResult } from "./types";

export function enhanceLandscapePrompt({
  rawPrompt,
  referenceImages = [],
  userStylePreset,
  promptMode = "auto",
}: EnhanceLandscapePromptInput): EnhanceLandscapePromptResult {
  const safeRawPrompt = rawPrompt.trim();
  const taskType = detectTaskType(safeRawPrompt);
  const editScope = detectEditScope(safeRawPrompt, taskType);
  const riskLevel = detectRiskLevel(safeRawPrompt, taskType, editScope, referenceImages);
  const { targetArea, targetObject } = detectTargetArea(safeRawPrompt, taskType, editScope);
  const preserveRules = getPreserveRules(taskType, editScope);
  const negativeConstraints = getNegativeConstraints(taskType, referenceImages);
  const stylePreset = resolveStylePreset(userStylePreset);

  const { enhancedPrompt, formulaUsed, editBrief } = buildEnhancedPrompt({
    rawPrompt: safeRawPrompt,
    taskType,
    editScope,
    targetArea,
    targetObject,
    preserveRules,
    negativeConstraints,
    stylePreset,
  });

  return {
    rawPrompt: safeRawPrompt,
    enhancedPrompt,
    taskType,
    editScope,
    riskLevel,
    targetArea,
    targetObject,
    preserveRules,
    negativeConstraints,
    formulaUsed,
    editBrief,
    shouldShowReview: promptMode === "auto" ? riskLevel === "high" : true,
  };
}

// Future LLM hook: keep this function pure, then optionally insert an LLM rewrite
// between rule detection and formula rendering without changing route contracts.
export type { EnhanceLandscapePromptInput, EnhanceLandscapePromptResult } from "./types";

