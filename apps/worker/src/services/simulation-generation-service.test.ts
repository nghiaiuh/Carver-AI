import assert from "node:assert/strict";
import test from "node:test";
import {
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
