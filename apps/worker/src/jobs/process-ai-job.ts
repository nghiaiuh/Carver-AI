/*
 * Flow: Dispatches queued jobs to the right handler.
 * 1. Inspect the incoming job type.
 * 2. Route the payload to a job-specific handler.
 * 3. Keep routing logic separate from queue wiring.
 */

import type { Job } from "bullmq";
import type { CarverAiJobPayload } from "@carver/shared";
import { handleGenerateConceptJob } from "./handlers/generate-concept";

export const processAiJob = async (job: Job<CarverAiJobPayload>) => {
  switch (job.data.jobType) {
    case "generate_concept":
    case "refine_concept":
    case "analyze_reference":
    case "export":
    default:
      return handleGenerateConceptJob(job.data);
  }
};
