import assert from "node:assert/strict";
import test from "node:test";
import type { CanvasNode } from "../types/canvas";
import {
  buildImageGeneratorGraphContext,
  resolveConnectedImageAssetId,
  resolveGeneratedNodeOutput,
} from "./imageGeneratorGraphContext";

test("recovers the current asset ID from a refreshed gateway URL", () => {
  const currentAssetId = "11111111-1111-4111-8111-111111111111";
  const staleAssetId = "22222222-2222-4222-8222-222222222222";

  assert.equal(
    resolveConnectedImageAssetId({
      imageUrl: `/api/assets/${currentAssetId}/content?variant=original&exp=123&token=signed`,
      assetId: staleAssetId,
    }),
    currentAssetId,
  );
});

test("falls back to persisted source metadata for non-gateway URLs", () => {
  const assetId = "33333333-3333-4333-8333-333333333333";

  assert.equal(
    resolveConnectedImageAssetId({
      imageUrl: "https://images.example.test/garden.webp",
      assetId,
    }),
    assetId,
  );
});

test("multi-angles resolves the selected Image Generator gallery output as its source", () => {
  const selectedAssetId = "44444444-4444-4444-8444-444444444444";
  const nodes = [
    {
      id: "source-generator",
      kind: "image-generator",
      title: "Source Generator",
      imageGenerator: {
        prompt: "",
        model: "auto",
        aspectRatio: "1:1",
        outputCount: 1,
        status: "completed",
        outputAssetIds: [selectedAssetId],
        selectedOutputAssetId: selectedAssetId,
        outputs: [
          {
            assetId: selectedAssetId,
            title: "Selected source",
            prompt: "",
            imageUrl: `/api/assets/${selectedAssetId}/content`,
            width: 1024,
            height: 1024,
          },
        ],
      },
    },
    {
      id: "source-gallery",
      kind: "image-output-gallery",
      title: "Generated Outputs",
      imageOutputGallery: {
        generatorNodeId: "source-generator",
        selectedOutputAssetId: selectedAssetId,
      },
    },
    {
      id: "camera-set",
      kind: "camera-shot-set",
      title: "Multi-Angles",
      cameraShotSet: {
        mode: "orbit",
        cameras: [{
          id: "shot-01",
          name: "Camera 01",
          isVisible: true,
          plan: {
            u: 0.5,
            v: 0.2,
            targetU: 0.5,
            targetV: 0.55,
            height: 2.8,
            lens: 28,
            pitch: 0,
            roll: 0,
            viewDirection: "look-at-target",
          },
          orbit: { rotate: -42, tilt: 0, distance: 7.5, lens: 35 },
        }],
        selectedCameraId: "shot-01",
        cameraDisplayMode: "ghost",
      },
    },
    {
      id: "target-generator",
      kind: "image-generator",
      title: "Novel View Generator",
      imageGenerator: {
        prompt: "",
        model: "auto",
        aspectRatio: "1:1",
        outputCount: 1,
        status: "idle",
        outputAssetIds: [],
        outputs: [],
      },
    },
  ] as unknown as CanvasNode[];
  const edges = [
    {
      id: "gallery-to-camera",
      sourceId: "source-gallery",
      targetId: "camera-set",
      sourcePortId: "image-output-gallery-output-image",
      targetPortId: "camera-shot-set-input-image",
      kind: "image",
    },
    {
      id: "camera-to-generator",
      sourceId: "camera-set",
      targetId: "target-generator",
      sourcePortId: "camera-shot-set-output-text",
      targetPortId: "image-generator-input-text",
      kind: "text",
    },
  ];

  const context = buildImageGeneratorGraphContext("target-generator", nodes, edges);

  assert.ok(context?.generatorContext.cameraShotSet);
  assert.equal(context.generatorContext.cameraShotSet.source.nodeId, "source-gallery");
  assert.equal(context.generatorContext.cameraShotSet.source.assetId, selectedAssetId);
  assert.equal(context.generatorContext.cameraShotSet.source.imageUrl, "");
  assert.equal(context.executionContext?.target.assetId, selectedAssetId);
  assert.equal(context.generatorContext.cameraShotSet.shots[0]?.orbit?.rotate, -42);
});

test("resolves the selected Generator output for the Multi-Angles preview", () => {
  const selectedAssetId = "55555555-5555-4555-8555-555555555555";
  const generator = {
    id: "source-generator",
    kind: "image-generator",
    title: "Source Generator",
    imageGenerator: {
      prompt: "",
      model: "auto",
      aspectRatio: "1:1",
      outputCount: 1,
      status: "completed",
      outputAssetIds: [selectedAssetId],
      selectedOutputAssetId: selectedAssetId,
      outputs: [{
        assetId: selectedAssetId,
        title: "Selected source",
        prompt: "",
        imageUrl: `/api/assets/${selectedAssetId}/content`,
        width: 1024,
        height: 1024,
      }],
    },
  } as unknown as CanvasNode;

  assert.equal(
    resolveGeneratedNodeOutput(generator, [generator])?.imageUrl,
    `/api/assets/${selectedAssetId}/content`,
  );
});
