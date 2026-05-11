export { Queue, Worker, QueueEvents } from "bullmq";

export const defaultQueueOptions = {
  connection: {
    host: process.env.REDIS_HOST ?? "localhost",
    port: Number(process.env.REDIS_PORT ?? 6379),
  },
};
