import type { PromptPlanV2 } from "@carver/shared";

const describeSpatialRelation = (relation: { relation: string; contextId?: string; description?: string }) =>
  [relation.relation, relation.contextId ? `context=${relation.contextId}` : null, relation.description]
    .filter((value): value is string => Boolean(value))
    .join(", ");

export const describeOperation = (operation: PromptPlanV2["operations"][number]) => {
  switch (operation.type) {
    case "add_object":
      return `Add ${operation.objectCategory}${operation.targetContextId ? ` near ${operation.targetContextId}` : ""}${
        operation.spatialRelation ? ` (${describeSpatialRelation(operation.spatialRelation)})` : ""
      }.`;
    case "remove_object":
      return `Remove only ${operation.targetContextId}.`;
    case "replace_object":
      return `Replace ${operation.targetContextId} with ${operation.replacementCategory}${
        operation.referenceContextId ? ` using reference ${operation.referenceContextId}` : ""
      }.`;
    case "replace_material":
      return `Replace material on ${operation.targetContextId} with ${operation.material}.`;
    case "modify_attribute":
      return `Modify ${operation.attribute} on ${operation.targetContextId} to ${operation.value}.`;
    case "restyle":
      return `Restyle${operation.targetContextId ? ` ${operation.targetContextId}` : " the scene"} as ${operation.style}.`;
    case "relocate_object":
      return `Relocate ${operation.targetContextId} with relation ${describeSpatialRelation(operation.destination)}.`;
    default:
      return "Preserve the validated target and refine carefully.";
  }
};

export const renderSection = (title: string, lines: string[]) =>
  `${title}\n${lines.map((line) => `- ${line}`).join("\n")}`;

const describeConstraint = (constraint: PromptPlanV2["constraints"][number]) => {
  if (constraint.type === "apply_camera_view") {
    return `[${constraint.severity}] apply_camera_view: Apply the authorized camera geometry while preserving the same scene layout and physical site.${
      constraint.subjectId ? ` (subject=${constraint.subjectId})` : ""
    }`;
  }

  return `[${constraint.severity}] ${constraint.type}: ${constraint.description}${
    constraint.subjectId ? ` (subject=${constraint.subjectId})` : ""
  }${constraint.regionId ? ` (region=${constraint.regionId})` : ""}`;
};

export const renderPlanSemanticSections = (plan: PromptPlanV2) => [
  renderSection("MAIN GOAL", [plan.rawGoal || "No additional user-authored design change was requested."]),
  renderSection(
    "APPROVED OPERATIONS",
    plan.operations.length > 0
      ? plan.operations.map(describeOperation)
      : ["No physical scene change is approved; preserve the validated scene."],
  ),
  renderSection(
    "VALIDATED TARGET",
    plan.target.value
      ? [
          `${plan.target.value.contextId}: ${plan.target.value.title}`,
          `source=${plan.target.source}`,
        ]
      : ["No explicit target was validated."],
  ),
  renderSection(
    "VALIDATED REFERENCES",
    plan.references.length > 0
      ? plan.references.map(
          (reference) =>
            `${reference.contextId}: requested=${reference.requestedRole}, effective=${reference.effectiveRole}, validation=${reference.validation}`,
        )
      : ["No validated references."],
  ),
  renderSection(
    "HARD AND SOFT CONSTRAINTS",
    plan.constraints.length > 0
      ? plan.constraints.map(describeConstraint)
      : ["No additional constraints were recorded."],
  ),
  renderSection("DECISION", [
    `decision=${plan.decision}`,
    `risk=${plan.risk.level}`,
    `degraded=${plan.degraded ? "yes" : "no"}`,
  ]),
];

/**
 * Keeps direct user intent, validated graph roles, and policy constraints
 * visible to every specialized provider prompt compiler.
 */
export const renderApprovedSemanticPlan = (plan: PromptPlanV2) => [
  "APPROVED SEMANTIC PLAN",
  "",
  ...renderPlanSemanticSections(plan),
  "",
  "Apply a physical scene change only when it is listed in APPROVED OPERATIONS. All hard constraints remain mandatory.",
].join("\n\n");
