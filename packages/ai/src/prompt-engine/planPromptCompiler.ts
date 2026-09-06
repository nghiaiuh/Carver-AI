import type { CameraShotDirective, PromptPlanV2 } from "@carver/shared";
import { renderPlanSemanticSections, renderSection } from "./providerPromptSections";

const describeViewDirection = (viewDirection: NonNullable<CameraShotDirective["plan"]>["viewDirection"]) => {
  switch (viewDirection) {
    case "look-at-target":
      return "Aim directly from the camera origin to the supplied target point; derive the pitch from that vector.";
    case "manual":
      return "Honor the author-defined manual framing from the supplied camera origin and target rather than selecting an alternative viewpoint.";
    case "auto":
      return "Use the supplied origin and target as the framing envelope, selecting only the minimal natural orientation needed to preserve the footprint.";
  }
};

/** Compiles plan-surface camera data into provider-visible viewpoint semantics. */
export const compilePlanProviderPrompt = (plan: PromptPlanV2): string | null => {
  const shot = plan.cameraShot;
  if (shot?.mode !== "plan" || !shot.plan) {
    return null;
  }

  const targetHeight = shot.plan.targetHeight ?? 0;
  const cameraSection = renderSection("TARGET PLAN CAMERA VIEW", [
    `Use normalized plan origin (${shot.plan.u.toFixed(3)}, ${shot.plan.v.toFixed(3)}) and target (${shot.plan.targetU.toFixed(3)}, ${shot.plan.targetV.toFixed(3)}).`,
    `Camera height is ${shot.plan.height.toFixed(2)} relative world units; target height is ${targetHeight.toFixed(2)} relative world units.`,
    `Lens is ${shot.plan.lens.toFixed(1)} mm, pitch is ${shot.plan.pitch.toFixed(1)} degrees, and roll is ${(shot.plan.roll ?? 0).toFixed(1)} degrees.`,
    `View direction mode=${shot.plan.viewDirection}. ${describeViewDirection(shot.plan.viewDirection)}`,
    "Transform viewpoint, perspective, parallax, visibility, and framing only as required by this camera. Preserve the site footprint, object placement, scale, and protected areas.",
  ]);

  return [
    "TASK",
    "Create a controlled perspective view from the authorized plan-surface camera while preserving the same physical site.",
    cameraSection,
    ...renderPlanSemanticSections(plan),
  ].join("\n\n").trim();
};
