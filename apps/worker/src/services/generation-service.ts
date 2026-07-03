/*
 * Flow: Prepares generation-related worker output.
 * 1. Build the snapshot-aware edit brief.
 * 2. Merge canvas graph context when present.
 * 3. Compile prompt metadata for generation/refinement jobs.
 */

import { buildConnectedGenerationBrief, buildSnapshotAwareEditBrief } from "@carver/ai";
import { compileFinalPrompt, type PromptMode } from "@carver/ai/prompt-engine";
import type {
  CanvasGenerationAssistantMessage,
  CarverAiJobPayload,
  CarverAiJobResult,
  CarverCompiledPromptMeta,
  CarverEditBrief,
} from "@carver/shared";
import { buildGeneratedJobResult, buildPreparedJobResult } from "../mappers/build-job-result";
import { generateImageFromPrompt } from "../providers/openai/generate-image";
import { persistGeneratedImageAsset } from "./asset-persistence-service";

const shouldCompilePromptForJob = (jobType: CarverAiJobPayload["jobType"]) =>
  jobType === "generate_concept" || jobType === "refine_concept";

export type PreparedGenerationState = {
  editBrief: CarverEditBrief;
  compiledPromptMeta: CarverCompiledPromptMeta | null;
  finalPrompt: string | null;
};

export type PreparedGenerationJobResult = {
  provider: string | null;
  jobResult: CarverAiJobResult;
};

export const prepareGenerationState = (
  job: CarverAiJobPayload,
): PreparedGenerationState => {
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
    finalPrompt: compiledPrompt?.enhancedPrompt ?? null,
  };
};

export const prepareGenerationJobResult = (state: PreparedGenerationState): PreparedGenerationJobResult => ({
  provider: "carver-worker-briefing",
  jobResult: buildPreparedJobResult({
    provider: "carver-worker-briefing",
    stage: state.compiledPromptMeta ? "prompt_compiled" : "brief_ready",
    editBrief: state.editBrief,
    compiledPromptMeta: state.compiledPromptMeta,
  }),
});

function buildGenerationAssistantMessage(params: {
  generatedImage: Awaited<ReturnType<typeof persistGeneratedImageAsset>>["generatedImage"];
}): CanvasGenerationAssistantMessage {
  return {
    id: `assistant-generation-${Date.now()}`,
    role: "assistant",
    content: "Generated a concept image from the selected canvas target and connected references.",
    createdAt: new Date().toISOString(),
    generatedImages: [params.generatedImage],
  };
}

export const executeGeneratedImageJob = async (
  job: CarverAiJobPayload,
  state: PreparedGenerationState,
): Promise<PreparedGenerationJobResult> => {
  if (!state.finalPrompt) {
    return prepareGenerationJobResult(state);
  }

  const providerImage = await generateImageFromPrompt(state.finalPrompt);
  const persisted = await persistGeneratedImageAsset({
    jobId: job.jobId,
    projectId: job.projectId,
    ownerId: job.userId,
    prompt: providerImage.revisedPrompt ?? state.finalPrompt,
    title: "Generated concept",
    buffer: providerImage.buffer,
    mimeType: providerImage.mimeType,
    width: providerImage.width,
    height: providerImage.height,
    provider: providerImage.provider,
  });
  const assistantMessage = buildGenerationAssistantMessage({
    generatedImage: persisted.generatedImage,
  });

  return {
    provider: providerImage.provider,
    jobResult: buildGeneratedJobResult({
      provider: providerImage.provider,
      editBrief: state.editBrief,
      compiledPromptMeta: state.compiledPromptMeta,
      generatedImages: [persisted.generatedImage],
      assistantMessage,
      outputAssetIds: [persisted.assetId],
    }),
  };
};
