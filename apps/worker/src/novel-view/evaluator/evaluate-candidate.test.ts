import assert from "node:assert/strict";
import test from "node:test";
import type { GenerationCandidate, SceneEvidence } from "@carver/shared";
import sharp from "sharp";
import { evaluateSharedObservedLandmarks } from "./evaluate-candidate-family";
import { evaluateGeneratedCandidate, selectDeterministicWinner } from "./evaluate-candidate";

const candidate = (candidateIndex: number): GenerationCandidate => ({
  candidateId: `shot-candidate-${candidateIndex}`,
  invocationId: `shot-invocation-${candidateIndex}`,
  shotId: "shot-1",
  shotOrder: 0,
  candidateIndex,
  conditioningHash: "conditioning-hash",
  assetId: `asset-${candidateIndex}`,
});

const fixturePng = (background: { r: number; g: number; b: number; alpha?: number }) =>
  sharp({ create: { width: 12, height: 8, channels: 4, background } }).png().toBuffer();

const evidence: SceneEvidence = {
  schemaVersion: 1,
  evidenceId: "scene-evidence:fixture",
  sourceImage: { assetId: "asset-source" },
  sourceContentHash: "sha256:source",
  targetCameraHash: "camera-hash",
  builderVersion: "fixture",
  status: "ready",
  geometryConfidence: { value: 0.8, basis: "heuristic", method: "fixture", version: "fixture" },
  coverage: { observed: 0.8, inferred: 0.1, unobserved: 0.1 },
  degradationCodes: [],
};

test("candidate evaluator is deterministic, evidence-aware, and rejects malformed output", async () => {
  const guide = await fixturePng({ r: 80, g: 120, b: 100 });
  const uncertainty = await fixturePng({ r: 24, g: 24, b: 24 });
  const image = await fixturePng({ r: 80, g: 120, b: 100 });
  const params = {
    candidate: candidate(0),
    image: { buffer: image, mimeType: "image/png", width: 12, height: 8 },
    evidence,
    artifacts: { coarseCameraGuide: { buffer: guide }, uncertaintyMask: { buffer: uncertainty } },
  };
  const first = await evaluateGeneratedCandidate(params);
  const second = await evaluateGeneratedCandidate(params);
  assert.deepEqual(first, second);
  assert.equal(first.decision, "accept");
  assert.equal(first.hardGateFailures.length, 0);
  assert.ok((first.compositeScore ?? 0) > 0.9);

  const invalid = await evaluateGeneratedCandidate({
    ...params,
    candidate: candidate(1),
    image: { buffer: Buffer.from("not an image"), mimeType: "image/png", width: 12, height: 8 },
  });
  assert.equal(invalid.decision, "reject");
  assert.ok(invalid.hardGateFailures.includes("OUTPUT_DECODE_FAILED"));
});

test("candidate winner uses score then candidate index as a stable tie break", async () => {
  const image = await fixturePng({ r: 80, g: 120, b: 100 });
  const score = await evaluateGeneratedCandidate({
    candidate: candidate(1),
    image: { buffer: image, mimeType: "image/png", width: 12, height: 8 },
    evidence: null,
  });
  const winner = selectDeterministicWinner([
    { candidate: candidate(2), score: { ...score, candidateId: candidate(2).candidateId, compositeScore: 0.8, decision: "accept" } },
    { candidate: candidate(1), score: { ...score, candidateId: candidate(1).candidateId, compositeScore: 0.8, decision: "accept" } },
  ]);
  assert.equal(winner?.candidate.candidateIndex, 1);
});

test("candidate evaluator hard-gates a projected protected region that is not preserved", async () => {
  const guide = await fixturePng({ r: 240, g: 240, b: 240 });
  const uncertainty = await fixturePng({ r: 0, g: 0, b: 0 });
  const projectedMask = await fixturePng({ r: 255, g: 255, b: 255 });
  const image = await fixturePng({ r: 0, g: 0, b: 0 });
  const protectedEvidence: SceneEvidence = {
    ...evidence,
    protectedRegionMask: { assetId: "asset-protected-mask" },
  };
  const score = await evaluateGeneratedCandidate({
    candidate: candidate(3),
    image: { buffer: image, mimeType: "image/png", width: 12, height: 8 },
    evidence: protectedEvidence,
    artifacts: {
      coarseCameraGuide: { buffer: guide },
      uncertaintyMask: { buffer: uncertainty },
      projectedProtectedRegionMask: { buffer: projectedMask },
    },
  });
  assert.equal(score.decision, "reject");
  assert.ok(score.hardGateFailures.includes("PROTECTED_REGION_NON_PRESERVATION"));
  assert.ok(score.metrics.some((metric) => metric.name === "protected_region_overlap" && metric.normalizedScore !== null));
});

test("cross-view scoring uses only caller-provided observed landmarks", () => {
  const metric = evaluateSharedObservedLandmarks({
    candidateId: "shot-candidate-0",
    landmarks: [{
      landmarkId: "pond-edge",
      candidateId: "shot-candidate-0",
      shotId: "shot-1",
      expectedUv: [0.4, 0.5],
      actualUv: [0.45, 0.5],
      confidence: { value: 0.8, basis: "heuristic", method: "fixture", version: "fixture" },
    }],
  });
  assert.equal(metric.name, "cross_view_landmarks");
  assert.ok(Math.abs((metric.rawValue ?? 0) - 0.05) < Number.EPSILON);
  assert.ok((metric.normalizedScore ?? 0) > 0.9);
  assert.equal(evaluateSharedObservedLandmarks({ candidateId: "missing", landmarks: [] }).normalizedScore, null);
});
