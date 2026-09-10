/*
 * Flow: Converts evidence quality into the bounded paid-candidate budget.
 * A missing evidence receipt never authorizes extra model calls; additional
 * candidates are reserved only for complete evidence with increasing novel-view
 * uncertainty.
 */

import type { CandidateCount, SceneEvidence } from "@carver/shared";

export const CANDIDATE_POLICY_VERSION = "candidate-policy-v1" as const;

export type CandidatePolicy = {
  readonly version: typeof CANDIDATE_POLICY_VERSION;
  readonly candidateCount: CandidateCount;
  readonly risk: "low" | "moderate" | "high" | "very_high";
  readonly reason: string;
};

const clamp = (value: number) => Math.max(0, Math.min(1, value));

export const planCandidatePolicy = (evidence: SceneEvidence | null | undefined): CandidatePolicy => {
  if (!evidence || evidence.status !== "ready" || !evidence.coverage || evidence.geometryConfidence.value === null) {
    return {
      version: CANDIDATE_POLICY_VERSION,
      candidateCount: 1,
      risk: "high",
      reason: "Scene evidence is incomplete, so the worker keeps the paid candidate budget at one.",
    };
  }

  const uncertaintyRisk = clamp(
    (evidence.coverage.unobserved * 0.7) +
    (evidence.coverage.inferred * 0.2) +
    ((1 - evidence.geometryConfidence.value) * 0.1),
  );
  if (uncertaintyRisk < 0.18) {
    return { version: CANDIDATE_POLICY_VERSION, candidateCount: 1, risk: "low", reason: "Observed coverage is sufficient for one candidate." };
  }
  if (uncertaintyRisk < 0.36) {
    return { version: CANDIDATE_POLICY_VERSION, candidateCount: 2, risk: "moderate", reason: "Some inferred coverage warrants two deterministic candidates." };
  }
  if (uncertaintyRisk < 0.58) {
    return { version: CANDIDATE_POLICY_VERSION, candidateCount: 3, risk: "high", reason: "Materially uncertain target-view coverage warrants three candidates." };
  }
  return { version: CANDIDATE_POLICY_VERSION, candidateCount: 4, risk: "very_high", reason: "High disocclusion uncertainty uses the capped four-candidate budget." };
};
