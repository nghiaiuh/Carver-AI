import type { CompiledPromptV2, GenerationPromptResultV2, PromptInterpreterMeta, PromptPlanV2 } from "@carver/shared";
import { buildPlanHash, canonicalizeCompiledPrompt, canonicalizePromptPlan } from "./canonicalizePlan";

const describeOperation = (operation: PromptPlanV2["operations"][number]) => {
  switch (operation.type) {
    case "add_object":
      return `Add ${operation.objectCategory}${operation.targetContextId ? ` near ${operation.targetContextId}` : ""}.`;
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
      return `Relocate ${operation.targetContextId} with relation ${operation.destination.relation}.`;
    default:
      return "Preserve the validated target and refine carefully.";
  }
};

const renderSection = (title: string, lines: string[]) =>
  `${title}\n${lines.map((line) => `- ${line}`).join("\n")}`;

export const compileProviderPromptV2 = (plan: PromptPlanV2): string => {
  const canonicalPlan = canonicalizePromptPlan(plan);
  const sections = [
    renderSection("MAIN GOAL", [canonicalPlan.rawGoal]),
    renderSection(
      "OPERATIONS",
      canonicalPlan.operations.length > 0
        ? canonicalPlan.operations.map(describeOperation)
        : ["No explicit operation was trusted. Preserve the validated scene and follow only safe improvements."],
    ),
    renderSection(
      "VALIDATED TARGET",
      canonicalPlan.target.value
        ? [
            `${canonicalPlan.target.value.contextId}: ${canonicalPlan.target.value.title}`,
            `source=${canonicalPlan.target.source}`,
          ]
        : ["No explicit target was validated."],
    ),
    renderSection(
      "VALIDATED REFERENCES",
      canonicalPlan.references.length > 0
        ? canonicalPlan.references.map(
            (reference) =>
              `${reference.contextId}: requested=${reference.requestedRole}, effective=${reference.effectiveRole}, validation=${reference.validation}`,
          )
        : ["No validated references."],
    ),
    renderSection(
      "HARD AND SOFT CONSTRAINTS",
      canonicalPlan.constraints.map(
        (constraint) =>
          `[${constraint.severity}] ${constraint.type}: ${constraint.description}${
            constraint.subjectId ? ` (subject=${constraint.subjectId})` : ""
          }${constraint.regionId ? ` (region=${constraint.regionId})` : ""}`,
      ),
    ),
    renderSection("DECISION", [
      `decision=${canonicalPlan.decision}`,
      `risk=${canonicalPlan.risk.level}`,
      `degraded=${canonicalPlan.degraded ? "yes" : "no"}`,
    ]),
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
