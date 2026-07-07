/*
 * Flow: Registers worker lifecycle events.
 * 1. Listen for completion and failure events.
 * 2. Keep operational logs outside business logic.
 * 3. Make queue startup code easier to read.
 */

import type { Worker } from "@carver/queue";
import { createSafeLogger, type QueuedCarverAiJobPayload } from "@carver/shared";

const logger = createSafeLogger("worker.ai-jobs");

export const registerAiJobWorkerEvents = (worker: Worker<QueuedCarverAiJobPayload>) => {
  worker.on("active", (job) => {
    logger.info("job active", { bullJobId: job.id, jobId: job.data.jobId });
  });

  worker.on("completed", (job) => {
    logger.info("job completed", { bullJobId: job.id, jobId: job.data.jobId });
  });

  worker.on("failed", (job, error) => {
    logger.error("job failed", {
      bullJobId: job?.id ?? "unknown",
      jobId: job?.data.jobId ?? "unknown",
      error,
    });
  });
};
