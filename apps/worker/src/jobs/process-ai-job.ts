/*
 * Flow: Dispatches queued jobs to the right handler.
 * 1. Inspect the incoming job type.
 * 2. Route the payload to a job-specific handler.
 * 3. Keep routing logic separate from queue wiring.
 */

import { UnrecoverableError, type Job } from "bullmq";
import { createSafeLogger, notifyOperationalAlert, type QueuedCarverAiJobPayload } from "@carver/shared";
import { handleGenerateConceptJob } from "./handlers/generate-concept";
import { handleRefineConceptJob } from "./handlers/refine-concept";
import {
  failJob,
  recordRetryableFailure,
  startJob,
  succeedJob,
} from "../services/job-status-service";
import { buildJobError, toWorkerError } from "../mappers/build-job-error";
import { aiJobRepository } from "../repositories/ai-job-repository";
import { runGenerationStage } from "../errors/generation-stage-error";

const logger = createSafeLogger("worker.process-ai-job");

const emitTerminalFailureAlert = (
  params: {
    jobId: string;
    bullJobId: string;
    errorCode: string;
    currentAttempt: number;
    maxAttempts: number;
  },
) => {
  const event = params.errorCode.startsWith("storage_")
    ? "r2_generation_failure"
    : params.errorCode.startsWith("provider_")
      ? "openai_generation_failure"
      : "ai_job_failed";

  void notifyOperationalAlert({
    event,
    severity: "error",
    cooldownKey: `${event}:${params.errorCode}`,
    metadata: params,
  });
};

function getAttemptsStarted(job: Job<QueuedCarverAiJobPayload>) {
  const candidate = (job as Job<QueuedCarverAiJobPayload> & { attemptsStarted?: number }).attemptsStarted;
  return typeof candidate === "number" ? candidate : undefined;
}

function getAttemptContext(job: Job<QueuedCarverAiJobPayload>) {
  const maxAttempts = Math.max(1, Number(job.opts.attempts ?? 1));
  const attemptsStarted = getAttemptsStarted(job);
  const currentAttempt =
    typeof attemptsStarted === "number" && attemptsStarted > 0
      ? attemptsStarted
      : job.attemptsMade + 1;

  return {
    maxAttempts,
    currentAttempt,
    isFinalAttempt: currentAttempt >= maxAttempts,
  };
}

export const processAiJob = async (job: Job<QueuedCarverAiJobPayload>) => {
  const bullJobId = String(job.id);
  const attemptContext = getAttemptContext(job);
  let dbJob;

  try {
    dbJob = await aiJobRepository.loadForProcessing(job.data.jobId, bullJobId);
  } catch (error) {
    const mappedError = buildJobError(error);
    logger.error("job load for processing failed", {
      bullJobId,
      jobId: job.data.jobId,
      attemptsMade: job.attemptsMade,
      attemptsStarted: getAttemptsStarted(job) ?? null,
      currentAttempt: attemptContext.currentAttempt,
      maxAttempts: attemptContext.maxAttempts,
      error: mappedError.errorMessage,
      failureStage: mappedError.failureStage,
      providerStatus: mappedError.providerStatus,
      providerCode: mappedError.providerCode,
    });

    if (mappedError.permanent || attemptContext.isFinalAttempt) {
      await failJob(job.data.jobId, {
        bullJobId,
        ...mappedError,
      }).catch(() => undefined);
      emitTerminalFailureAlert({
        jobId: job.data.jobId,
        bullJobId,
        errorCode: mappedError.errorCode,
        currentAttempt: attemptContext.currentAttempt,
        maxAttempts: attemptContext.maxAttempts,
      });
    } else {
      await recordRetryableFailure(job.data.jobId, bullJobId, mappedError).catch(() => undefined);
    }

    if (mappedError.permanent) {
      throw new UnrecoverableError(mappedError.errorMessage);
    }

    throw toWorkerError(error);
  }

  if (dbJob.kind === "missing") {
    logger.info("job skipped before processing", {
      bullJobId,
      jobId: job.data.jobId,
      reason: "missing_db_row",
    });
    return;
  }

  if (dbJob.kind === "terminal") {
    logger.info("job skipped before processing", {
      bullJobId,
      jobId: job.data.jobId,
      reason: "terminal_db_status",
      dbStatus: dbJob.status,
      dbBullJobId: dbJob.bullJobId,
    });
    return;
  }

  const startResult = await startJob(job.data.jobId, bullJobId);
  if (startResult.kind === "terminal") {
    logger.info("job skipped before processing", {
      bullJobId,
      jobId: job.data.jobId,
      reason: "terminal_after_claim",
      dbStatus: startResult.status,
    });
    return;
  }

  if (startResult.kind === "conflict") {
    const conflictMessage = `AI job running conflict for ${job.data.jobId}. Existing bull_job_id=${startResult.bullJobId ?? "null"}, current=${bullJobId}.`;
    logger.error("job claim conflict", {
      bullJobId,
      jobId: job.data.jobId,
      dbStatus: startResult.status,
      dbBullJobId: startResult.bullJobId,
      currentAttempt: attemptContext.currentAttempt,
      maxAttempts: attemptContext.maxAttempts,
    });
    throw new UnrecoverableError(conflictMessage);
  }

  try {
    let completedResult;

    switch (dbJob.payload.jobType) {
      case "generate_concept":
        completedResult = await handleGenerateConceptJob(dbJob.payload, {
          currentAttempt: attemptContext.currentAttempt,
        });
        break;
      case "refine_concept":
        completedResult = await handleRefineConceptJob(dbJob.payload, {
          currentAttempt: attemptContext.currentAttempt,
        });
        break;
      case "analyze_reference":
      case "export":
      default:
        throw new Error(`Unsupported AI job type: ${dbJob.payload.jobType}`);
    }

    await runGenerationStage("job_completion", () => succeedJob(job.data.jobId, bullJobId, completedResult));
  } catch (error) {
    const mappedError = buildJobError(error);
    logger.error("job attempt failed", {
      bullJobId,
      jobId: job.data.jobId,
      dbStatus: "running",
      currentAttempt: attemptContext.currentAttempt,
      maxAttempts: attemptContext.maxAttempts,
      isFinalAttempt: attemptContext.isFinalAttempt,
      permanent: mappedError.permanent,
      errorCode: mappedError.errorCode,
      errorMessage: mappedError.errorMessage,
      failureStage: mappedError.failureStage,
      providerStatus: mappedError.providerStatus,
      providerCode: mappedError.providerCode,
    });

    if (mappedError.permanent || attemptContext.isFinalAttempt) {
      await failJob(job.data.jobId, {
        bullJobId,
        ...mappedError,
      }).catch(() => undefined);
      emitTerminalFailureAlert({
        jobId: job.data.jobId,
        bullJobId,
        errorCode: mappedError.errorCode,
        currentAttempt: attemptContext.currentAttempt,
        maxAttempts: attemptContext.maxAttempts,
      });
    } else {
      await recordRetryableFailure(job.data.jobId, bullJobId, mappedError).catch(() => undefined);
    }

    if (mappedError.permanent) {
      throw new UnrecoverableError(mappedError.errorMessage);
    }

    throw toWorkerError(error);
  }
};
