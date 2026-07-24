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
    const port = Number(redisUrl.port || 6379);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new Error("REDIS_URL has an invalid port.");
    }
    if (process.env.NODE_ENV === "production" && redisUrl.protocol !== "rediss:") {
      throw new Error("Production Redis must use a rediss:// URL.");
    }
    if (process.env.NODE_ENV === "production" && !redisUrl.password) {
      throw new Error("Production Redis must require authentication.");
    }
    return {
      host: redisUrl.hostname,
      port,
      username: redisUrl.username || undefined,
      password: redisUrl.password || undefined,
      tls: redisUrl.protocol === "rediss:" ? {} : undefined,
    };
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("Production Redis must be configured with REDIS_URL using rediss://.");
  }

  const port = Number(process.env.REDIS_PORT ?? 6379);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("REDIS_PORT is invalid.");
  }

  return {
    host: process.env.REDIS_HOST ?? "localhost",
    port,
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
