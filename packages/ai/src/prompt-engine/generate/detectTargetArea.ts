/*
 * Flow: Participates in the Landscape Prompt Compiler.
 * 1. Receive raw landscape prompt context.
 * 2. Detect task intent, scope, risk, or constraints.
 * 3. Return structured prompt data for enhance/generate APIs.
 */

import { normalizePrompt } from "./detectTaskType";
import type { EditScope, LandscapeTaskType } from "./types";

export function detectTargetArea(rawPrompt: string, taskType: LandscapeTaskType, editScope: EditScope) {
  const prompt = normalizePrompt(rawPrompt);

  const targetArea =
    prompt.includes("quanh ho") || prompt.includes("pond edge") || prompt.includes("bo ho") || prompt.includes("vien ho")
      ? "The area directly around the koi pond edge."
      : prompt.includes("san") || prompt.includes("courtyard")
        ? "The courtyard paving area."
        : prompt.includes("hang rao") || prompt.includes("fence")
          ? "The planting strip along the fence."
          : prompt.includes("tuong") || prompt.includes("wall")
            ? "The planting strip along the wall."
            : editScope === "area_edit"
              ? "The requested editable landscape area."
              : undefined;

  const targetObject =
    taskType === "house_replacement"
      ? "The target house specified by the user."
      : taskType === "rockery_replacement"
        ? "The existing rockery waterfall."
        : prompt.includes("cay") || prompt.includes("tree")
          ? "The requested tree or planting object."
          : editScope === "object_edit"
            ? "The requested object."
            : undefined;

  return { targetArea, targetObject };
}

