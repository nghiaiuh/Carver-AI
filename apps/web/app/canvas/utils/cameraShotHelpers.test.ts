import assert from "node:assert/strict";
import test from "node:test";
import type { CanvasCameraShotSetNode, CanvasNode } from "../types/canvas";
import { getCameraShotSetInputPorts, getImageGeneratorInputPorts } from "./canvasNodePorts";
import { createCameraShotSet, getCameraShotSetPrompt } from "./cameraShotHelpers";
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

test("camera planner emits the first selected shot deterministically for a single run", () => {
  const prompt = getCameraShotSetPrompt(cameraPlan);

  assert.match(prompt, /Left Corner/);
  assert.match(prompt, /three-quarter view from the left-front corner/i);
  assert.doesNotMatch(prompt, /Night Lighting/);
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
  assert.match(context.generatorContext.textReferences[0]?.content ?? "", /Left Corner/);
});
