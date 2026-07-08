/*
 * Flow: Boots the worker process.
 * 1. Create the BullMQ worker instance.
 * 2. Register lifecycle event listeners.
 * 3. Keep process startup separate from job logic.
 */

import { registerAiJobWorkerEvents } from "./queue/events";
import { createAiJobWorker } from "./queue/worker";
import { validateWorkerEnv } from "./config/worker-env";
import { startLibrarySyncScheduler } from "./services/library-sync-service";
import { createSafeLogger } from "@carver/shared";

const logger = createSafeLogger("worker.bootstrap");

validateWorkerEnv();
logger.info("worker starting");
const aiJobWorker = createAiJobWorker();
const stopLibrarySyncScheduler = startLibrarySyncScheduler();

registerAiJobWorkerEvents(aiJobWorker);

logger.info("worker listening for jobs", {
  concurrency: process.env.AI_WORKER_CONCURRENCY ?? 2,
});

void aiJobWorker;

async function shutdown(signal: string) {
  logger.info("worker shutdown requested", { signal });
  stopLibrarySyncScheduler();
  await aiJobWorker.close();
  logger.info("worker shutdown complete", { signal });
  process.exit(0);
}

process.on("SIGTERM", () => {
  void shutdown("SIGTERM");
});

process.on("SIGINT", () => {
  void shutdown("SIGINT");
});
