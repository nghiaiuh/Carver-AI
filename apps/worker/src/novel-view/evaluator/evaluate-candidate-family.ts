/* Deterministic MA012 cross-view scoring for caller-supplied observed landmarks. */

import type { CandidateEvaluationMetric, SharedObservedLandmark } from "@carver/shared";
import { DETERMINISTIC_CANDIDATE_EVALUATOR_VERSION } from "./evaluate-candidate";

const clamp = (value: number) => Math.max(0, Math.min(1, value));

export const evaluateSharedObservedLandmarks = (params: {
  readonly candidateId: string;
  readonly landmarks: readonly SharedObservedLandmark[];
}): CandidateEvaluationMetric => {
  const candidateLandmarks = params.landmarks.filter((landmark) => landmark.candidateId === params.candidateId);
  const landmarks = candidateLandmarks.filter((landmark) => landmark.confidence.value !== null);
  if (landmarks.length === 0) {
    return {
      name: "cross_view_landmarks",
      rawValue: null,
      normalizedScore: null,
      confidence: { value: null, basis: "unknown", method: "no_shared_observed_landmarks", version: DETERMINISTIC_CANDIDATE_EVALUATOR_VERSION },
      supportFraction: 0,
    };
  }
  const distance = landmarks.reduce((total, landmark) => {
    const dx = landmark.actualUv[0] - landmark.expectedUv[0];
    const dy = landmark.actualUv[1] - landmark.expectedUv[1];
    return total + Math.hypot(dx, dy);
  }, 0) / landmarks.length;
  const confidenceValue = landmarks.reduce((total, landmark) => total + landmark.confidence.value!, 0) / landmarks.length;
  return {
    name: "cross_view_landmarks",
    rawValue: distance,
    normalizedScore: 1 - clamp(distance / Math.SQRT2),
    confidence: { value: confidenceValue, basis: "heuristic", method: "shared_observed_landmark_displacement", version: DETERMINISTIC_CANDIDATE_EVALUATOR_VERSION },
    supportFraction: landmarks.length / candidateLandmarks.length,
  };
};
