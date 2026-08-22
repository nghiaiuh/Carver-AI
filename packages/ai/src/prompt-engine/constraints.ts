import type {
  PlanConstraint,
  PromptEngineTrustedContext,
  PromptInterpreterResult,
  PromptOperation,
} from "@carver/shared";

const createConstraintId = (seed: string) =>
  seed
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

export const buildPlanConstraints = (params: {
  trustedContext: PromptEngineTrustedContext;
  interpretation: PromptInterpreterResult;
  operations: PromptOperation[];
}): PlanConstraint[] => {
  const { trustedContext, interpretation, operations } = params;
  const constraints: PlanConstraint[] = [];

  const pushConstraint = (constraint: Omit<PlanConstraint, "id">) => {
    constraints.push({
      ...constraint,
      id: createConstraintId(
        `${constraint.type}-${constraint.source}-${constraint.subjectId ?? "global"}-${constraint.regionId ?? "none"}-${
          constraint.description
        }`,
      ),
    });
  };

  if (trustedContext.executionMode !== "text_to_image" && !trustedContext.cameraShot) {
    pushConstraint({
      type: "preserve_camera",
      source: "system_policy",
      severity: "hard",
      description: "Preserve the original camera angle.",
      evidence: ["system:image-edit-camera"],
    });
    pushConstraint({
      type: "preserve_perspective",
      source: "system_policy",
      severity: "hard",
      description: "Preserve the original perspective.",
      evidence: ["system:image-edit-perspective"],
    });
    pushConstraint({
      type: "preserve_layout",
      source: "system_policy",
      severity: "hard",
      description: "Preserve the overall site layout and footprint.",
      evidence: ["system:image-edit-layout"],
    });
  }

  if (trustedContext.cameraShot) {
    const shot = trustedContext.cameraShot;
    pushConstraint({
      type: "apply_camera_view",
      source: "trusted_context",
      severity: "hard",
      subjectId: shot.shotId,
      description: `Apply only camera shot ${shot.order + 1} (${shot.shotName}) in ${shot.mode} mode. This authorized shot replaces the source camera angle and perspective while preserving the scene layout.`,
      evidence: [`camera-shot:${shot.shotSetNodeId}:${shot.shotId}`],
    });
  }

  for (const lock of trustedContext.locks) {
    if (lock.targetType === "camera") {
      if (trustedContext.cameraShot) {
        continue;
      }
      pushConstraint({
        type: "preserve_camera",
        source: "trusted_context",
        severity: lock.strength === "hard" ? "hard" : "soft",
        subjectId: lock.targetId,
        description: lock.reason || "Preserve camera state from trusted canvas context.",
        evidence: [`lock:${lock.id}`],
      });
      continue;
    }

    if (lock.targetType === "region") {
      pushConstraint({
        type: "preserve_region",
        source: "trusted_context",
        severity: lock.strength === "hard" ? "hard" : "soft",
        regionId: lock.targetId,
        description: lock.reason || "Preserve locked region boundaries.",
        evidence: [`lock:${lock.id}`],
      });
      continue;
    }

    if (lock.targetType === "global") {
      pushConstraint({
        type: "preserve_layout",
        source: "trusted_context",
        severity: lock.strength === "hard" ? "hard" : "soft",
        description: lock.reason || "Preserve trusted global layout constraints.",
        evidence: [`lock:${lock.id}`],
      });
      continue;
    }

    pushConstraint({
      type: "preserve_object",
      source: "trusted_context",
      severity: lock.strength === "hard" ? "hard" : "soft",
      subjectId: lock.targetId,
      description: lock.reason || "Preserve locked object state.",
      evidence: [`lock:${lock.id}`],
    });
  }

  if (trustedContext.executionMode === "region_edit" && trustedContext.mask?.required) {
    pushConstraint({
      type: "restrict_edit_scope",
      source: "trusted_context",
      severity: "hard",
      regionId: trustedContext.mask.regionId,
      description: "Only edit inside the validated region mask.",
      evidence: ["trusted-mask:required"],
    });
  }

  for (const explicit of trustedContext.explicitConstraints?.preserve ?? []) {
    pushConstraint({
      type: "preserve_layout",
      source: "user_explicit",
      severity: "soft",
      description: explicit,
      evidence: ["explicit-preserve"],
    });
  }

  for (const explicit of trustedContext.explicitConstraints?.avoid ?? []) {
    pushConstraint({
      type: "forbid_addition",
      source: "user_explicit",
      severity: "soft",
      description: explicit,
      evidence: ["explicit-avoid"],
    });
  }

  for (const preserve of interpretation.preserveRequests) {
    pushConstraint({
      type: "preserve_layout",
      source: "model_interpretation",
      severity: "soft",
      description: preserve,
      evidence: ["interpreter-preserve"],
    });
  }

  for (const avoid of interpretation.avoidRequests) {
    pushConstraint({
      type: "forbid_addition",
      source: "model_interpretation",
      severity: "soft",
      description: avoid,
      evidence: ["interpreter-avoid"],
    });
  }

  const destructiveTargetIds = operations
    .filter((operation) => operation.type === "remove_object" || operation.type === "replace_object")
    .map((operation) => operation.targetContextId);
  for (const targetContextId of destructiveTargetIds) {
    pushConstraint({
      type: "restrict_edit_scope",
      source: "trusted_context",
      severity: "hard",
      subjectId: targetContextId,
      description: "Only modify the validated target object.",
      evidence: [`operation-target:${targetContextId}`],
    });
  }

  return constraints;
};
