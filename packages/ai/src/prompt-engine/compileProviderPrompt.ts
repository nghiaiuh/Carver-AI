import type { CompiledPromptV2, GenerationPromptResultV2, PromptInterpreterMeta, PromptPlanV2 } from "@carver/shared";
import { buildPlanHash, canonicalizeCompiledPrompt, canonicalizePromptPlan } from "./canonicalizePlan";
import { compileOrbitProviderPrompt } from "./orbitPromptCompiler";
import { compilePlanProviderPrompt } from "./planPromptCompiler";
import { renderPlanSemanticSections, renderSection } from "./providerPromptSections";

const describeCameraShot = (shot: NonNullable<PromptPlanV2["cameraShot"]>) => {
  if (shot.mode === "plan" && shot.plan) {
    const plan = shot.plan;
    return [
      `Shot ${shot.order + 1}: ${shot.shotName} (plan-surface camera).`,
      `Camera position is (${plan.u.toFixed(2)}, ${plan.v.toFixed(2)}) on the source plan, looking at (${plan.targetU.toFixed(2)}, ${plan.targetV.toFixed(2)}).`,
      `Height ${plan.height.toFixed(1)} m, lens ${plan.lens} mm, pitch ${plan.pitch} degrees, roll ${(plan.roll ?? 0).toFixed(0)} degrees.`,
    ];
  }
  const orbit = shot.orbit;
  return [
    `Shot ${shot.order + 1}: ${shot.shotName} (orbit camera).`,
    `Camera azimuth ${orbit?.rotate ?? 0} degrees, elevation ${orbit?.tilt ?? 0} degrees, distance ${(orbit?.distance ?? 0).toFixed(1)} m, lens ${orbit?.lens ?? 35} mm.`,
    "Change only the camera viewpoint and framing; preserve the site layout, object positions, scale, materials, and scene identity.",
  ];
};

export const compileProviderPromptV2 = (plan: PromptPlanV2): string => {
  const canonicalPlan = canonicalizePromptPlan(plan);
  const specializedPrompt =
    compileOrbitProviderPrompt(canonicalPlan) ?? compilePlanProviderPrompt(canonicalPlan);
  if (specializedPrompt) return specializedPrompt;

  const sections = [
    ...(canonicalPlan.cameraShot
      ? [renderSection("AUTHORIZED CAMERA SHOT", describeCameraShot(canonicalPlan.cameraShot))]
      : []),
    ...renderPlanSemanticSections(canonicalPlan),
  ];

  return sections.join("\n\n").trim();
};

export const buildCompiledPromptV2 = (params: {
  engineRunId: string;
  parentEngineRunId?: string;
  contextRevision: number;
  snapshotId?: string;
  plan: PromptPlanV2;
  warnings: CompiledPromptV2["warnings"];
  interpreter: PromptInterpreterMeta;
}): CompiledPromptV2 => {
  const providerPrompt = compileProviderPromptV2(params.plan);
  const compiled = canonicalizeCompiledPrompt({
    engineVersion: "2",
    engineRunId: params.engineRunId,
    parentEngineRunId: params.parentEngineRunId,
    planHash: "",
    contextRevision: params.contextRevision,
    snapshotId: params.snapshotId,
    providerPrompt,
    plan: params.plan,
    warnings: params.warnings,
    interpreter: params.interpreter,
  });

  return {
    ...compiled,
    planHash: buildPlanHash({
      plan: compiled.plan,
      providerPrompt: compiled.providerPrompt,
    }),
  };
};

export const buildGenerationPromptResultV2 = (params: {
  compiled: CompiledPromptV2;
  requiredAssetIds: string[];
}): GenerationPromptResultV2 => ({
  ...params.compiled,
  executionTarget: params.compiled.plan.target.value,
  validatedReferences: params.compiled.plan.references,
  revalidation: {
    projectScoped: true,
    snapshotScoped: Boolean(params.compiled.snapshotId),
    expectedContextRevision: params.compiled.contextRevision,
    snapshotId: params.compiled.snapshotId,
    targetContextId: params.compiled.plan.target.value?.contextId,
    referenceContextIds: params.compiled.plan.references.map((reference) => reference.contextId),
    requiredAssetIds: params.requiredAssetIds,
    requiresMask: params.compiled.plan.executionMode === "region_edit",
    requiresTarget: params.compiled.plan.executionMode !== "text_to_image",
  },
});
