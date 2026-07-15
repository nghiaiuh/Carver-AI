import type {
  PromptEngineTrustedContext,
  PromptOperation,
  PromptPlanV2,
  PromptWarning,
  TrustedTarget,
} from "@carver/shared";
import type { PromptPlanBuildInput } from "./contracts";
import { buildPlanConstraints } from "./constraints";
import { validateReferences } from "./references";
import { assessPromptRisk } from "./risk";

const cleanText = (value: string | undefined | null) => value?.trim() || "";

const operationSemanticKey = (operation: PromptOperation) => JSON.stringify(operation);

const createOperationId = (operation: PromptOperation, index: number) =>
  `op-${index + 1}-${Buffer.from(operationSemanticKey(operation)).toString("base64").replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase()}`;

const resolveTarget = (params: {
  trustedContext: PromptEngineTrustedContext;
  targetHint?: string | null;
  warnings: PromptWarning[];
}): PromptPlanV2["target"] => {
  const { trustedContext, targetHint, warnings } = params;

  if (trustedContext.target) {
    return {
      value: trustedContext.target,
      source: "trusted_context",
      evidence: [`trusted-target:${trustedContext.target.contextId}`],
    };
  }

  if (!targetHint) {
    return {
      value: null,
      source: "trusted_context",
      evidence: ["trusted-target:none"],
    };
  }

  const normalizedHint = targetHint.toLowerCase();
  const hintedTarget =
    trustedContext.availableTargets.find((candidate) => candidate.contextId === targetHint) ??
    trustedContext.availableTargets.find((candidate) => candidate.title.toLowerCase().includes(normalizedHint));

  if (hintedTarget) {
    return {
      value: hintedTarget,
      source: "model_interpretation",
      evidence: [`target-hint:${targetHint}`],
    };
  }

  warnings.push({
    code: "AMBIGUOUS_TARGET",
    message: `Interpreter target hint "${targetHint}" did not resolve to a trusted target.`,
  });

  return {
    value: null,
    source: "trusted_context",
    evidence: [`missing-target-hint:${targetHint}`],
  };
};

const toPromptOperation = (params: {
  operations: PromptPlanBuildInput["interpretation"]["operations"];
  target: TrustedTarget | null;
}): PromptOperation[] => {
  const resolved: PromptOperation[] = [];

  for (const operation of params.operations) {
    const targetContextId = cleanText(operation.targetContextId) || params.target?.contextId;

    switch (operation.type) {
      case "add_object":
        if (!cleanText(operation.objectCategory)) {
          continue;
        }
        resolved.push({
          operationId: "",
          type: "add_object",
          objectCategory: cleanText(operation.objectCategory),
          targetContextId,
          spatialRelation: operation.spatialRelation,
          dependsOn: operation.dependsOn?.filter(Boolean),
          executionGroup: operation.executionGroup,
        });
        continue;
      case "remove_object":
        if (!targetContextId) {
          continue;
        }
        resolved.push({
          operationId: "",
          type: "remove_object",
          targetContextId,
          dependsOn: operation.dependsOn?.filter(Boolean),
          executionGroup: operation.executionGroup,
        });
        continue;
      case "replace_object":
        if (!targetContextId || !cleanText(operation.replacementCategory)) {
          continue;
        }
        resolved.push({
          operationId: "",
          type: "replace_object",
          targetContextId,
          replacementCategory: cleanText(operation.replacementCategory),
          referenceContextId: cleanText(operation.referenceContextId) || undefined,
          dependsOn: operation.dependsOn?.filter(Boolean),
          executionGroup: operation.executionGroup,
        });
        continue;
      case "replace_material":
        if (!targetContextId || !cleanText(operation.material)) {
          continue;
        }
        resolved.push({
          operationId: "",
          type: "replace_material",
          targetContextId,
          material: cleanText(operation.material),
          dependsOn: operation.dependsOn?.filter(Boolean),
          executionGroup: operation.executionGroup,
        });
        continue;
      case "modify_attribute":
        if (!targetContextId || !cleanText(operation.attribute) || !cleanText(operation.value)) {
          continue;
        }
        resolved.push({
          operationId: "",
          type: "modify_attribute",
          targetContextId,
          attribute: cleanText(operation.attribute),
          value: cleanText(operation.value),
          dependsOn: operation.dependsOn?.filter(Boolean),
          executionGroup: operation.executionGroup,
        });
        continue;
      case "restyle":
        if (!cleanText(operation.style)) {
          continue;
        }
        resolved.push({
          operationId: "",
          type: "restyle",
          targetContextId,
          style: cleanText(operation.style),
          dependsOn: operation.dependsOn?.filter(Boolean),
          executionGroup: operation.executionGroup,
        });
        continue;
      case "relocate_object":
        if (!targetContextId || !operation.destination) {
          continue;
        }
        resolved.push({
          operationId: "",
          type: "relocate_object",
          targetContextId,
          destination: operation.destination,
          dependsOn: operation.dependsOn?.filter(Boolean),
          executionGroup: operation.executionGroup,
        });
        continue;
      default:
        continue;
    }
  }

  return resolved
    .sort((left, right) => operationSemanticKey(left).localeCompare(operationSemanticKey(right)))
    .map((operation, index) => ({
      ...operation,
      operationId: createOperationId(operation, index),
    }));
};

export const buildPromptPlanV2 = (input: PromptPlanBuildInput): PromptPlanV2 => {
  const target = resolveTarget({
    trustedContext: input.trustedContext,
    targetHint: input.interpretation.targetHint,
    warnings: input.warnings,
  });
  const operations = toPromptOperation({
    operations: input.interpretation.operations,
    target: target.value,
  });
  const references = validateReferences({
    trustedContext: input.trustedContext,
    requestedReferences: input.interpretation.references,
    warnings: input.warnings,
  });

  if (operations.length === 0 && input.rawPrompt.trim().length > 0) {
    input.warnings.push({
      code: "EMPTY_OPERATION",
      message: "Interpreter produced no actionable operations, falling back to preservation-only plan.",
    });
  }

  const missingTarget =
    input.trustedContext.executionMode !== "text_to_image" &&
    !target.value;
  const missingMask =
    input.trustedContext.executionMode === "region_edit" &&
    Boolean(input.trustedContext.mask?.required) &&
    !input.trustedContext.mask?.assetId;
  const missingRequiredReference = operations.some(
    (operation) =>
      operation.type === "replace_object" &&
      Boolean(operation.referenceContextId) &&
      !references.some((reference) => reference.contextId === operation.referenceContextId),
  );

  const constraints = buildPlanConstraints({
    trustedContext: input.trustedContext,
    interpretation: input.interpretation,
    operations,
  });

  const { risk, reviewReasons } = assessPromptRisk({
    trustedContext: input.trustedContext,
    operations,
    degraded: input.degraded,
    missingTarget,
    missingMask,
    missingRequiredReference,
  });

  const decision =
    missingTarget || missingMask
      ? "reject"
      : risk.level === "blocked"
        ? "reject"
        : reviewReasons.length > 0
          ? "require_review"
          : "continue";

  return {
    schemaVersion: 2,
    purpose: input.purpose,
    executionMode: input.trustedContext.executionMode,
    rawGoal: input.rawPrompt.trim(),
    operations,
    target,
    references,
    constraints,
    decision,
    risk,
    reviewReasons,
    degraded: input.degraded,
  };
};
