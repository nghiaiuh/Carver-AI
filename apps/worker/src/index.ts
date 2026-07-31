/*
 * Flow: Boots the worker process.
 * 1. Create the BullMQ worker instance.
 * 2. Register lifecycle event listeners.
 * 3. Keep process startup separate from job logic.
 */

import { registerAiJobWorkerEvents } from "./queue/events";
import { createAiJobWorker } from "./queue/worker";
import { validateWorkerEnv } from "./config/worker-env";
import { loadWorkerEnvFiles } from "./config/load-worker-env";
import { startLibrarySyncScheduler } from "./services/library-sync-service";
import { startR2OrphanCleanupScheduler } from "./services/r2-orphan-cleanup-service";
import { startStalledJobReconciliation } from "./services/stalled-job-reconciliation";
import { startWorkerHealthServer } from "./operations/health-server";
import { createGracefulShutdownCoordinator } from "./operations/graceful-shutdown";
import { createSafeLogger } from "@carver/shared";
import { describeRedisConnection } from "@carver/queue";

const logger = createSafeLogger("worker.bootstrap");

const loadedEnvFiles = loadWorkerEnvFiles();
if (loadedEnvFiles.length > 0) {
  logger.info("worker loaded env files", { files: loadedEnvFiles });
}

validateWorkerEnv();
logger.info("worker starting");
logger.info("worker redis connection", describeRedisConnection());
const aiJobWorker = createAiJobWorker();
const stopLibrarySyncScheduler = startLibrarySyncScheduler();
const stopR2OrphanCleanupScheduler = startR2OrphanCleanupScheduler();
const stopStalledJobReconciliation = startStalledJobReconciliation();
const healthServer = startWorkerHealthServer();

const stopWorkerEvents = registerAiJobWorkerEvents(aiJobWorker);

logger.info("worker listening for jobs", {
  concurrency: process.env.AI_WORKER_CONCURRENCY ?? 2,
});

void aiJobWorker;

const shutdown = createGracefulShutdownCoordinator({
  worker: aiJobWorker,
  healthServer,
  stopLibrarySyncScheduler,
  stopR2OrphanCleanupScheduler,
  stopStalledJobReconciliation,
  stopWorkerEvents,
  timeoutMs: Number(process.env.WORKER_SHUTDOWN_TIMEOUT_MS ?? 30_000),
  onTimeout: () => {
    logger.error("worker shutdown timed out");
    // Railway will restart this process. After the deadline, preserving a
    // stuck process is less safe than returning its BullMQ work to the queue.
    process.exit(1);
  },
});

const handleShutdownSignal = (signal: "SIGTERM" | "SIGINT") => {
  logger.info("worker shutdown requested", { signal });
  void shutdown().then(() => {
    logger.info("worker shutdown complete", { signal });
  }).catch((error) => {
    logger.error("worker shutdown failed", { signal, error });
    process.exit(1);
  });
};

process.on("SIGTERM", () => handleShutdownSignal("SIGTERM"));
process.on("SIGINT", () => handleShutdownSignal("SIGINT"));
