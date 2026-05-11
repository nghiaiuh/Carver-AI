import { Worker } from "bullmq";
import { defaultQueueOptions } from "@carver/queue";

console.log("🚀 Carver Worker starting...");

const imageWorker = new Worker(
  "image-processing",
  async (job) => {
    console.log(`Processing job ${job.id} of type ${job.name}`, job.data);
    // TODO: implement job handlers
  },
  defaultQueueOptions
);

imageWorker.on("completed", (job) => {
  console.log(`✅ Job ${job.id} completed`);
});

imageWorker.on("failed", (job, err) => {
  console.error(`❌ Job ${job?.id} failed:`, err.message);
});

console.log("👷 Worker listening for jobs...");
