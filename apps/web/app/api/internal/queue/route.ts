import { createAiJobQueue } from "@carver/queue";
import { apiFailure, apiSuccess } from "../../_lib/http";
import { getRequestContext } from "../../_lib/auth";
import { isInternalAdminUser } from "../../../../lib/server/internalAccess";
import { createSafeLogger } from "@carver/shared";

export const dynamic = "force-dynamic";

const logger = createSafeLogger("web.internal.queue");
const STATES = ["waiting", "active", "delayed", "failed"] as const;

export async function GET(request: Request) {
  const context = await getRequestContext(request);
  if ("error" in context) {
    return context.error;
  }

  if (!isInternalAdminUser(context.user.id)) {
    return apiFailure("RESOURCE_NOT_FOUND", "Resource not found", 404, context.requestId);
  }

  const queue = createAiJobQueue();
  try {
    const [counts, jobsByState] = await Promise.all([
      queue.getJobCounts(...STATES),
      Promise.all(STATES.map((state) => queue.getJobs([state], 0, 24, true))),
    ]);
    const now = Date.now();
    const jobs = jobsByState.flatMap((jobs, stateIndex) =>
      jobs.map((job) => {
        const state = STATES[stateIndex];
        const startedAt = job.processedOn ?? null;
        const finishedAt = job.finishedOn ?? null;
        return {
          id: String(job.id),
          state,
          attemptsMade: job.attemptsMade,
          maxAttempts: Math.max(1, Number(job.opts.attempts ?? 1)),
          queuedAt: new Date(job.timestamp).toISOString(),
          startedAt: startedAt ? new Date(startedAt).toISOString() : null,
          finishedAt: finishedAt ? new Date(finishedAt).toISOString() : null,
          waitMs: Math.max(0, (startedAt ?? now) - job.timestamp),
          durationMs: startedAt ? Math.max(0, (finishedAt ?? now) - startedAt) : null,
          retrying: job.attemptsMade > 0 && (state === "waiting" || state === "delayed"),
        };
      }),
    );

    return apiSuccess({
      counts: {
        queued: (counts.waiting ?? 0) + (counts.delayed ?? 0),
        running: counts.active ?? 0,
        failed: counts.failed ?? 0,
        retrying: jobs.filter((job) => job.retrying).length,
      },
      jobs: jobs.sort((left, right) => right.queuedAt.localeCompare(left.queuedAt)),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    logger.error("queue overview failed", {
      requestId: context.requestId,
      userId: context.user.id,
      error,
    });
    return apiFailure("QUEUE_UNAVAILABLE", "Queue observability is unavailable", 503, context.requestId);
  } finally {
    await queue.close().catch(() => undefined);
  }
}
