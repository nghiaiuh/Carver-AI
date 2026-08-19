import assert from "node:assert/strict";
import test from "node:test";
import type { CanvasCameraShotSetNode, CanvasNode } from "../types/canvas";
import { getCameraShotSetInputPorts, getImageGeneratorInputPorts } from "./canvasNodePorts";
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

test("multi-angles emits every ordered camera shot for downstream generation", () => {
  const prompt = getCameraShotSetPrompt(cameraPlan);

  assert.match(prompt, /MULTI-ANGLES \(2 ordered shots/i);
  assert.match(prompt, /Camera 01/i);
  assert.match(prompt, /Camera 02/i);
  assert.match(prompt, /orbit shot/i);
});

test("image generator receives a connected camera plan as text context", () => {
  const context = buildImageGeneratorGraphContext(
    generator.id,
    [cameraPlan, generator],
    [{
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
