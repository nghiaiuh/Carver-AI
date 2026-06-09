/*
 * Flow: Starts worker-side background processing.
 * 1. Load worker runtime dependencies.
 * 2. Register async job handlers.
 * 3. Process queued AI/design work outside the web request.
 */

import { Worker } from "bullmq";
import { defaultQueueOptions } from "@carver/queue";

console.log("Carver worker starting");

const imageWorker = new Worker(
  "image-processing",
  async (job) => {
    console.log(`Processing job ${job.id} of type ${job.name}`);
    // TODO: implement job handlers without logging raw prompts or asset URLs.
  },
  defaultQueueOptions
);

imageWorker.on("completed", (job) => {
  console.log(`Job ${job.id} completed`);
});

imageWorker.on("failed", (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message);
});

console.log("Worker listening for jobs");
