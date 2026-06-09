/*
 * Flow: Defines shared queue contracts.
 * 1. Export queue names and job payload types.
 * 2. Keep app and worker job contracts aligned.
 * 3. Provide a single import surface for queue code.
 */

export { Queue, Worker, QueueEvents } from "bullmq";

export const defaultQueueOptions = {
  connection: {
    host: process.env.REDIS_HOST ?? "localhost",
    port: Number(process.env.REDIS_PORT ?? 6379),
    username: process.env.REDIS_USERNAME,
    password: process.env.REDIS_PASSWORD,
  },
};
