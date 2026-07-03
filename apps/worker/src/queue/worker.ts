/*
 * Flow: Creates the AI job worker instance.
 * 1. Bind the shared queue name and queue options.
 * 2. Delegate job execution to the central processor.
 * 3. Keep startup wiring separate from job orchestration.
 */

import { AI_JOB_QUEUE_NAME, Worker, defaultQueueOptions } from "@carver/queue";
import type { CarverAiJobPayload } from "@carver/shared";
import { processAiJob } from "../jobs/process-ai-job";

export const createAiJobWorker = () =>
  new Worker<CarverAiJobPayload>(AI_JOB_QUEUE_NAME, processAiJob, defaultQueueOptions);
