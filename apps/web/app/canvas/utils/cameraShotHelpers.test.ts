import assert from "node:assert/strict";
import test from "node:test";
import type { CanvasCameraShotSetNode, CanvasNode } from "../types/canvas";
import {
  getCameraShotSetInputPorts,
  getImageGeneratorInputPorts,
  getNodePortDefinitions,
  resolveTargetPortIdForEdge,
} from "./canvasNodePorts";
import { areCameraShotSetStatesEqual, createCameraShotSet, getCameraShotSetPrompt } from "./cameraShotHelpers";
import { buildImageGeneratorGraphContext } from "./imageGeneratorGraphContext";

const cameraPlan: CanvasCameraShotSetNode = {
  id: "camera-plan",
  kind: "camera-shot-set",
  x: 20,
  y: 40,
  width: 320,
  height: 260,
  imageUrl: "",
  title: "Camera Shot Set #1",
  prompt: null,
  role: "reference",
  inputPorts: getCameraShotSetInputPorts(),
  cameraShotSet: createCameraShotSet(["left-corner", "night-lighting"]),
};

const generator: CanvasNode = {
  id: "generator",
  kind: "image-generator",
  x: 420,
  y: 40,
  width: 540,
  height: 420,
  imageUrl: "",
  title: "Image Generator #1",
  prompt: null,
  role: "generator",
  inputPorts: getImageGeneratorInputPorts(),
  imageGenerator: {
    prompt: "Render the koi garden concept.",
    model: "auto",
    aspectRatio: "1:1",
    outputCount: 1,
    status: "idle",
    outputAssetIds: [],
    outputs: [],
  },
};

const sourceImage: CanvasNode = {
  id: "source-image",
  kind: "image",
  x: 0,
  y: 0,
  width: 240,
  height: 180,
  imageUrl: "/api/assets/11111111-1111-4111-8111-111111111111/content",
  title: "Source garden",
  prompt: null,
  role: "layout",
  inputPorts: [],
  sourceImage: {
    assetId: "11111111-1111-4111-8111-111111111111",
    url: "/api/assets/11111111-1111-4111-8111-111111111111/content",
    width: 240,
    height: 180,
    quality: "original",
  },
};

test("multi-angles emits every ordered camera shot for downstream generation", () => {
  const prompt = getCameraShotSetPrompt(cameraPlan);

  assert.match(prompt, /MULTI-ANGLES \(2 ordered shots/i);
  assert.match(prompt, /Camera 01/i);
  assert.match(prompt, /Camera 02/i);
  assert.match(prompt, /orbit shot/i);
});

test("multi-angle card uses the shared image-input and text-output port schema", () => {
  assert.deepEqual(
    getNodePortDefinitions(cameraPlan).map(({ id, direction, kind, side }) => ({ id, direction, kind, side })),
    [
      { id: "camera-shot-set-input-image", direction: "input", kind: "image", side: "left" },
      { id: "camera-shot-set-output-text", direction: "output", kind: "text", side: "right" },
    ],
  );
});

test("legacy image edges resolve to the multi-angle card's backward-facing image input", () => {
  assert.equal(
    resolveTargetPortIdForEdge({
      node: cameraPlan,
      targetPortId: "port-img-0",
      kind: "image",
    }),
    "camera-shot-set-input-image",
  );
});

test("plan camera prompt includes camera origin, target, and roll", () => {
  const planNode = {
    ...cameraPlan,
    cameraShotSet: {
      ...cameraPlan.cameraShotSet,
      mode: "plan" as const,
      cameras: cameraPlan.cameraShotSet.cameras.map((camera) => ({
        ...camera,
        plan: { ...camera.plan, targetHeight: 0.8, roll: 12 },
      })),
    },
  };
  const prompt = getCameraShotSetPrompt(planNode);

  assert.match(prompt, /normalized position/i);
  assert.match(prompt, /roll 12°/i);
  assert.match(prompt, /target .* elevation 0\.8 m/i);
});

test("image generator receives a connected camera plan as text context", () => {
  const context = buildImageGeneratorGraphContext(
    generator.id,
    [sourceImage, cameraPlan, generator],
    [{
      id: "source-to-camera",
      sourceId: sourceImage.id,
      targetId: cameraPlan.id,
      targetPortId: "camera-shot-set-input-image",
      sourcePortId: "image-output",
    }, {
      id: "camera-to-generator",
      sourceId: cameraPlan.id,
      targetId: generator.id,
      sourcePortId: "camera-shot-set-output-text",
    }],
  );

  assert.ok(context);
  assert.equal(context.generatorContext.textReferences.length, 1);
  assert.equal(context.generatorContext.textReferences[0]?.title, "Camera Shot Set #1");
  assert.match(context.generatorContext.textReferences[0]?.content ?? "", /MULTI-ANGLES/);
  assert.equal(context.generatorContext.textReferences[0]?.sourceKind, "camera-shot-set");
  assert.equal(context.generatorContext.cameraShotSet?.source.assetId, sourceImage.sourceImage?.assetId);
  assert.equal(context.generatorContext.cameraShotSet?.shots.length, 2);
  assert.equal(context.executionContext?.target.nodeId, sourceImage.id);
});

test("camera shot state equality ignores reconstructed but unchanged pointer updates", () => {
  const state = createCameraShotSet(["eye-level"]);
  const reconstructed = {
    ...state,
    cameras: state.cameras.map((camera) => ({
      ...camera,
      plan: { ...camera.plan },
      orbit: { ...camera.orbit },
    })),
  };

  assert.equal(areCameraShotSetStatesEqual(state, reconstructed), true);
  assert.equal(
    areCameraShotSetStatesEqual(state, {
      ...reconstructed,
      cameras: reconstructed.cameras.map((camera) => ({
        ...camera,
        plan: { ...camera.plan, u: camera.plan.u + 0.01 },
      })),
    }),
    false,
  );
});
