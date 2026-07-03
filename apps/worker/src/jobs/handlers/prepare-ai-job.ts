/*
 * Flow: Handles non-image-execution jobs during the transition period.
 * 1. Mark the job as running.
 * 2. Build the canonical preparation result only.
 * 3. Persist prompt/brief metadata without calling the image provider.
 */

import type { CarverAiJobPayload } from "@carver/shared";
import { buildJobError } from "../../mappers/build-job-error";
import { failJob, startJob, succeedJob } from "../../services/job-status-service";
import { prepareGenerationJobResult, prepareGenerationState } from "../../services/generation-service";

export const handlePrepareAiJob = async (job: CarverAiJobPayload) => {
  try {
    await startJob(job.jobId);

    const preparedState = prepareGenerationState(job);
    const preparedResult = prepareGenerationJobResult(preparedState);

    await succeedJob(job.jobId, preparedResult);
  } catch (error) {
    await failJob(job.jobId, buildJobError(error));
    throw error;
  }
};
