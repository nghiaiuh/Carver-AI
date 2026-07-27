import assert from "node:assert/strict";
import test from "node:test";
import { getStalledJobReconciliationDecision } from "./stalled-job-reconciliation";

test("reconciliation leaves recoverable BullMQ retry states running", () => {
  for (const state of ["active", "waiting", "delayed", "prioritized", "waiting-children"] as const) {
    assert.deepEqual(getStalledJobReconciliationDecision(state), {
      action: "keep_running",
      errorCode: null,
    });
  }
});

test("reconciliation terminalizes only failed or missing queue executions", () => {
  assert.deepEqual(getStalledJobReconciliationDecision("failed"), {
    action: "mark_failed",
    errorCode: "worker_retries_exhausted",
  });
  assert.deepEqual(getStalledJobReconciliationDecision("missing"), {
    action: "mark_failed",
    errorCode: "worker_stalled_job",
  });
  assert.deepEqual(getStalledJobReconciliationDecision("completed"), {
    action: "mark_failed",
    errorCode: "worker_stalled_job",
  });
});
