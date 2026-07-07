/*
 * Flow: Dispatches queued jobs to the right handler.
 * 1. Inspect the incoming job type.
 * 2. Route the payload to a job-specific handler.
 * 3. Keep routing logic separate from queue wiring.
 */

import type { Job } from "bullmq";
import type { CarverAiJobPayload } from "@carver/shared";
import { handleGenerateConceptJob } from "./handlers/generate-concept";
import { handleRefineConceptJob } from "./handlers/refine-concept";
import { failJob } from "../services/job-status-service";
import { buildJobError } from "../mappers/build-job-error";

export const processAiJob = async (job: Job<CarverAiJobPayload>) => {
  switch (job.data.jobType) {
    case "generate_concept":
      return handleGenerateConceptJob(job.data);
    case "refine_concept":
      return handleRefineConceptJob(job.data);
    case "analyze_reference":
    case "export":
    default: {
      const error = new Error(`Unsupported AI job type: ${job.data.jobType}`);
      await failJob(job.data.jobId, buildJobError(error));
      throw error;
    }
  }
};
