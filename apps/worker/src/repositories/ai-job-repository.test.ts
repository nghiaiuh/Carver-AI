import assert from "node:assert/strict";
import test from "node:test";
import { adaptLegacyCameraShot } from "@carver/shared";
import { readPersistedGenerationOptions } from "./ai-job-repository";

test("worker preserves image generator options from the persisted job payload", () => {
  const options = readPersistedGenerationOptions({
    targetType: "image-generator",
    model: "gpt-image-1",
    aspectRatio: "16:9",
    outputCount: 4,
    imageGeneratorContext: {
      nodeId: "generator-1",
      nodeTitle: "Image Generator #1",
      imageReferences: [],
      presetReferences: [],
      textReferences: [
        {
          nodeId: "assistant-1",
          title: "Assistant #1",
          content: "Create an autumn landscape concept.",
          sourceKind: "assistant",
        },
      ],
      connectionSummary: "Text refs: Assistant #1.",
    },
  });

  assert.equal(options.targetType, "image-generator");
  assert.equal(options.model, "gpt-image-1");
  assert.equal(options.aspectRatio, "16:9");
  assert.equal(options.outputCount, 4);
  assert.equal(options.imageGeneratorContext?.textReferences.length, 1);
});

test("worker clamps malformed persisted output counts instead of silently creating an unlimited batch", () => {
  assert.equal(readPersistedGenerationOptions({ outputCount: 99 }).outputCount, 4);
  assert.equal(readPersistedGenerationOptions({ outputCount: 0 }).outputCount, 1);
  assert.equal(readPersistedGenerationOptions({ outputCount: 1.5 }).outputCount, undefined);
});

test("worker upgrades a legacy multi-angle job to a normalized CameraSpec", () => {
  const sourceAssetId = "22222222-2222-4222-8222-222222222222";
  const options = readPersistedGenerationOptions({
    aspectRatio: "16:9",
    cameraShotSetContext: {
      shotSetNodeId: "camera-set-1",
      source: {
        nodeId: "source-1",
        title: "Source image",
        imageUrl: "",
        assetId: sourceAssetId,
        role: "direct_edit_target",
        prompt: null,
      },
      shots: [{
        shotSetNodeId: "camera-set-1",
        shotId: "camera-1",
        shotName: "Camera 01",
        order: 0,
        mode: "orbit",
        orbit: { rotate: -42, tilt: -18, distance: 7.5, lens: 35 },
      }],
    },
  });

  const spec = options.cameraShotSetContext?.shots[0]?.cameraSpec;
  assert.equal(spec?.schemaVersion, 1);
  assert.equal(spec?.projection.aspectRatio, 1.777777777778);
  assert.deepEqual(spec?.provenance.inputAssetIds, [sourceAssetId]);
});

test("worker rejects a schema-shaped CameraSpec with an invalid camera pose", () => {
  const sourceAssetId = "33333333-3333-4333-8333-333333333333";
  const validSpec = adaptLegacyCameraShot({
    mode: "orbit",
    orbit: { rotate: 0, tilt: 0, distance: 7.5, lens: 35 },
  }, { inputAssetIds: [sourceAssetId] });
  const options = readPersistedGenerationOptions({
    cameraShotSetContext: {
      shotSetNodeId: "camera-set-1",
      source: {
        nodeId: "source-1",
        title: "Source image",
        imageUrl: "",
        assetId: sourceAssetId,
        role: "direct_edit_target",
        prompt: null,
      },
      shots: [{
        shotSetNodeId: "camera-set-1",
        shotId: "camera-1",
        shotName: "Camera 01",
        order: 0,
        mode: "orbit",
        orbit: { rotate: 0, tilt: 0, distance: 7.5, lens: 35 },
        cameraSpec: {
          ...validSpec,
          pose: { ...validSpec.pose, target: validSpec.pose.position },
        },
      }],
    },
  });

  assert.equal(options.cameraShotSetContext, undefined);
});
