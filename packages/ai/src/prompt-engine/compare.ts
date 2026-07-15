import type { PromptPlanV2 } from "@carver/shared";

export type PromptEngineComparison = {
  operationAgreement: number;
  targetAgreement: boolean;
  referenceAgreement: number;
  criticalConstraintAgreement: boolean;
  riskAgreement: boolean;
  decisionAgreement: boolean;
  latencyDeltaMs: number;
  severity: "none" | "low" | "high" | "critical";
};

const ratio = (matched: number, total: number) => (total <= 0 ? 1 : matched / total);

export const comparePromptPlans = (params: {
  baseline: PromptPlanV2;
  candidate: PromptPlanV2;
  latencyDeltaMs?: number;
}): PromptEngineComparison => {
  const baselineOperations = new Set(params.baseline.operations.map((operation) => JSON.stringify(operation)));
  const candidateOperations = new Set(params.candidate.operations.map((operation) => JSON.stringify(operation)));
  const matchedOperations = [...baselineOperations].filter((operation) => candidateOperations.has(operation)).length;

  const baselineReferences = new Set(params.baseline.references.map((reference) => `${reference.contextId}:${reference.effectiveRole}`));
  const candidateReferences = new Set(params.candidate.references.map((reference) => `${reference.contextId}:${reference.effectiveRole}`));
  const matchedReferences = [...baselineReferences].filter((reference) => candidateReferences.has(reference)).length;

  const baselineHardConstraints = new Set(
    params.baseline.constraints
      .filter((constraint) => constraint.severity === "hard")
      .map((constraint) => `${constraint.type}:${constraint.subjectId ?? ""}:${constraint.regionId ?? ""}`),
  );
  const candidateHardConstraints = new Set(
    params.candidate.constraints
      .filter((constraint) => constraint.severity === "hard")
      .map((constraint) => `${constraint.type}:${constraint.subjectId ?? ""}:${constraint.regionId ?? ""}`),
  );

  const criticalConstraintAgreement = [...baselineHardConstraints].every((constraint) =>
    candidateHardConstraints.has(constraint),
  );
  const targetAgreement = params.baseline.target.value?.contextId === params.candidate.target.value?.contextId;
  const riskAgreement = params.baseline.risk.level === params.candidate.risk.level;
  const decisionAgreement = params.baseline.decision === params.candidate.decision;

  const severity =
    !criticalConstraintAgreement || !targetAgreement
      ? "critical"
      : !decisionAgreement || !riskAgreement
        ? "high"
        : matchedOperations !== baselineOperations.size || matchedReferences !== baselineReferences.size
          ? "low"
          : "none";

  return {
    operationAgreement: ratio(matchedOperations, baselineOperations.size),
    targetAgreement,
    referenceAgreement: ratio(matchedReferences, baselineReferences.size),
    criticalConstraintAgreement,
    riskAgreement,
    decisionAgreement,
    latencyDeltaMs: params.latencyDeltaMs ?? 0,
    severity,
  };
};
