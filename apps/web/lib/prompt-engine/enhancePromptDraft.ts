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
import type { EnhancePromptDraftInput, EnhancePromptDraftResult } from "./types";

function sentenceForTask(taskType: string, target: string, stylePreset: string) {
  switch (taskType) {
    case "planting_design":
      return `Redesign only the planting in ${target} with refined layered landscape plants in a ${stylePreset} style.`;
    case "rockery_replacement":
      return `Replace only the existing rockery waterfall in ${target} with natural layered limestone forms and realistic water flow.`;
    case "house_replacement":
      return `Replace only the target house in ${target}, preserving the same footprint, position, orientation, and surrounding garden.`;
    case "courtyard_paving":
      return `Change only the courtyard paving in ${target} with realistic premium paving material while preserving every surrounding object.`;
    case "koi_pond_edge_design":
      return `Redesign only the koi pond edge in ${target} using refined natural stone placement and small controlled planting.`;
    default:
      return `Apply the requested landscape edit only to ${target}, with realistic design details in a ${stylePreset} style.`;
  }
}

export function enhancePromptDraft({
  rawPrompt,
  referenceImages = [],
  userStylePreset,
}: EnhancePromptDraftInput): EnhancePromptDraftResult {
  const safeRawPrompt = rawPrompt.trim();
  const taskType = detectTaskType(safeRawPrompt);
  const editScope = detectEditScope(safeRawPrompt, taskType);
  const riskLevel = detectRiskLevel(safeRawPrompt, taskType, editScope, referenceImages);
  const { targetArea, targetObject } = detectTargetArea(safeRawPrompt, taskType, editScope);
  const preserveRules = getPreserveRules(taskType, editScope);
  const negativeConstraints = getNegativeConstraints(taskType, referenceImages);
  const stylePreset = resolveStylePreset(userStylePreset);
  const target = targetArea ?? targetObject ?? "the requested target area/object";

  const { formulaUsed, editBrief } = buildEnhancedPrompt({
    rawPrompt: safeRawPrompt,
    taskType,
    editScope,
    targetArea,
    targetObject,
    preserveRules,
    negativeConstraints,
    stylePreset,
  });

  const enhancedDraft = [
    sentenceForTask(taskType, target, stylePreset),
    "Keep the original camera angle, perspective, layout, object positions, pond shape, bridge, gazebo, houses, paths, walls, courtyard, hardscape, and all unrelated areas unchanged.",
    "Avoid overgrown planting, random new objects, changed scale, changed layout, blur, or edits outside the requested area.",
  ].join(" ");

  return {
    rawPrompt: safeRawPrompt,
    enhancedDraft,
    taskType,
    editScope,
    riskLevel,
    targetArea,
    targetObject,
    formulaUsed,
    editBrief,
    shouldShowReview: riskLevel === "high",
  };
}

