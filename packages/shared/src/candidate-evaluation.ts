/*
 * Flow: Shares deterministic candidate/evaluation contracts between workers,
 * persistence, and future provider adapters. These receipts contain only
 * stable IDs and measurements - never image bytes, URLs, or provider payloads.
 */

import type { Confidence } from "./model-conditioning";

export const CANDIDATE_EVALUATION_SCHEMA_VERSION = 1 as const;

export type CandidateCount = 1 | 2 | 3 | 4;

export type GenerationCandidate = {
  readonly candidateId: string;
  readonly invocationId: string;
  readonly shotId: string;
  readonly shotOrder: number;
  readonly candidateIndex: number;
  readonly conditioningHash: string | null;
  readonly assetId: string;
};

export type CandidateEvaluationMetric = {
  readonly name:
    | "output_integrity"
    | "camera_framing_proxy"
    | "observed_structure_similarity"
    | "protected_region_overlap"
    | "guide_leakage"
    | "cross_view_landmarks";
  readonly rawValue: number | null;
  readonly normalizedScore: number | null;
  readonly confidence: Confidence;
  readonly supportFraction: number;
};

export type EvaluationScore = {
  readonly schemaVersion: typeof CANDIDATE_EVALUATION_SCHEMA_VERSION;
  readonly candidateId: string;
  readonly evaluatorVersion: string;
  readonly decision: "accept" | "reject" | "needs_review";
  readonly compositeScore: number | null;
  readonly hardGateFailures: readonly string[];
  readonly metrics: readonly CandidateEvaluationMetric[];
};

export type CandidateSelection = {
  readonly shotId: string;
  readonly candidateId: string;
  readonly candidateIndex: number;
  readonly score: EvaluationScore;
};

/**
 * A caller supplies landmarks only when it can establish their expected and
 * actual image positions without a paid VLM. Unsupported landmarks remain out
 * of the metric rather than being fabricated as zero-confidence observations.
 */
export type SharedObservedLandmark = {
  readonly landmarkId: string;
  readonly candidateId: string;
  readonly shotId: string;
  readonly expectedUv: readonly [number, number];
  readonly actualUv: readonly [number, number];
  readonly confidence: Confidence;
};

export type ProviderConditioningCapability = {
  readonly providerId: string;
  readonly supportsImageEdit: boolean;
  readonly supportsOrderedImageRoles: boolean;
  readonly supportsNativeProtectedMask: boolean;
  readonly maximumInputImages: number;
  readonly maximumCandidatesPerRequest: CandidateCount;
};

export type ProviderConditioningBenchmark = {
  readonly providerId: string;
  readonly conditioningHash: string;
  readonly supported: boolean;
  readonly unsupportedRequirements: readonly string[];
};
