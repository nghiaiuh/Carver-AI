/*
 * Flow: Participates in the Landscape Prompt Compiler.
 * 1. Receive raw landscape prompt context.
 * 2. Detect task intent, scope, risk, or constraints.
 * 3. Return structured prompt data for enhance/generate APIs.
 */

import type { EditScope, LandscapeTaskType } from "./types";

const baseLocalPreserveRules = [
  "original camera angle",
  "original perspective",
  "original layout",
  "original object positions",
  "house positions",
  "koi pond shape and position",
  "rockery waterfall position",
  "gazebo/pavilion position",
  "bridge position",
  "driveway position",
  "courtyard shape",
  "wall and fence positions",
  "stepping stone path position",
  "lawn island shapes",
  "hardscape layout",
  "all unrelated objects",
];

export function getPreserveRules(taskType: LandscapeTaskType, editScope: EditScope) {
  if (editScope === "full_redesign") {
    return ["original camera angle", "original perspective", "site boundaries", "major existing architecture unless explicitly changed"];
  }

  const rules = [...baseLocalPreserveRules];

  if (taskType !== "change_lighting") {
    rules.push("lighting unless the user asks to change lighting");
  }

  if (taskType === "house_replacement") {
    return rules.filter((rule) => rule !== "house positions").concat("everything except the target house", "target house footprint and position");
  }

  if (taskType === "rockery_replacement") {
    return rules.filter((rule) => rule !== "rockery waterfall position").concat("everything except the rockery waterfall", "pond shape and water area");
  }

  if (taskType === "courtyard_paving") {
    return rules.concat("all objects while only changing courtyard paving material");
  }

  if (taskType === "planting_design") {
    return rules.concat("all hardscape while only adding or improving plants in the requested area");
  }

  return rules;
}

