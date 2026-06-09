/*
 * Flow: Participates in the Landscape Prompt Compiler.
 * 1. Receive raw landscape prompt context.
 * 2. Detect task intent, scope, risk, or constraints.
 * 3. Return structured prompt data for enhance/generate APIs.
 */

import type { EditBrief, EditScope, LandscapeTaskType } from "./types";

type BuildEditBriefInput = {
  taskType: LandscapeTaskType;
  editScope: EditScope;
  targetArea?: string;
  targetObject?: string;
  preserve: string[];
  modify: string[];
  avoid: string[];
  quality: string[];
};

export function buildEditBrief({
  taskType,
  editScope,
  targetArea,
  targetObject,
  preserve,
  modify,
  avoid,
  quality,
}: BuildEditBriefInput): EditBrief {
  return {
    title: "Landscape Edit Brief",
    summary: `Compiled a ${taskType} request as a ${editScope}.`,
    detectedIntent: taskType,
    targetArea,
    targetObject,
    preserve,
    modify,
    avoid,
    quality,
  };
}

