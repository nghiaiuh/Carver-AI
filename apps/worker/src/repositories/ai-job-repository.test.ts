import assert from "node:assert/strict";
import test from "node:test";
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
