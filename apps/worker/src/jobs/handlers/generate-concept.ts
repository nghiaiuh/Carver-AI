/*
 * Flow: Handles the current generation preparation path.
 * 1. Mark the job as running.
 * 2. Build the snapshot-aware brief and compiled prompt metadata.
 * 3. Store the result or mark the job as failed.
 *
 * Phase 1 note:
 * This handler intentionally keeps the old behavior and is reused for
 * other job types until dedicated handlers are introduced.
 */

import type { CarverAiJobPayload } from "@carver/shared";
import { failJob, startJob, succeedJob } from "../../services/job-status-service";
import { prepareGenerationJobResult } from "../../services/generation-service";

export const handleGenerateConceptJob = async (job: CarverAiJobPayload) => {
  try {
    await startJob(job.jobId);

    const preparedResult = prepareGenerationJobResult(job);

    await succeedJob(job.jobId, preparedResult);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown worker failure";
    await failJob(job.jobId, {
      errorCode: "worker_processing_failed",
      errorMessage: message,
    });

    throw error;
  }
};
