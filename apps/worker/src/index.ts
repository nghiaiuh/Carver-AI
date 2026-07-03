/*
 * Flow: Boots the worker process.
 * 1. Create the BullMQ worker instance.
 * 2. Register lifecycle event listeners.
 * 3. Keep process startup separate from job logic.
 */

import { registerAiJobWorkerEvents } from "./queue/events";
import { createAiJobWorker } from "./queue/worker";

console.log("Carver worker starting");

const aiJobWorker = createAiJobWorker();

registerAiJobWorkerEvents(aiJobWorker);

console.log("Worker listening for jobs");

void aiJobWorker;
