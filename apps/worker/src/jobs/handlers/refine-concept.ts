/*
 * Flow: Handles refine jobs that now share the same image execution pipeline as generate jobs.
 * 1. Mark the job as running.
 * 2. Build the canonical prompt/brief state.
 * 3. Execute the provider pipeline and persist the result.
 */

import type { CarverAiJobPayload } from "@carver/shared";
import { buildJobError } from "../../mappers/build-job-error";
import { failJob, startJob, succeedJob } from "../../services/job-status-service";
import { executeGeneratedImageJob, prepareGenerationState } from "../../services/generation-service";

export const handleRefineConceptJob = async (job: CarverAiJobPayload) => {
  try {
    await startJob(job.jobId);

    const preparedState = prepareGenerationState(job);
    const completedResult = await executeGeneratedImageJob(job, preparedState);

    await succeedJob(job.jobId, completedResult);
  } catch (error) {
    await failJob(job.jobId, buildJobError(error));
    throw error;
  }
};
