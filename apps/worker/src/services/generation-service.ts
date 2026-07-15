/*
 * Flow: Prepares generation-related worker output.
 * 1. Build the snapshot-aware edit brief.
 * 2. Merge canvas graph context when present.
 * 3. Compile prompt metadata for generation/refinement jobs.
 */

import { buildConnectedGenerationBrief, buildSnapshotAwareEditBrief } from "@carver/ai";
import { compileFinalPrompt, type PromptMode } from "@carver/ai/prompt-engine";
import type {
  CarverAiJobPayload,
  CarverAiJobResult,
  CarverCompiledPromptMeta,
  CarverEditBrief,
} from "@carver/shared";
import { buildGeneratedJobResult, buildPreparedJobResult } from "../mappers/build-job-result";
import { generateImageFromPrompt } from "../providers/openai/generate-image";
import { persistGeneratedImageAsset } from "./asset-persistence-service";
import { resolveGenerationMaskImage, resolveGenerationReferenceImages, resolveGenerationTargetImage } from "./job-image-sources";
import { persistGeneratedAssistantMessage } from "./job-chat-persistence";
import { createSafeLogger } from "@carver/shared";
import { generateSimulatedImage } from "./simulation-generation-service";

const logger = createSafeLogger("worker.generation-service");

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

export const executeGeneratedImageJob = async (
  job: CarverAiJobPayload,
  state: PreparedGenerationState,
  options?: {
    currentAttempt?: number;
  },
): Promise<PreparedGenerationJobResult> => {
  if (!state.finalPrompt) {
    throw new Error("Image-generating jobs require a compiled prompt.");
  }

  const [targetImage, referenceImages, maskImage] = await Promise.all([
    resolveGenerationTargetImage(job),
    resolveGenerationReferenceImages(job),
    resolveGenerationMaskImage(job),
  ]);

  logger.info("generation sources resolved", {
    jobId: job.jobId,
    projectId: job.projectId,
    executionMode: job.executionMode,
    hasTargetImage: Boolean(targetImage),
    referenceImageCount: referenceImages.length,
    hasMaskImage: Boolean(maskImage),
  });

  if ((job.executionMode === "image_edit" || job.executionMode === "region_edit") && !targetImage) {
    throw new Error("Image edit jobs require a resolved target image.");
  }

  if (job.executionMode === "region_edit" && !maskImage) {
    throw new Error("Region edit jobs require a resolved mask image.");
  }

  const providerImage = job.simulation
    ? await generateSimulatedImage({
        job,
        prompt: state.finalPrompt,
        currentAttempt: options?.currentAttempt ?? 1,
      })
    : await generateImageFromPrompt({
        prompt: state.finalPrompt,
        mode: job.executionMode,
        targetImage,
        referenceImages,
        maskImage,
      });

  logger.info("generation provider image received", {
    jobId: job.jobId,
    projectId: job.projectId,
    executionMode: job.executionMode,
    mimeType: providerImage.mimeType,
    width: providerImage.width,
    height: providerImage.height,
    provider: providerImage.provider,
  });

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

  logger.info("generated asset persisted", {
    jobId: job.jobId,
    projectId: job.projectId,
    assetId: persisted.assetId,
  });

  if (!persisted.assetId) {
    throw new Error("Generated image persistence did not return an asset id.");
  }

  const assistantContent =
    job.executionMode === "text_to_image"
      ? "Generated an image from the current prompt."
      : job.executionMode === "region_edit"
        ? "Generated a region edit from the selected canvas target and mask."
        : "Generated a concept image from the selected canvas target and connected references.";

  const assistantMessage = await persistGeneratedAssistantMessage({
    projectId: job.projectId,
    threadId: job.threadId,
    content: assistantContent,
    generatedImages: [persisted.generatedImage],
  });

  logger.info("generated assistant message persisted", {
    jobId: job.jobId,
    projectId: job.projectId,
    threadId: job.threadId ?? null,
    assistantMessageId: assistantMessage.id,
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
