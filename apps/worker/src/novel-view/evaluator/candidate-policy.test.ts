import assert from "node:assert/strict";
import test from "node:test";
import type { SceneEvidence } from "@carver/shared";
import { planCandidatePolicy } from "./candidate-policy";

const evidence = (params: { confidence: number | null; observed: number; inferred: number; unobserved: number; status?: SceneEvidence["status"] }): SceneEvidence => ({
  schemaVersion: 1,
  evidenceId: "scene-evidence:fixture",
  sourceImage: { assetId: "asset-source" },
  sourceContentHash: "sha256:source",
  targetCameraHash: "camera-hash",
  builderVersion: "fixture",
  status: params.status ?? "ready",
  geometryConfidence: { value: params.confidence, basis: params.confidence === null ? "unknown" : "heuristic", method: "fixture", version: "fixture" },
  coverage: { observed: params.observed, inferred: params.inferred, unobserved: params.unobserved },
  degradationCodes: [],
});

test("candidate policy spends one to four candidates only as complete evidence risk increases", () => {
  assert.equal(planCandidatePolicy(null).candidateCount, 1);
  assert.equal(planCandidatePolicy(evidence({ confidence: null, observed: 0, inferred: 0, unobserved: 1 })).candidateCount, 1);
  assert.equal(planCandidatePolicy(evidence({ confidence: 0.9, observed: 0.95, inferred: 0.04, unobserved: 0.01 })).candidateCount, 1);
  assert.equal(planCandidatePolicy(evidence({ confidence: 0.7, observed: 0.6, inferred: 0.2, unobserved: 0.2 })).candidateCount, 2);
  assert.equal(planCandidatePolicy(evidence({ confidence: 0.45, observed: 0.4, inferred: 0.2, unobserved: 0.4 })).candidateCount, 3);
  assert.equal(planCandidatePolicy(evidence({ confidence: 0.2, observed: 0.05, inferred: 0.05, unobserved: 0.9 })).candidateCount, 4);
});
