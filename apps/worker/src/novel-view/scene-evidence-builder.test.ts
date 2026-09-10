import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCameraShotDirective } from "@carver/shared";
import sharp from "sharp";
import { hashSourceImageContent } from "./build-model-conditioning";
import {
  buildSceneEvidence,
  buildSceneEvidenceProviderImages,
  SCENE_EVIDENCE_BUILDER_VERSION,
  SCENE_EVIDENCE_DEGRADATION_CODES,
} from "./scene-evidence-builder";

const sourcePng = () =>
  sharp({
    create: { width: 64, height: 40, channels: 3, background: { r: 32, g: 96, b: 64 } },
  })
    .png()
    .toBuffer();

const camera = () =>
  normalizeCameraShotDirective({
    shot: {
      shotSetNodeId: "shot-set-1",
      shotId: "shot-1",
      shotName: "Front left",
      order: 0,
      mode: "orbit",
      orbit: { rotate: -35, tilt: 8, distance: 7.5, lens: 35 },
    },
    aspectRatio: 64 / 40,
    inputAssetIds: ["asset-source"],
  }).cameraSpec!;

test("scene evidence emits deterministic coarse 2.5D artifacts with explicit uncertainty", async () => {
  const buffer = await sourcePng();
  const params = {
    source: {
      assetId: "asset-source",
      buffer,
      contentHash: hashSourceImageContent(buffer),
    },
    targetCamera: camera(),
    protectedRegionMaskAssetId: "asset-mask",
  };
  const first = await buildSceneEvidence(params);
  const second = await buildSceneEvidence(params);

  assert.equal(first.evidence.builderVersion, SCENE_EVIDENCE_BUILDER_VERSION);
  assert.equal(first.evidence.status, "ready");
  assert.equal(first.evidence.geometryConfidence.basis, "heuristic");
  assert.ok(first.evidence.geometryConfidence.value !== null);
  assert.ok((first.evidence.geometryConfidence.value ?? 1) > 0);
  assert.equal(first.evidence.protectedRegionMask?.assetId, "asset-mask");
  assert.deepEqual(first.evidence.degradationCodes, []);
  assert.ok(first.evidence.depthMap?.assetId.startsWith("worker-evidence:depth-map:"));
  assert.ok(first.evidence.depthConfidence?.assetId.startsWith("worker-evidence:depth-confidence:"));
  assert.ok(first.evidence.coarseCameraGuide?.assetId.startsWith("worker-evidence:coarse-camera-guide:"));
  assert.ok(first.evidence.uncertaintyMask?.assetId.startsWith("worker-evidence:uncertainty-mask:"));
  const coverage = first.evidence.coverage!;
  assert.ok(coverage.observed >= 0 && coverage.inferred >= 0 && coverage.unobserved >= 0);
  assert.ok(Math.abs((coverage.observed + coverage.inferred + coverage.unobserved) - 1) < 0.000_000_001);
  assert.ok(coverage.inferred + coverage.unobserved > 0, "a changed camera must expose non-observed guide pixels");
  assert.ok(first.artifacts.normalizedSource);
  assert.ok(first.artifacts.cameraOverlay);
  assert.ok(first.artifacts.depthMap);
  assert.ok(first.artifacts.depthConfidence);
  assert.ok(first.artifacts.coarseCameraGuide);
  assert.ok(first.artifacts.uncertaintyMask);
  assert.equal(first.artifacts.normalizedSource?.width, 64);
  assert.equal(first.artifacts.cameraOverlay?.height, 40);
  assert.equal(first.artifacts.cameraOverlay?.sourceArtifactHash, first.artifacts.normalizedSource?.contentHash);
  assert.equal(first.evidence.evidenceId, second.evidence.evidenceId);
  assert.deepEqual(first.artifacts.cameraOverlay?.buffer, second.artifacts.cameraOverlay?.buffer);
  assert.deepEqual(first.artifacts.depthMap?.buffer, second.artifacts.depthMap?.buffer);
  assert.deepEqual(first.artifacts.coarseCameraGuide?.buffer, second.artifacts.coarseCameraGuide?.buffer);
  assert.notDeepEqual(first.artifacts.coarseCameraGuide?.buffer, first.artifacts.normalizedSource?.buffer);
  const guideMetadata = await sharp(first.artifacts.coarseCameraGuide?.buffer).metadata();
  assert.equal(guideMetadata.width, 64);
  assert.equal(guideMetadata.height, 40);
  const providerImages = buildSceneEvidenceProviderImages(first.artifacts);
  assert.deepEqual(providerImages.map((image) => [image.role, image.assetId]), [
    ["camera_guide", first.evidence.coarseCameraGuide?.assetId],
    ["uncertainty_guide", first.evidence.uncertaintyMask?.assetId],
  ]);
  assert.deepEqual(providerImages.map((image) => image.buffer), [
    first.artifacts.coarseCameraGuide?.buffer,
    first.artifacts.uncertaintyMask?.buffer,
  ]);
});

test("scene evidence degrades honestly when source bytes cannot be decoded", async () => {
  const result = await buildSceneEvidence({
    source: {
      assetId: "asset-source",
      buffer: Buffer.from("not an image"),
      contentHash: "sha256:fixture-source",
    },
    targetCamera: camera(),
  });

  assert.equal(result.evidence.status, "unavailable");
  assert.deepEqual(result.evidence.degradationCodes, [
    SCENE_EVIDENCE_DEGRADATION_CODES.sourceArtifactUnavailable,
    SCENE_EVIDENCE_DEGRADATION_CODES.sourceContentHashMismatch,
    SCENE_EVIDENCE_DEGRADATION_CODES.cameraOverlayUnavailable,
  ]);
  assert.deepEqual(result.artifacts, {});
});

test("scene evidence rejects a declared source hash that does not match the decoded bytes", async () => {
  const buffer = await sourcePng();
  const result = await buildSceneEvidence({
    source: {
      assetId: "asset-source",
      buffer,
      contentHash: "sha256:stale-source-content",
    },
    targetCamera: camera(),
  });

  assert.equal(result.evidence.status, "unavailable");
  assert.equal(result.evidence.sourceContentHash, hashSourceImageContent(buffer));
  assert.deepEqual(result.evidence.degradationCodes, [
    SCENE_EVIDENCE_DEGRADATION_CODES.sourceArtifactUnavailable,
    SCENE_EVIDENCE_DEGRADATION_CODES.sourceContentHashMismatch,
    SCENE_EVIDENCE_DEGRADATION_CODES.cameraOverlayUnavailable,
  ]);
  assert.deepEqual(result.artifacts, {});
});
