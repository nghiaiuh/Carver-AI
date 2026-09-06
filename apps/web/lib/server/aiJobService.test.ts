import assert from "node:assert/strict";
import test from "node:test";

import { buildTerminalRetryIdentity } from "./aiJobRetryIdentity";

test("a terminal rerun has a stable job and credit identity for duplicate clicks", () => {
  const baseKey = "x".repeat(128);
  const failedJobId = "11111111-1111-4111-8111-111111111111";
  const first = buildTerminalRetryIdentity({ baseKey, previousJobId: failedJobId });
  const repeatedClick = buildTerminalRetryIdentity({ baseKey, previousJobId: failedJobId });

  assert.deepEqual(repeatedClick, first);
  assert.ok(first.idempotencyKey.length <= 128);
  assert.ok(first.creditIdempotencyKey.length <= 128);
  assert.match(first.creditIdempotencyKey, /^generation:retry-/);
});

test("a later terminal retry has a distinct job and credit identity", () => {
  const baseKey = "canvas-request-key";
  const first = buildTerminalRetryIdentity({
    baseKey,
    previousJobId: "11111111-1111-4111-8111-111111111111",
  });
  const afterAnotherFailure = buildTerminalRetryIdentity({
    baseKey,
    previousJobId: "22222222-2222-4222-8222-222222222222",
  });

  assert.notEqual(afterAnotherFailure.idempotencyKey, first.idempotencyKey);
  assert.notEqual(afterAnotherFailure.creditIdempotencyKey, first.creditIdempotencyKey);
  assert.equal(afterAnotherFailure.familyPrefix, first.familyPrefix);
});
