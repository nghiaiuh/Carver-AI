import assert from "node:assert/strict";
import test from "node:test";
import {
  createGracefulShutdownCoordinator,
  WorkerShutdownTimeoutError,
} from "./graceful-shutdown";

test("graceful shutdown drains active work once and closes resources in order", async () => {
  const calls: string[] = [];
  const shutdown = createGracefulShutdownCoordinator({
    worker: {
      pause: async () => {
        calls.push("worker.pause");
      },
      close: async () => {
        calls.push("worker.close");
      },
    },
    healthServer: {
      markShuttingDown: () => {
        calls.push("health.markShuttingDown");
      },
      close: async () => {
        calls.push("health.close");
      },
    },
    stopAiJobOutboxDispatcher: () => {
      calls.push("outbox.stop");
    },
    stopLibrarySyncScheduler: () => {
      calls.push("library.stop");
    },
    stopR2OrphanCleanupScheduler: () => {
      calls.push("orphan-cleanup.stop");
    },
    stopStalledJobReconciliation: () => {
      calls.push("reconciliation.stop");
    },
    stopWorkerEvents: async () => {
      calls.push("events.close");
    },
    timeoutMs: 1_000,
    onTimeout: () => {
      calls.push("timeout");
    },
  });

  const first = shutdown();
  const second = shutdown();
  assert.equal(first, second);
  await first;

  assert.deepEqual(calls, [
    "health.markShuttingDown",
    "outbox.stop",
    "library.stop",
    "orphan-cleanup.stop",
    "reconciliation.stop",
    "worker.pause",
    "events.close",
    "health.close",
    "worker.close",
  ]);
});

test("maintenance-only shutdown closes health resources without a generation worker", async () => {
  const calls: string[] = [];
  const shutdown = createGracefulShutdownCoordinator({
    healthServer: {
      markShuttingDown: () => calls.push("health.markShuttingDown"),
      close: async () => {
        calls.push("health.close");
      },
    },
    stopAiJobOutboxDispatcher: () => calls.push("outbox.stop"),
    stopLibrarySyncScheduler: () => calls.push("library.stop"),
    stopStalledJobReconciliation: () => calls.push("reconciliation.stop"),
    timeoutMs: 1_000,
    onTimeout: () => undefined,
  });

  await shutdown();
  assert.deepEqual(calls, [
    "health.markShuttingDown",
    "outbox.stop",
    "library.stop",
    "reconciliation.stop",
    "health.close",
  ]);
});

test("graceful shutdown surfaces a bounded timeout instead of hanging forever", async () => {
  let timeoutCount = 0;
  const shutdown = createGracefulShutdownCoordinator({
    worker: {
      pause: () => new Promise<void>(() => undefined),
      close: async () => undefined,
    },
    healthServer: {
      markShuttingDown: () => undefined,
      close: async () => undefined,
    },
    stopLibrarySyncScheduler: () => undefined,
    stopStalledJobReconciliation: () => undefined,
    timeoutMs: 15,
    onTimeout: () => {
      timeoutCount += 1;
    },
  });

  await assert.rejects(shutdown(), WorkerShutdownTimeoutError);
  assert.equal(timeoutCount, 1);
});
