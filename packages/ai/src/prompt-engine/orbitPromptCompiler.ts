import type { PromptPlanV2 } from "@carver/shared";
import { buildChangeAnglePrompt, toChangeAngleOperation } from "./novelViewReconstruction";
import { renderApprovedSemanticPlan } from "./providerPromptSections";

/** Compiles an orbit shot without dropping the surrounding generation plan. */
export const compileOrbitProviderPrompt = (plan: PromptPlanV2): string | null => {
  if (plan.cameraShot?.mode !== "orbit") {
    return null;
  }

  const operation = toChangeAngleOperation({
    shot: plan.cameraShot,
    targetId: plan.target.value?.contextId ?? "scene-center",
    targetName: plan.target.value?.title,
  });
  if (!operation) {
    return null;
  }

  return buildChangeAnglePrompt({
    shot: operation.shot,
    sceneName: operation.scene.targetName,
    additionalUserInstruction: renderApprovedSemanticPlan(plan),
  });
};
