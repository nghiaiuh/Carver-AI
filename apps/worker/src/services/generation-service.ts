/*
 * Flow: Prepares generation-related worker output.
 * 1. Build the snapshot-aware edit brief.
 * 2. Merge canvas graph context when present.
 * 3. Compile prompt metadata for generation/refinement jobs.
 */

import { buildConnectedGenerationBrief, buildSnapshotAwareEditBrief } from "@carver/ai";
import { compileFinalPrompt, type PromptMode } from "@carver/ai/prompt-engine";
import type { CarverAiJobPayload } from "@carver/shared";

const shouldCompilePromptForJob = (jobType: CarverAiJobPayload["jobType"]) =>
  jobType === "generate_concept" || jobType === "refine_concept";

type CompiledPromptMeta = {
  taskType: string;
  editScope: string;
  riskLevel: string;
  targetArea: string | null;
  targetObject: string | null;
  formulaUsed: string;
  shouldShowReview: boolean;
};

export type PreparedGenerationJobResult = {
  provider: string;
  jobResult: {
    stage: "prompt_compiled" | "brief_ready";
    editBrief: ReturnType<typeof buildSnapshotAwareEditBrief>;
    compiledPromptMeta: CompiledPromptMeta | null;
  };
};

export const prepareGenerationJobResult = (
  job: CarverAiJobPayload,
): PreparedGenerationJobResult => {
  const snapshotBrief = buildSnapshotAwareEditBrief(job);
  const editBrief = job.canvasGraphContext
    ? buildConnectedGenerationBrief(snapshotBrief, job.canvasGraphContext)
    : snapshotBrief;
  const shouldCompilePrompt = shouldCompilePromptForJob(job.jobType);

  const compiledPrompt = shouldCompilePrompt
    ? compileFinalPrompt({
        rawPrompt: job.prompt,
        promptMode: job.promptMode as PromptMode,
        projectContext: {
          snapshotVersion: job.snapshot.snapshotVersion,
          selectedObjectIds: job.snapshot.selection.objectIds,
          selectedRegionIds: job.snapshot.selection.regionIds,
          lockCount: job.snapshot.locks.length,
          connectionSummary: job.canvasGraphContext?.connectionSummary,
        },
        imageContext: {
          referenceAssetIds: job.referenceAssetIds,
          targetNodeId: job.targetNodeId,
          imageReferences: job.canvasGraphContext?.imageReferences,
          presetReferences: job.canvasGraphContext?.presetReferences,
        },
      })
    : null;

  return {
    provider: "carver-worker-briefing",
    jobResult: {
      stage: shouldCompilePrompt ? "prompt_compiled" : "brief_ready",
      editBrief,
      compiledPromptMeta: compiledPrompt
        ? {
            taskType: compiledPrompt.taskType,
            editScope: compiledPrompt.editScope,
            riskLevel: compiledPrompt.riskLevel,
            targetArea: compiledPrompt.targetArea ?? null,
            targetObject: compiledPrompt.targetObject ?? null,
            formulaUsed: compiledPrompt.formulaUsed,
            shouldShowReview: compiledPrompt.shouldShowReview,
          }
        : null,
    },
  };
};
