/*
 * Flow: Registers worker lifecycle events.
 * 1. Listen for completion and failure events.
 * 2. Keep operational logs outside business logic.
 * 3. Make queue startup code easier to read.
 */

import type { Worker } from "@carver/queue";
import type { CarverAiJobPayload } from "@carver/shared";

export const registerAiJobWorkerEvents = (worker: Worker<CarverAiJobPayload>) => {
  worker.on("completed", (job) => {
    console.log(`Job ${job.id} completed`);
  });

  worker.on("failed", (job, error) => {
    console.error(`Job ${job?.id} failed:`, error.message);
  });
};
