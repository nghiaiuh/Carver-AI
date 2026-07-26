/*
 * Flow: Reconciles persisted running jobs with their BullMQ state.
 * 1. A worker crash can leave ai_jobs.running after BullMQ redelivers or fails it.
 * 2. Only mark terminal when the queue no longer has a recoverable state.
 * 3. Never overwrite a job that a new worker has already moved on from.
 */

import { createAiJobQueue } from "@carver/queue";
import { createSafeLogger, notifyOperationalAlert } from "@carver/shared";
import { aiJobRepository } from "../repositories/ai-job-repository";

const logger = createSafeLogger("worker.stalled-reconciliation");
const DEFAULT_INTERVAL_MS = 5 * 60 * 1000;
const DEFAULT_STALE_AFTER_MS = 30 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 25;

const readBoundedNumber = (
  rawValue: string | undefined,
  fallback: number,
  min: number,
  max: number,
) => {
  const value = Number(rawValue ?? fallback);
  return Number.isFinite(value) && value >= min && value <= max ? value : fallback;
};

const getSettings = () => ({
  intervalMs: readBoundedNumber(process.env.AI_JOB_RECONCILIATION_INTERVAL_MS, DEFAULT_INTERVAL_MS, 30_000, 3_600_000),
  staleAfterMs: readBoundedNumber(process.env.AI_JOB_STALLED_AFTER_MS, DEFAULT_STALE_AFTER_MS, 60_000, 86_400_000),
  batchSize: Math.floor(readBoundedNumber(process.env.AI_JOB_RECONCILIATION_BATCH_SIZE, DEFAULT_BATCH_SIZE, 1, 100)),
});

async function reconcileOneJob(job: { id: string; bullJobId: string | null; lastAttemptAt: string | null }) {
  const queue = createAiJobQueue();
  try {
    const queueJob = job.bullJobId ? await queue.getJob(job.bullJobId) : null;
    const queueState = queueJob ? await queueJob.getState() : "missing";

    // A delayed/waiting/active job may be in a legitimate retry or redelivery path.
    if (["active", "waiting", "delayed", "prioritized", "waiting-children"].includes(queueState)) {
      logger.warn("stale db running state still has recoverable queue job", {
        jobId: job.id,
        bullJobId: job.bullJobId,
        queueState,
        lastAttemptAt: job.lastAttemptAt,
      });
      return;
    }

    const errorCode = queueState === "failed" ? "worker_retries_exhausted" : "worker_stalled_job";
    await aiJobRepository.reconcileStalledFailure(job.id, job.bullJobId, {
      errorCode,
      errorMessage: "AI job remained running after its BullMQ execution was no longer recoverable.",
    });

    logger.error("stale ai job reconciled to failed", {
      jobId: job.id,
      bullJobId: job.bullJobId,
      queueState,
      lastAttemptAt: job.lastAttemptAt,
      errorCode,
    });
    void notifyOperationalAlert({
      event: "ai_job_stalled_reconciled",
      severity: "error",
      cooldownKey: `ai_job_stalled_reconciled:${job.id}`,
      metadata: { jobId: job.id, bullJobId: job.bullJobId, queueState, errorCode },
    });
  } finally {
    await queue.close().catch(() => undefined);
  }
}

export function startStalledJobReconciliation() {
  const settings = getSettings();
  let stopped = false;
  let inFlight = false;

  const run = async (trigger: "startup" | "interval") => {
    if (stopped || inFlight) {
      return;
    }

    inFlight = true;
    try {
      const staleJobs = await aiJobRepository.listStaleRunningJobs(
        new Date(Date.now() - settings.staleAfterMs),
        settings.batchSize,
      );

      for (const job of staleJobs) {
        await reconcileOneJob(job);
      }

      if (staleJobs.length > 0) {
        logger.warn("stalled job reconciliation completed", {
          trigger,
          reconciledCandidates: staleJobs.length,
          staleAfterMs: settings.staleAfterMs,
        });
      }
    } catch (error) {
      logger.error("stalled job reconciliation failed", { trigger, error });
      void notifyOperationalAlert({
        event: "ai_job_reconciliation_failed",
        severity: "error",
        metadata: { trigger },
      });
    } finally {
      inFlight = false;
    }
  };

  void run("startup");
  const interval = setInterval(() => void run("interval"), settings.intervalMs);
  logger.info("stalled job reconciliation started", settings);

  return () => {
    stopped = true;
    clearInterval(interval);
  };
}
