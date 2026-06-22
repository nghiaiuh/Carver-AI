/*
 * Flow: Defines shared queue contracts.
 * 1. Export queue names and job payload types.
 * 2. Keep app and worker job contracts aligned.
 * 3. Provide a single import surface for queue code.
 */

import { Queue, QueueEvents, Worker } from "bullmq";
import type { CarverAiJobPayload } from "@carver/shared";

export { Queue, Worker, QueueEvents };

export const AI_JOB_QUEUE_NAME = "carver-ai-jobs";
export const AI_JOB_QUEUE_EVENT_NAME = "carver-ai-job";

export const defaultQueueOptions = {
  connection: {
    host: process.env.REDIS_HOST ?? "localhost",
    port: Number(process.env.REDIS_PORT ?? 6379),
    username: process.env.REDIS_USERNAME,
    password: process.env.REDIS_PASSWORD,
  },
};

export const createAiJobQueue = () =>
  new Queue<CarverAiJobPayload>(AI_JOB_QUEUE_NAME, defaultQueueOptions);
