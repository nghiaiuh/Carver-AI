/*
 * Flow: Scores one generated candidate with deterministic local evidence.
 * 1. Reject malformed output before it can win a shot.
 * 2. Compare only evidence-supported image structure to the coarse guide.
 * 3. Preserve unavailable metrics as null instead of inventing a score.
 */

import {
  CANDIDATE_EVALUATION_SCHEMA_VERSION,
  type CandidateEvaluationMetric,
  type EvaluationScore,
  type GenerationCandidate,
  type SceneEvidence,
} from "@carver/shared";
import sharp from "sharp";

export const DETERMINISTIC_CANDIDATE_EVALUATOR_VERSION = "deterministic-candidate-evaluator-v1" as const;
const SAMPLE_SIZE = 48;
const MAX_IMAGE_PIXELS = 40_000_000;

type CandidateImage = {
  readonly buffer: Buffer;
  readonly mimeType: string;
  readonly width: number;
  readonly height: number;
};

type EvidenceArtifacts = {
  readonly coarseCameraGuide?: { readonly buffer: Buffer };
  readonly uncertaintyMask?: { readonly buffer: Buffer };
  /** Only a target-view projection is valid for the protected-region metric. */
  readonly projectedProtectedRegionMask?: { readonly buffer: Buffer };
};

const confidence = (value: number | null, basis: "heuristic" | "unknown", method: string) => ({
  value,
  basis,
  method,
  version: DETERMINISTIC_CANDIDATE_EVALUATOR_VERSION,
} as const);

const unavailableMetric = (name: CandidateEvaluationMetric["name"], method: string): CandidateEvaluationMetric => ({
  name,
  rawValue: null,
  normalizedScore: null,
  confidence: confidence(null, "unknown", method),
  supportFraction: 0,
});

const luma = (pixels: Buffer, offset: number) =>
  (pixels[offset]! * 0.2126) + (pixels[offset + 1]! * 0.7152) + (pixels[offset + 2]! * 0.0722);

const normalizedRgba = async (buffer: Buffer) =>
  sharp(buffer, { failOn: "none", limitInputPixels: MAX_IMAGE_PIXELS })
    .rotate()
    .resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: "fill", kernel: "nearest" })
    .ensureAlpha()
    .raw()
    .toBuffer();

const normalizedGray = async (buffer: Buffer) =>
  sharp(buffer, { failOn: "none", limitInputPixels: MAX_IMAGE_PIXELS })
    .rotate()
    .resize(SAMPLE_SIZE, SAMPLE_SIZE, { fit: "fill", kernel: "nearest" })
    .removeAlpha()
    .greyscale()
    .raw()
    .toBuffer();

const integrityMetric = (hardGateFailures: readonly string[]): CandidateEvaluationMetric => ({
  name: "output_integrity",
  rawValue: hardGateFailures.length === 0 ? 1 : 0,
  normalizedScore: hardGateFailures.length === 0 ? 1 : 0,
  confidence: confidence(1, "heuristic", "decoded_output_integrity"),
  supportFraction: 1,
});

export const evaluateGeneratedCandidate = async (params: {
  candidate: GenerationCandidate;
  image: CandidateImage;
  evidence: SceneEvidence | null;
  artifacts?: EvidenceArtifacts;
}): Promise<EvaluationScore> => {
  const hardGateFailures: string[] = [];
  let outputMetadata: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>> | null = null;
  try {
    outputMetadata = await sharp(params.image.buffer, { failOn: "none", limitInputPixels: MAX_IMAGE_PIXELS }).metadata();
  } catch {
    hardGateFailures.push("OUTPUT_DECODE_FAILED");
  }
  if (!outputMetadata?.width || !outputMetadata.height) hardGateFailures.push("OUTPUT_DIMENSIONS_UNAVAILABLE");
  if (outputMetadata && (outputMetadata.width !== params.image.width || outputMetadata.height !== params.image.height)) {
    hardGateFailures.push("OUTPUT_DIMENSIONS_MISMATCH");
  }
  if ((outputMetadata?.width ?? 0) > 8_000 || (outputMetadata?.height ?? 0) > 8_000) {
    hardGateFailures.push("OUTPUT_DIMENSIONS_EXCEED_LIMIT");
  }

  const metrics: CandidateEvaluationMetric[] = [integrityMetric(hardGateFailures)];
  const guide = params.artifacts?.coarseCameraGuide;
  const uncertainty = params.artifacts?.uncertaintyMask;
  if (hardGateFailures.length === 0 && guide && uncertainty && params.evidence?.status === "ready") {
    try {
      const [candidatePixels, guidePixels, uncertaintyPixels, projectedProtectedRegionMask] = await Promise.all([
        normalizedRgba(params.image.buffer),
        normalizedRgba(guide.buffer),
        normalizedGray(uncertainty.buffer),
        params.artifacts?.projectedProtectedRegionMask
          ? normalizedGray(params.artifacts.projectedProtectedRegionMask.buffer)
          : Promise.resolve(null),
      ]);
      let weightedError = 0;
      let supportWeight = 0;
      let candidateLuminanceWeight = 0;
      let guideLuminanceWeight = 0;
      let candidateCenterX = 0;
      let candidateCenterY = 0;
      let guideCenterX = 0;
      let guideCenterY = 0;
      let protectedError = 0;
      let protectedWeight = 0;
      let unobservedCount = 0;
      let copiedGuideCount = 0;
      for (let index = 0; index < SAMPLE_SIZE * SAMPLE_SIZE; index += 1) {
        const uncertaintyValue = uncertaintyPixels[index]! / 255;
        const support = 1 - uncertaintyValue;
        const offset = index * 4;
        const candidateLuminance = luma(candidatePixels, offset);
        const guideLuminance = luma(guidePixels, offset);
        const lumaError = Math.abs(candidateLuminance - guideLuminance) / 255;
        weightedError += lumaError * support;
        supportWeight += support;
        const x = index % SAMPLE_SIZE;
        const y = Math.floor(index / SAMPLE_SIZE);
        candidateLuminanceWeight += candidateLuminance * support;
        guideLuminanceWeight += guideLuminance * support;
        candidateCenterX += candidateLuminance * support * x;
        candidateCenterY += candidateLuminance * support * y;
        guideCenterX += guideLuminance * support * x;
        guideCenterY += guideLuminance * support * y;
        const protectedWeightAtPixel = projectedProtectedRegionMask?.[index] ?? 0;
        if (protectedWeightAtPixel > 0) {
          const normalizedProtectedWeight = protectedWeightAtPixel / 255;
          protectedError += lumaError * normalizedProtectedWeight;
          protectedWeight += normalizedProtectedWeight;
        }
        if (uncertaintyValue >= 0.94) {
          unobservedCount += 1;
          const redDifference = Math.abs(candidatePixels[offset]! - guidePixels[offset]!);
          const greenDifference = Math.abs(candidatePixels[offset + 1]! - guidePixels[offset + 1]!);
          const blueDifference = Math.abs(candidatePixels[offset + 2]! - guidePixels[offset + 2]!);
          if (redDifference + greenDifference + blueDifference <= 24) copiedGuideCount += 1;
        }
      }
      const supportFraction = supportWeight / (SAMPLE_SIZE * SAMPLE_SIZE);
      const guideError = supportWeight > 0 ? weightedError / supportWeight : null;
      const framingDisplacement = candidateLuminanceWeight > 0 && guideLuminanceWeight > 0
        ? Math.hypot(
            (candidateCenterX / candidateLuminanceWeight) - (guideCenterX / guideLuminanceWeight),
            (candidateCenterY / candidateLuminanceWeight) - (guideCenterY / guideLuminanceWeight),
          ) / Math.hypot(SAMPLE_SIZE - 1, SAMPLE_SIZE - 1)
        : null;
      metrics.push(framingDisplacement === null
        ? unavailableMetric("camera_framing_proxy", "no_evidence_supported_luminance")
        : {
            name: "camera_framing_proxy",
            rawValue: framingDisplacement,
            normalizedScore: Math.max(0, 1 - framingDisplacement),
            confidence: confidence(params.evidence.geometryConfidence.value, "heuristic", "observed_luminance_centroid_displacement"),
            supportFraction,
          });
      metrics.push(guideError === null
        ? unavailableMetric("observed_structure_similarity", "no_evidence_supported_pixels")
        : {
            name: "observed_structure_similarity",
            rawValue: guideError,
            normalizedScore: Math.max(0, 1 - guideError),
            confidence: confidence(params.evidence.geometryConfidence.value, "heuristic", "evidence_weighted_luminance_structure"),
            supportFraction,
          });
      if (params.evidence.protectedRegionMask) {
        const protectedRegionError = protectedWeight > 0 ? protectedError / protectedWeight : null;
        const protectedRegionMetric = protectedRegionError === null
          ? unavailableMetric("protected_region_overlap", "target_view_protected_region_projection_unavailable")
          : {
              name: "protected_region_overlap" as const,
              rawValue: protectedRegionError,
              normalizedScore: Math.max(0, 1 - protectedRegionError),
              confidence: confidence(params.evidence.geometryConfidence.value, "heuristic", "projected_protected_region_luminance_overlap"),
              supportFraction: protectedWeight / (SAMPLE_SIZE * SAMPLE_SIZE),
            };
        metrics.push(protectedRegionMetric);
        if (protectedRegionError !== null && protectedRegionError > 0.6) {
          hardGateFailures.push("PROTECTED_REGION_NON_PRESERVATION");
        }
      }
      metrics.push(unobservedCount === 0
        ? unavailableMetric("guide_leakage", "no_unobserved_guide_pixels")
        : {
            name: "guide_leakage",
            rawValue: copiedGuideCount / unobservedCount,
            normalizedScore: 1 - (copiedGuideCount / unobservedCount),
            confidence: confidence(params.evidence.geometryConfidence.value, "heuristic", "unobserved_guide_color_copy_probe"),
            supportFraction: unobservedCount / (SAMPLE_SIZE * SAMPLE_SIZE),
          });
    } catch {
      metrics.push(unavailableMetric("camera_framing_proxy", "evidence_artifact_decode_failed"));
      metrics.push(unavailableMetric("observed_structure_similarity", "evidence_artifact_decode_failed"));
      if (params.evidence.protectedRegionMask) {
        metrics.push(unavailableMetric("protected_region_overlap", "evidence_artifact_decode_failed"));
      }
      metrics.push(unavailableMetric("guide_leakage", "evidence_artifact_decode_failed"));
    }
  } else {
    metrics.push(unavailableMetric("camera_framing_proxy", "scene_evidence_unavailable"));
    metrics.push(unavailableMetric("observed_structure_similarity", "scene_evidence_unavailable"));
    if (params.evidence?.protectedRegionMask) {
      metrics.push(unavailableMetric("protected_region_overlap", "scene_evidence_unavailable"));
    }
    metrics.push(unavailableMetric("guide_leakage", "scene_evidence_unavailable"));
  }

  const weightedMetrics = metrics.filter((metric) => metric.normalizedScore !== null);
  const compositeScore = weightedMetrics.length === 0
    ? null
    : weightedMetrics.reduce((total, metric) => total + metric.normalizedScore! * metric.confidence.value!, 0) /
      weightedMetrics.reduce((total, metric) => total + metric.confidence.value!, 0);
  const decision = hardGateFailures.length > 0
    ? "reject" as const
    : compositeScore === null || compositeScore < 0.55
      ? "needs_review" as const
      : "accept" as const;

  return {
    schemaVersion: CANDIDATE_EVALUATION_SCHEMA_VERSION,
    candidateId: params.candidate.candidateId,
    evaluatorVersion: DETERMINISTIC_CANDIDATE_EVALUATOR_VERSION,
    decision,
    compositeScore,
    hardGateFailures,
    metrics,
  };
};

export const selectDeterministicWinner = (params: readonly {
  readonly candidate: GenerationCandidate;
  readonly score: EvaluationScore;
}[]) => {
  const eligible = params.filter((entry) => entry.score.decision !== "reject");
  if (eligible.length === 0) return null;
  return [...eligible].sort((left, right) => {
    const scoreDifference = (right.score.compositeScore ?? -1) - (left.score.compositeScore ?? -1);
    return scoreDifference !== 0
      ? scoreDifference
      : left.candidate.candidateIndex - right.candidate.candidateIndex;
  })[0]!;
};
