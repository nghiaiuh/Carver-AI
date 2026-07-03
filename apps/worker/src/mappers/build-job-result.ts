/*
 * Flow: Normalizes worker execution state into a stable ai_jobs result shape.
 * 1. Convert preparation state into a serializable job_result.
 * 2. Add generated output metadata when the worker produces real images.
 * 3. Keep web rendering independent from worker internals.
 */

import type {
  CanvasGenerationAssistantMessage,
  CarverAiJobResult,
  CarverCompiledPromptMeta,
  CarverEditBrief,
  GeneratedCanvasImage,
} from "@carver/shared";

export const buildPreparedJobResult = (params: {
  provider: string | null;
  stage: CarverAiJobResult["stage"];
  editBrief: CarverEditBrief;
  compiledPromptMeta: CarverCompiledPromptMeta | null;
}): CarverAiJobResult => ({
  stage: params.stage,
  provider: params.provider,
  editBrief: params.editBrief,
  compiledPromptMeta: params.compiledPromptMeta,
  generatedImages: [],
  assistantMessage: null,
  outputAssetIds: [],
  outputSnapshotId: null,
});

export const buildGeneratedJobResult = (params: {
  provider: string;
  editBrief: CarverEditBrief;
  compiledPromptMeta: CarverCompiledPromptMeta | null;
  generatedImages: GeneratedCanvasImage[];
  assistantMessage: CanvasGenerationAssistantMessage;
  outputAssetIds: string[];
  outputSnapshotId?: string | null;
}): CarverAiJobResult => ({
  stage: "generated",
  provider: params.provider,
  editBrief: params.editBrief,
  compiledPromptMeta: params.compiledPromptMeta,
  generatedImages: params.generatedImages,
  assistantMessage: params.assistantMessage,
  outputAssetIds: params.outputAssetIds,
  outputSnapshotId: params.outputSnapshotId ?? null,
});
