/*
 * Flow: Creates the AI job worker instance.
 * 1. Bind the shared queue name and queue options.
 * 2. Delegate job execution to the central processor.
 * 3. Keep startup wiring separate from job orchestration.
 */

import {
  AI_JOB_QUEUE_NAME,
  Worker,
  getDefaultQueueOptions,
  getAiWorkerRuntimeOptions,
} from "@carver/queue";
import type { QueuedCarverAiJobPayload } from "@carver/shared";
import { processAiJob } from "../jobs/process-ai-job";

export const createAiJobWorker = () =>
  new Worker<QueuedCarverAiJobPayload>(AI_JOB_QUEUE_NAME, processAiJob, {
    ...getDefaultQueueOptions(),
    ...getAiWorkerRuntimeOptions(),
  });
