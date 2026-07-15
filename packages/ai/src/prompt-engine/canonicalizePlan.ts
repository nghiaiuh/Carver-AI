import { createHash } from "node:crypto";
import type {
  CompiledPromptV2,
  PlanConstraint,
  PromptOperation,
  PromptPlanV2,
  ValidatedReference,
} from "@carver/shared";

const normalizeWhitespace = (value: string) => value.replace(/\s+/g, " ").trim();

const sortObject = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map(sortObject);
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  return Object.keys(value as Record<string, unknown>)
    .sort((left, right) => left.localeCompare(right))
    .reduce<Record<string, unknown>>((accumulator, key) => {
      accumulator[key] = sortObject((value as Record<string, unknown>)[key]);
      return accumulator;
    }, {});
};

const stableStringify = (value: unknown) => JSON.stringify(sortObject(value));

const dependencyKey = (value: string[] | undefined) => (value ?? []).slice().sort((left, right) => left.localeCompare(right));

const canonicalOperationKey = (operation: PromptOperation) =>
  stableStringify({
    ...operation,
    dependsOn: dependencyKey(operation.dependsOn),
  });

const canonicalConstraintKey = (constraint: PlanConstraint) =>
  stableStringify({
    type: constraint.type,
    source: constraint.source,
    subjectId: constraint.subjectId ?? null,
    regionId: constraint.regionId ?? null,
    severity: constraint.severity,
    description: normalizeWhitespace(constraint.description),
    evidence: (constraint.evidence ?? []).map(normalizeWhitespace).sort((left, right) => left.localeCompare(right)),
  });

const canonicalReferenceKey = (reference: ValidatedReference) =>
  stableStringify({
    contextId: reference.contextId,
    requestedRole: reference.requestedRole,
    effectiveRole: reference.effectiveRole,
    graphRole: reference.graphRole ?? null,
    source: reference.source,
    validation: reference.validation,
    evidence: reference.evidence.map(normalizeWhitespace).sort((left, right) => left.localeCompare(right)),
  });

const topologicalSortOperations = (operations: PromptOperation[]) => {
  const remaining = new Map(operations.map((operation) => [operation.operationId, operation] as const));
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const ordered: PromptOperation[] = [];

  const visit = (operation: PromptOperation) => {
    if (visited.has(operation.operationId) || visiting.has(operation.operationId)) {
      return;
    }

    visiting.add(operation.operationId);
    for (const dependencyId of dependencyKey(operation.dependsOn)) {
      const dependency = remaining.get(dependencyId);
      if (dependency) {
        visit(dependency);
      }
    }
    visiting.delete(operation.operationId);
    visited.add(operation.operationId);
    ordered.push(operation);
  };

  Array.from(remaining.values())
    .sort((left, right) => canonicalOperationKey(left).localeCompare(canonicalOperationKey(right)))
    .forEach(visit);

  return ordered;
};

export const canonicalizePromptPlan = (plan: PromptPlanV2): PromptPlanV2 => {
  const operations = topologicalSortOperations(plan.operations).map((operation) => ({
    ...operation,
    dependsOn: dependencyKey(operation.dependsOn),
  }));
  const constraints = Array.from(
    new Map(
      plan.constraints
        .map((constraint) => [
          canonicalConstraintKey({
            ...constraint,
            description: normalizeWhitespace(constraint.description),
            evidence: (constraint.evidence ?? []).map(normalizeWhitespace),
          }),
          {
            ...constraint,
            description: normalizeWhitespace(constraint.description),
            evidence: (constraint.evidence ?? []).map(normalizeWhitespace).sort((left, right) =>
              left.localeCompare(right),
            ),
          },
        ] as const),
    ).values(),
  ).sort((left, right) => canonicalConstraintKey(left).localeCompare(canonicalConstraintKey(right)));

  const references = [...plan.references]
    .map((reference) => ({
      ...reference,
      evidence: reference.evidence.map(normalizeWhitespace).sort((left, right) => left.localeCompare(right)),
    }))
    .sort((left, right) => canonicalReferenceKey(left).localeCompare(canonicalReferenceKey(right)));

  return {
    ...plan,
    rawGoal: normalizeWhitespace(plan.rawGoal),
    operations,
    constraints,
    references,
  };
};

export const buildPlanHash = (params: {
  plan: PromptPlanV2;
  providerPrompt: string;
}): string => {
  const semanticValue = {
    plan: canonicalizePromptPlan(params.plan),
    providerPrompt: normalizeWhitespace(params.providerPrompt),
  };

  return createHash("sha256").update(stableStringify(semanticValue)).digest("hex");
};

export const canonicalizeCompiledPrompt = (compiled: CompiledPromptV2): CompiledPromptV2 => {
  const canonicalPlan = canonicalizePromptPlan(compiled.plan);
  const providerPrompt = compiled.providerPrompt
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();

  return {
    ...compiled,
    providerPrompt,
    plan: canonicalPlan,
  };
};
