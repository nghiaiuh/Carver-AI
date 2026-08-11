import assert from "node:assert/strict";
import test from "node:test";
import {
  getOutboxRetryDelaySeconds,
  withOutboxOperationTimeout,
} from "./ai-job-outbox-dispatcher";

test("outbox dispatch retry backoff is bounded and increases per failed dispatch", () => {
  assert.equal(getOutboxRetryDelaySeconds(0), 1);
  assert.equal(getOutboxRetryDelaySeconds(1), 2);
  assert.equal(getOutboxRetryDelaySeconds(5), 32);
  assert.equal(getOutboxRetryDelaySeconds(20, 60), 60);
});

test("outbox dispatch operations time out instead of holding a claimed row forever", async () => {
  await assert.rejects(
    withOutboxOperationTimeout(new Promise<never>(() => undefined), 10),
    /AI_JOB_OUTBOX_DISPATCH_TIMEOUT/,
  );
});
