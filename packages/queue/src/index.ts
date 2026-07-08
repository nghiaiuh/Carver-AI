/*
 * Flow: Defines shared queue contracts.
 * 1. Export queue names and job payload types.
 * 2. Keep app and worker job contracts aligned.
 * 3. Provide a single import surface for queue code.
 */

import { Queue, QueueEvents, Worker } from "bullmq";
import type { QueuedCarverAiJobPayload } from "@carver/shared";

export { Queue, Worker, QueueEvents };

export const AI_JOB_QUEUE_NAME = "carver-ai-jobs";
export const AI_JOB_QUEUE_EVENT_NAME = "carver-ai-job";

const resolveRedisConnection = () => {
  if (process.env.REDIS_URL) {
    const redisUrl = new URL(process.env.REDIS_URL);
    return {
      host: redisUrl.hostname,
      port: Number(redisUrl.port || 6379),
      username: redisUrl.username || undefined,
      password: redisUrl.password || undefined,
      tls: redisUrl.protocol === "rediss:" ? {} : undefined,
    };
  }

  return {
    host: process.env.REDIS_HOST ?? "localhost",
    port: Number(process.env.REDIS_PORT ?? 6379),
    username: process.env.REDIS_USERNAME,
    password: process.env.REDIS_PASSWORD,
  };
};

export const describeRedisConnection = () => {
  const connection = resolveRedisConnection();

  return {
    host: connection.host,
    port: connection.port,
    hasUsername: Boolean(connection.username),
    hasPassword: Boolean(connection.password),
    tls: Boolean(connection.tls),
    source: process.env.REDIS_URL ? "REDIS_URL" : "REDIS_HOST/REDIS_PORT",
  };
};

export const defaultQueueOptions = {
  connection: resolveRedisConnection(),
  defaultJobOptions: {
    attempts: Number(process.env.AI_JOB_ATTEMPTS ?? 3),
    backoff: {
      type: "exponential",
      delay: Number(process.env.AI_JOB_BACKOFF_MS ?? 10_000),
    },
    removeOnComplete: Number(process.env.AI_JOB_REMOVE_ON_COMPLETE ?? 100),
    removeOnFail: Number(process.env.AI_JOB_REMOVE_ON_FAIL ?? 100),
  },
};

export const createAiJobQueue = () =>
  new Queue<QueuedCarverAiJobPayload>(AI_JOB_QUEUE_NAME, defaultQueueOptions);
