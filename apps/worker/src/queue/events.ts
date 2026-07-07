/*
 * Flow: Registers worker lifecycle events.
 * 1. Listen for completion and failure events.
 * 2. Keep operational logs outside business logic.
 * 3. Make queue startup code easier to read.
 */

import type { Worker } from "@carver/queue";
import type { CarverAiJobPayload } from "@carver/shared";

export const registerAiJobWorkerEvents = (worker: Worker<CarverAiJobPayload>) => {
  worker.on("active", (job) => {
    console.log(
      `[worker] active job=${job.id} project=${job.data.projectId} type=${job.data.jobType}`,
    );
  });

  worker.on("completed", (job) => {
    console.log(
      `[worker] completed job=${job.id} project=${job.data.projectId} type=${job.data.jobType}`,
    );
  });

  worker.on("failed", (job, error) => {
    console.error(
      `[worker] failed job=${job?.id ?? "unknown"} project=${job?.data.projectId ?? "unknown"} type=${job?.data.jobType ?? "unknown"}:`,
      error.message,
    );
  });
};
