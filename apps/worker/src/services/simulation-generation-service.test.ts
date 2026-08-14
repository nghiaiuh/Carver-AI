import assert from "node:assert/strict";
import test from "node:test";
import {
  generateSimulatedImage,
  shouldFailAfterPersistedOutput,
  shouldSimulateProviderTimeout,
} from "./simulation-generation-service";

test("post-persist simulation fails exactly once on the first attempt", () => {
  const simulation = { scenario: "fail_after_asset_persisted_once" as const };

  assert.equal(shouldFailAfterPersistedOutput(simulation, 1), true);
  assert.equal(shouldFailAfterPersistedOutput(simulation, 2), false);
  assert.equal(shouldFailAfterPersistedOutput({ scenario: "success" }, 1), false);
  assert.equal(shouldFailAfterPersistedOutput(undefined, 1), false);
});

test("timeout simulation fails only the first attempt so BullMQ can retry", () => {
  const simulation = { scenario: "timeout_then_success" as const };

  assert.equal(shouldSimulateProviderTimeout(simulation, 1), true);
  assert.equal(shouldSimulateProviderTimeout(simulation, 2), false);
  assert.equal(shouldSimulateProviderTimeout({ scenario: "success" }, 1), false);
});

test("image generator simulation creates a valid ratio-compatible image", async () => {
  const image = await generateSimulatedImage({
    job: {
      jobId: "simulation-16-9",
      projectId: "project-1",
      userId: "user-1",
      jobType: "generate_concept",
      executionMode: "text_to_image",
      targetType: "image-generator",
      prompt: "Simulate a landscape concept",
      promptMode: "auto",
      inputSnapshotId: null,
      snapshot: {} as never,
      referenceAssetIds: [],
      inputAssetIds: [],
      aspectRatio: "16:9",
      simulation: { scenario: "success", delayMs: 0 },
    },
    prompt: "Simulate a landscape concept",
    currentAttempt: 1,
  });

  assert.equal(image.mimeType, "image/png");
  assert.equal(image.width, 512);
  assert.equal(image.height, 288);
  assert.equal(image.buffer.length > 8, true);
  assert.deepEqual([...image.buffer.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
});
