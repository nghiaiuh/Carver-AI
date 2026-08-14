/*
 * Flow: Registers worker lifecycle events.
 * 1. Listen for completion and failure events.
 * 2. Keep operational logs outside business logic.
 * 3. Make queue startup code easier to read.
 */

import {
  AI_JOB_QUEUE_NAME,
  QueueEvents,
  getDefaultQueueOptions,
  type Worker,
} from "@carver/queue";
import { createSafeLogger, notifyOperationalAlert, type QueuedCarverAiJobPayload } from "@carver/shared";
import { reconcileExhaustedFailure } from "../services/job-status-service";

const logger = createSafeLogger("worker.ai-jobs");

const getQueueWaitAlertThresholdMs = () => {
  const threshold = Number(process.env.AI_JOB_QUEUE_WAIT_ALERT_MS ?? 120_000);
  return Number.isFinite(threshold) && threshold >= 10_000 ? threshold : 120_000;
};

function getAttemptsStarted(job: unknown) {
  const candidate = job as { attemptsStarted?: number };
  return typeof candidate.attemptsStarted === "number" ? candidate.attemptsStarted : null;
}

export const registerAiJobWorkerEvents = (worker: Worker<QueuedCarverAiJobPayload>) => {
  const queueEvents = new QueueEvents(AI_JOB_QUEUE_NAME, {
    connection: getDefaultQueueOptions().connection,
  });

  worker.on("active", (job) => {
    const queueWaitMs = Math.max(0, Date.now() - job.timestamp);
    logger.info("job active", {
      bullJobId: job.id,
      jobId: job.data.jobId,
      attemptsMade: job.attemptsMade,
      attemptsStarted: getAttemptsStarted(job),
      maxAttempts: job.opts.attempts ?? 1,
      queueWaitMs,
    });

    if (queueWaitMs >= getQueueWaitAlertThresholdMs()) {
      void notifyOperationalAlert({
        event: "ai_job_queue_wait_high",
        severity: "warning",
        cooldownKey: "ai_job_queue_wait_high",
        metadata: { jobId: job.data.jobId, bullJobId: job.id, queueWaitMs },
      });
    }
  });

  worker.on("completed", (job) => {
    logger.info("job completed", {
      bullJobId: job.id,
      jobId: job.data.jobId,
      attemptsMade: job.attemptsMade,
      attemptsStarted: getAttemptsStarted(job),
      maxAttempts: job.opts.attempts ?? 1,
    });
  });

  worker.on("failed", (job, error) => {
    logger.error("job failed", {
      bullJobId: job?.id ?? "unknown",
      jobId: job?.data.jobId ?? "unknown",
      attemptsMade: job?.attemptsMade ?? null,
      attemptsStarted: job ? getAttemptsStarted(job) : null,
      maxAttempts: job?.opts.attempts ?? 1,
      error,
    });
  });

  worker.on("stalled", (jobId, prev) => {
    logger.error("job stalled", {
      bullJobId: jobId,
      previousState: prev,
    });
    void notifyOperationalAlert({
      event: "ai_job_stalled",
      severity: "error",
      cooldownKey: `ai_job_stalled:${jobId}`,
      metadata: { bullJobId: jobId, previousState: prev },
    });
  });

  (queueEvents as any).on("retries-exhausted", async (payload: unknown) => {
    const event = payload as {
      jobId?: string;
      attemptsMade?: number;
    };

    if (!event.jobId) {
      return;
    }

    logger.error("job retries exhausted", {
      bullJobId: event.jobId,
      attemptsMade: event.attemptsMade ?? null,
    });

    await reconcileExhaustedFailure(event.jobId, event.jobId, {
      errorCode: "worker_retry_exhausted",
      errorMessage: "BullMQ exhausted all retry attempts before the job reached a terminal DB state.",
    }).catch((error) => {
      logger.error("job retries exhausted reconciliation failed", {
        bullJobId: event.jobId,
        attemptsMade: event.attemptsMade ?? null,
        error,
      });
    });
  });

  return async () => {
    await queueEvents.close().catch(() => undefined);
  };
};
