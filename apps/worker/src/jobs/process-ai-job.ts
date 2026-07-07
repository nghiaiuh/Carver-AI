/*
 * Flow: Dispatches queued jobs to the right handler.
 * 1. Inspect the incoming job type.
 * 2. Route the payload to a job-specific handler.
 * 3. Keep routing logic separate from queue wiring.
 */

import type { Job } from "bullmq";
import type { QueuedCarverAiJobPayload } from "@carver/shared";
import { handleGenerateConceptJob } from "./handlers/generate-concept";
import { handleRefineConceptJob } from "./handlers/refine-concept";
import { failJob } from "../services/job-status-service";
import { buildJobError } from "../mappers/build-job-error";
import { aiJobRepository } from "../repositories/ai-job-repository";

export const processAiJob = async (job: Job<QueuedCarverAiJobPayload>) => {
  const dbJob = await aiJobRepository.loadForProcessing(job.data.jobId);

  if (!dbJob) {
    return;
  }

  switch (dbJob.jobType) {
    case "generate_concept":
      return handleGenerateConceptJob(dbJob);
    case "refine_concept":
      return handleRefineConceptJob(dbJob);
    case "analyze_reference":
    case "export":
    default: {
      const error = new Error(`Unsupported AI job type: ${dbJob.jobType}`);
      await failJob(job.data.jobId, buildJobError(error));
      throw error;
    }
  }
};
