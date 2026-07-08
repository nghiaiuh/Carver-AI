/*
 * Flow: Dispatches queued jobs to the right handler.
 * 1. Inspect the incoming job type.
 * 2. Route the payload to a job-specific handler.
 * 3. Keep routing logic separate from queue wiring.
 */

import type { Job } from "bullmq";
import { createSafeLogger, type QueuedCarverAiJobPayload } from "@carver/shared";
import { handleGenerateConceptJob } from "./handlers/generate-concept";
import { handleRefineConceptJob } from "./handlers/refine-concept";
import { failJob } from "../services/job-status-service";
import { buildJobError } from "../mappers/build-job-error";
import { aiJobRepository } from "../repositories/ai-job-repository";

const logger = createSafeLogger("worker.process-ai-job");

export const processAiJob = async (job: Job<QueuedCarverAiJobPayload>) => {
  let dbJob;

  try {
    dbJob = await aiJobRepository.loadForProcessing(job.data.jobId);
  } catch (error) {
    const mappedError = buildJobError(error);
    logger.error("job load for processing failed", {
      bullJobId: job.id,
      jobId: job.data.jobId,
      error: mappedError.errorMessage,
    });
    await failJob(job.data.jobId, mappedError).catch(() => undefined);
    throw error;
  }

  if (!dbJob) {
    logger.info("job skipped before processing", {
      bullJobId: job.id,
      jobId: job.data.jobId,
    });
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
