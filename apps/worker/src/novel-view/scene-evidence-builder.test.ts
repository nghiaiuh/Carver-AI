import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCameraShotDirective } from "@carver/shared";
import sharp from "sharp";
import { hashSourceImageContent } from "./build-model-conditioning";
import {
  buildSceneEvidence,
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

test("scene evidence emits deterministic source and camera-overlay artifacts without claiming geometry", async () => {
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
  assert.equal(first.evidence.status, "partial");
  assert.equal(first.evidence.geometryConfidence.value, null);
  assert.equal(first.evidence.protectedRegionMask?.assetId, "asset-mask");
  assert.deepEqual(first.evidence.degradationCodes, [
    SCENE_EVIDENCE_DEGRADATION_CODES.depthUnavailable,
    SCENE_EVIDENCE_DEGRADATION_CODES.coarseCameraGuideUnavailable,
    SCENE_EVIDENCE_DEGRADATION_CODES.uncertaintyMaskUnavailable,
  ]);
  assert.ok(first.artifacts.normalizedSource);
  assert.ok(first.artifacts.cameraOverlay);
  assert.equal(first.artifacts.normalizedSource?.width, 64);
  assert.equal(first.artifacts.cameraOverlay?.height, 40);
  assert.equal(first.artifacts.cameraOverlay?.sourceArtifactHash, first.artifacts.normalizedSource?.contentHash);
  assert.equal(first.evidence.evidenceId, second.evidence.evidenceId);
  assert.deepEqual(first.artifacts.cameraOverlay?.buffer, second.artifacts.cameraOverlay?.buffer);
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
    SCENE_EVIDENCE_DEGRADATION_CODES.cameraOverlayUnavailable,
  ]);
  assert.deepEqual(result.artifacts, {});
});
