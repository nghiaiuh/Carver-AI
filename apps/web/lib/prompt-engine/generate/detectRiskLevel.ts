/*
 * Flow: Participates in the Landscape Prompt Compiler.
 * 1. Receive raw landscape prompt context.
 * 2. Detect task intent, scope, risk, or constraints.
 * 3. Return structured prompt data for enhance/generate APIs.
 */

import { normalizePrompt } from "./detectTaskType";
import type { EditScope, LandscapeTaskType, PromptRiskLevel } from "./types";

const highRiskPhrases = [
  "dung vi tri",
  "giu nguyen bo cuc",
  "chi thay doi",
  "khong thay doi bat cu thu gi",
  "exact position",
  "exact camera",
  "exact scale",
  "same orientation",
  "roof count",
  "architectural reference",
];

export function detectRiskLevel(rawPrompt: string, taskType: LandscapeTaskType, editScope: EditScope, referenceImages: unknown[] = []): PromptRiskLevel {
  const prompt = normalizePrompt(rawPrompt);
  const editCount = (prompt.match(/\b(thay|doi|them|xoa|replace|change|add|remove)\b/g) ?? []).length;

  if (
    taskType === "house_replacement" ||
    taskType === "rockery_replacement" ||
    referenceImages.length > 1 ||
    editCount > 1 ||
    highRiskPhrases.some((phrase) => prompt.includes(phrase)) ||
    /(position|scale|orientation|footprint|roof|cot|mai|huong)/.test(prompt)
  ) {
    return "high";
  }

  if (
    taskType === "tree_row_addition" ||
    taskType === "koi_pond_edge_design" ||
    taskType === "courtyard_paving" ||
    taskType === "planting_design" ||
    editScope === "area_edit"
  ) {
    return "medium";
  }

  return "low";
}

