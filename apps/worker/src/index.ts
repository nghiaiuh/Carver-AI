/*
 * Flow: Starts worker-side background processing.
 * 1. Load worker runtime dependencies.
 * 2. Register async job handlers.
 * 3. Process queued AI/design work outside the web request.
 */

import { Worker } from "bullmq";
import { buildConnectedGenerationBrief, buildSnapshotAwareEditBrief } from "@carver/ai";
import { compileFinalPrompt, type PromptMode } from "@carver/ai/prompt-engine";
import { getSupabaseAdmin } from "@carver/db/server";
import { AI_JOB_QUEUE_NAME, defaultQueueOptions } from "@carver/queue";
import type { CarverAiJobPayload } from "@carver/shared";

console.log("Carver worker starting");

const imageWorker = new Worker<CarverAiJobPayload>(
  AI_JOB_QUEUE_NAME,
  async (job) => {
    console.log(`Processing job ${job.id} of type ${job.data.jobType}`);

    const supabase = getSupabaseAdmin();
    try {
      await supabase
        .from("ai_jobs")
        .update({
          status: "running",
          error_code: null,
          error_message: null,
        })
        .eq("id", job.data.jobId);

      const snapshotBrief = buildSnapshotAwareEditBrief(job.data);
      const editBrief = job.data.canvasGraphContext
        ? buildConnectedGenerationBrief(snapshotBrief, job.data.canvasGraphContext)
        : snapshotBrief;
      const shouldCompilePrompt =
        job.data.jobType === "generate_concept" || job.data.jobType === "refine_concept";

      const compiledPrompt = shouldCompilePrompt
        ? compileFinalPrompt({
            rawPrompt: job.data.prompt,
            promptMode: job.data.promptMode as PromptMode,
            projectContext: {
              snapshotVersion: job.data.snapshot.snapshotVersion,
              selectedObjectIds: job.data.snapshot.selection.objectIds,
              selectedRegionIds: job.data.snapshot.selection.regionIds,
              lockCount: job.data.snapshot.locks.length,
              connectionSummary: job.data.canvasGraphContext?.connectionSummary,
            },
            imageContext: {
              referenceAssetIds: job.data.referenceAssetIds,
              targetNodeId: job.data.targetNodeId,
              imageReferences: job.data.canvasGraphContext?.imageReferences,
              presetReferences: job.data.canvasGraphContext?.presetReferences,
            },
          })
        : null;

      const { error } = await supabase
        .from("ai_jobs")
        .update({
          status: "succeeded",
          provider: "carver-worker-briefing",
          job_result: {
            stage: shouldCompilePrompt ? "prompt_compiled" : "brief_ready",
            editBrief,
            compiledPromptMeta: compiledPrompt
              ? {
                  taskType: compiledPrompt.taskType,
                  editScope: compiledPrompt.editScope,
                  riskLevel: compiledPrompt.riskLevel,
                  targetArea: compiledPrompt.targetArea,
                  targetObject: compiledPrompt.targetObject,
                  formulaUsed: compiledPrompt.formulaUsed,
                  shouldShowReview: compiledPrompt.shouldShowReview,
                }
              : null,
          },
        })
        .eq("id", job.data.jobId);

      if (error) {
        throw error;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown worker failure";
      await supabase
        .from("ai_jobs")
        .update({
          status: "failed",
          error_code: "worker_processing_failed",
          error_message: message,
        })
        .eq("id", job.data.jobId);

      throw error;
    }
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
