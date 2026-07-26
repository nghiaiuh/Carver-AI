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

const readBoundedInteger = (
  rawValue: string | undefined,
  fallback: number,
  min: number,
  max: number,
  name: string,
) => {
  const value = Number(rawValue ?? fallback);
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} must be an integer between ${min} and ${max}.`);
  }

  return value;
};

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
    attempts: readBoundedInteger(process.env.AI_JOB_ATTEMPTS, 3, 1, 10, "AI_JOB_ATTEMPTS"),
    backoff: {
      type: "exponential",
      delay: readBoundedInteger(process.env.AI_JOB_BACKOFF_MS, 10_000, 1_000, 3_600_000, "AI_JOB_BACKOFF_MS"),
    },
    removeOnComplete: readBoundedInteger(
      process.env.AI_JOB_REMOVE_ON_COMPLETE,
      100,
      0,
      10_000,
      "AI_JOB_REMOVE_ON_COMPLETE",
    ),
    removeOnFail: readBoundedInteger(
      process.env.AI_JOB_REMOVE_ON_FAIL,
      100,
      0,
      10_000,
      "AI_JOB_REMOVE_ON_FAIL",
    ),
  },
};

export const getAiWorkerRuntimeOptions = () => ({
  concurrency: readBoundedInteger(process.env.AI_WORKER_CONCURRENCY, 2, 1, 32, "AI_WORKER_CONCURRENCY"),
  lockDuration: readBoundedInteger(
    process.env.AI_JOB_LOCK_DURATION_MS,
    60_000,
    10_000,
    600_000,
    "AI_JOB_LOCK_DURATION_MS",
  ),
  stalledInterval: readBoundedInteger(
    process.env.AI_JOB_STALLED_INTERVAL_MS,
    30_000,
    5_000,
    300_000,
    "AI_JOB_STALLED_INTERVAL_MS",
  ),
  maxStalledCount: readBoundedInteger(
    process.env.AI_JOB_MAX_STALLED_COUNT,
    1,
    0,
    5,
    "AI_JOB_MAX_STALLED_COUNT",
  ),
});

export const createAiJobQueue = () =>
  new Queue<QueuedCarverAiJobPayload>(AI_JOB_QUEUE_NAME, defaultQueueOptions);
