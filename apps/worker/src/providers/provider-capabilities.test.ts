import assert from "node:assert/strict";
import test from "node:test";
import {
  FIXTURE_MULTIMODAL_PROVIDER_CAPABILITY,
  OPENAI_IMAGE_PROVIDER_CAPABILITY,
  benchmarkProviderConditioning,
} from "./provider-capabilities";

test("provider benchmark compares identical conditioning without adapter-specific state", () => {
  const results = benchmarkProviderConditioning({
    conditioning: { conditioningHash: "conditioning-hash" },
    orderedRoles: ["authoritative_source", "camera_guide", "uncertainty_guide", "protected_region"],
    candidates: 2,
    providers: [OPENAI_IMAGE_PROVIDER_CAPABILITY, FIXTURE_MULTIMODAL_PROVIDER_CAPABILITY],
  });
  assert.deepEqual(results.map((result) => result.providerId), ["fixture-multimodal", "openai-images"]);
  assert.ok(results.every((result) => result.conditioningHash === "conditioning-hash"));
  assert.equal(results[0]?.supported, false);
  assert.deepEqual(results[0]?.unsupportedRequirements, ["protected_region_mask"]);
  assert.equal(results[1]?.supported, true);
});
