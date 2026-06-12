/*
 * Flow: Participates in the Landscape Prompt Compiler.
 * 1. Receive raw landscape prompt context.
 * 2. Detect task intent, scope, risk, or constraints.
 * 3. Return structured prompt data for enhance/generate APIs.
 */

import { normalizePrompt } from "./detectTaskType";
import type { EditScope, LandscapeTaskType } from "./types";

const objectTasks: LandscapeTaskType[] = ["house_replacement", "rockery_replacement", "replace_object", "remove_object"];
const areaTasks: LandscapeTaskType[] = ["koi_pond_edge_design", "courtyard_paving", "planting_design", "tree_row_addition"];

export function detectEditScope(rawPrompt: string, taskType: LandscapeTaskType): EditScope {
  const prompt = normalizePrompt(rawPrompt);

  if (taskType === "full_redesign" || prompt.includes("toan bo") || prompt.includes("whole")) return "full_redesign";
  if (taskType === "enhance_quality" || taskType === "change_lighting") return "global_style_edit";
  if (objectTasks.includes(taskType) || /(house|nha|tree|cay|rockery|hon non bo|gazebo|pavilion)/.test(prompt)) return "object_edit";
  if (areaTasks.includes(taskType) || /(pond edge|bo ho|vien ho|courtyard|san|wall side|garden bed|khu vuc)/.test(prompt)) return "area_edit";
  if (taskType === "add_object" || taskType === "strict_local_edit") return "local_edit";

  return "unknown";
}

