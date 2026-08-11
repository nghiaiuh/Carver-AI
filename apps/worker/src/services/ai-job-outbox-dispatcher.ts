/*
 * Moves durable DB outbox commands into BullMQ. The database transaction owns
 * job creation; this dispatcher owns the retryable Redis side effect.
 */

import { getSupabaseAdmin } from "@carver/db/server";
import { AI_JOB_QUEUE_EVENT_NAME, createAiJobQueue } from "@carver/queue";
import { createSafeLogger, notifyOperationalAlert, type QueuedCarverAiJobPayload } from "@carver/shared";
import { MaintenanceLeaseError, type RunWithMaintenanceLease } from "./maintenance-lease";

const logger = createSafeLogger("worker.ai-job-outbox");
const DEFAULT_INTERVAL_MS = 1_000;
const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_LEASE_SECONDS = 60;
const DEFAULT_DISPATCH_TIMEOUT_MS = 10_000;

type OutboxRow = {
  id: string;
  ai_job_id: string;
  payload: unknown;
  attempts: number;
};

type OutboxRpcClient = {
  rpc: (name: string, args: Record<string, unknown>) => Promise<{
    data: unknown;
    error: { code?: string | null; message: string } | null;
  }>;
};

class OutboxDispatcherError extends Error {
  constructor(
    readonly failureCode: "AI_JOB_OUTBOX_CLAIM_FAILED" | "AI_JOB_OUTBOX_MARK_DISPATCHED_FAILED",
    readonly databaseCode: string | null = null,
  ) {
    super(failureCode);
  }
}

const getFailureDetails = (error: unknown) => {
  if (error instanceof MaintenanceLeaseError || error instanceof OutboxDispatcherError) {
    return {
      failureCode: error.failureCode,
      databaseCode: error.databaseCode,
    };
  }

  return {
    failureCode: "AI_JOB_OUTBOX_DISPATCHER_FAILED",
    databaseCode: null,
  };
};

const readBoundedInteger = (raw: string | undefined, fallback: number, min: number, max: number) => {
  const value = Number(raw ?? fallback);
  return Number.isInteger(value) && value >= min && value <= max ? value : fallback;
};

const getSettings = () => ({
  intervalMs: readBoundedInteger(process.env.AI_JOB_OUTBOX_INTERVAL_MS, DEFAULT_INTERVAL_MS, 250, 60_000),
  batchSize: readBoundedInteger(process.env.AI_JOB_OUTBOX_BATCH_SIZE, DEFAULT_BATCH_SIZE, 1, 100),
  leaseSeconds: readBoundedInteger(process.env.AI_JOB_OUTBOX_LEASE_SECONDS, DEFAULT_LEASE_SECONDS, 10, 600),
  maxBackoffSeconds: readBoundedInteger(process.env.AI_JOB_OUTBOX_MAX_BACKOFF_SECONDS, 300, 5, 3_600),
  dispatchTimeoutMs: readBoundedInteger(
    process.env.AI_JOB_OUTBOX_DISPATCH_TIMEOUT_MS,
    DEFAULT_DISPATCH_TIMEOUT_MS,
    1_000,
    60_000,
  ),
});

export const getOutboxRetryDelaySeconds = (attempts: number, maxBackoffSeconds = 300) =>
  Math.min(maxBackoffSeconds, Math.max(1, 2 ** Math.min(Math.max(0, attempts), 8)));

export async function withOutboxOperationTimeout<T>(operation: Promise<T>, timeoutMs: number) {
  let timeout: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      operation,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new Error("AI_JOB_OUTBOX_DISPATCH_TIMEOUT")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

const toQueuedPayload = (row: OutboxRow): QueuedCarverAiJobPayload => {
  if (!row.payload || typeof row.payload !== "object" || Array.isArray(row.payload)) {
    throw new Error("AI_JOB_OUTBOX_PAYLOAD_INVALID");
  }

  const payload = row.payload as Partial<QueuedCarverAiJobPayload>;
  if (payload.jobId !== row.ai_job_id) {
    throw new Error("AI_JOB_OUTBOX_JOB_MISMATCH");
  }

  return { jobId: row.ai_job_id };
};

export function startAiJobOutboxDispatcher(params: {
  dispatcherId: string;
  runWithLease?: RunWithMaintenanceLease;
}): () => void {
  const settings = getSettings();
  const client = getSupabaseAdmin() as unknown as OutboxRpcClient;
  let stopped = false;
  let inFlight = false;

  const dispatch = async (trigger: "startup" | "interval") => {
    if (stopped || inFlight) return;
    inFlight = true;

    const execute = async () => {
      const { data, error } = await client.rpc("claim_ai_job_outbox", {
        target_dispatcher_id: params.dispatcherId,
        target_batch_size: settings.batchSize,
        target_lease_seconds: settings.leaseSeconds,
      });
      if (error) {
        throw new OutboxDispatcherError("AI_JOB_OUTBOX_CLAIM_FAILED", error.code ?? null);
      }

      const rows = Array.isArray(data) ? (data as OutboxRow[]) : [];
      if (rows.length === 0) return;

      const queue = createAiJobQueue();
      try {
        for (const row of rows) {
          try {
            const payload = toQueuedPayload(row);
            const queuedJob = await withOutboxOperationTimeout(
              queue.add(AI_JOB_QUEUE_EVENT_NAME, payload, {
                jobId: row.ai_job_id,
              }),
              settings.dispatchTimeoutMs,
            );
            const { data: marked, error: markError } = await client.rpc("mark_ai_job_outbox_dispatched", {
              target_outbox_id: row.id,
              target_dispatcher_id: params.dispatcherId,
              target_bull_job_id: String(queuedJob.id),
            });
            if (markError || !marked) {
              throw new OutboxDispatcherError(
                "AI_JOB_OUTBOX_MARK_DISPATCHED_FAILED",
                markError?.code ?? null,
              );
            }
            logger.info("AI job outbox dispatched", {
              trigger,
              aiJobId: row.ai_job_id,
              bullJobId: queuedJob.id,
              attempts: row.attempts,
            });
          } catch (error) {
            const retryAfterSeconds = getOutboxRetryDelaySeconds(row.attempts, settings.maxBackoffSeconds);
            const failure = getFailureDetails(error);
            const { error: releaseError } = await client.rpc("release_ai_job_outbox_for_retry", {
              target_outbox_id: row.id,
              target_dispatcher_id: params.dispatcherId,
              target_error_code: "queue_dispatch_failed",
              target_error_message: "Unable to dispatch this AI job to the queue.",
              target_retry_after_seconds: retryAfterSeconds,
            });
            logger.error("AI job outbox dispatch failed", {
              trigger,
              aiJobId: row.ai_job_id,
              attempts: row.attempts,
              retryAfterSeconds,
              failureCode: failure.failureCode,
              databaseCode: failure.databaseCode,
              releaseErrorCode: releaseError?.code ?? null,
            });
            void notifyOperationalAlert({
              event: "ai_job_outbox_dispatch_failed",
              severity: "error",
              cooldownKey: `ai_job_outbox_dispatch_failed:${row.ai_job_id}`,
              metadata: { aiJobId: row.ai_job_id, attempts: row.attempts, retryAfterSeconds },
            });
          }
        }
      } finally {
        await withOutboxOperationTimeout(queue.close(), 2_000).catch(async () => {
          await queue.disconnect().catch(() => undefined);
        });
      }
    };

    try {
      if (params.runWithLease) {
        await params.runWithLease("ai-job-outbox-dispatch", execute);
      } else {
        await execute();
      }
    } catch (error) {
      const failure = getFailureDetails(error);
      logger.error("AI job outbox dispatcher failed", {
        trigger,
        failureCode: failure.failureCode,
        databaseCode: failure.databaseCode,
        error,
      });
      void notifyOperationalAlert({
        event: "ai_job_outbox_dispatcher_failed",
        severity: "error",
        metadata: { trigger, failureCode: failure.failureCode, databaseCode: failure.databaseCode },
      });
    } finally {
      inFlight = false;
    }
  };

  void dispatch("startup");
  const interval = setInterval(() => void dispatch("interval"), settings.intervalMs);
  logger.info("AI job outbox dispatcher started", settings);

  return () => {
    stopped = true;
    clearInterval(interval);
  };
}
