/*
 * Flow: Prepares generation-related worker output.
 * 1. Build the snapshot-aware edit brief.
 * 2. Merge canvas graph context when present.
 * 3. Compile prompt metadata for generation/refinement jobs.
 */

import { buildConnectedGenerationBrief, buildSnapshotAwareEditBrief } from "@carver/ai";
import {
  mapGenerationResultToLegacyMeta,
  type PromptEngineTrustedContext,
  type RequestedReferenceRole,
} from "@carver/ai/prompt-engine";
import { compileGenerationPromptV2 } from "@carver/ai/prompt-engine/server";
import type {
  CanvasReferenceRole,
  CarverAiJobPayload,
  CarverAiJobResult,
  CarverCompiledPromptMeta,
  CarverEditBrief,
  GenerationPromptResultV2,
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

const CANVAS_REFERENCE_ROLES: CanvasReferenceRole[] = [
  "direct_edit_target",
  "layout_reference",
  "style_reference",
  "material_reference",
  "plant_reference",
  "architecture_reference",
  "generic_reference",
];

export type PreparedGenerationState = {
  editBrief: CarverEditBrief;
  compiledPromptMeta: CarverCompiledPromptMeta | null;
  compiledPromptV2: GenerationPromptResultV2 | null;
  finalPrompt: string | null;
};

export type PreparedGenerationJobResult = {
  provider: string | null;
  jobResult: CarverAiJobResult;
};

const mapReferenceRoleToAllowedRoles = (role: string): RequestedReferenceRole[] => {
  switch (role) {
    case "style_reference":
      return ["style", "composition", "unspecified"];
    case "material_reference":
      return ["material", "composition", "unspecified"];
    case "layout_reference":
      return ["layout", "composition", "unspecified"];
    case "architecture_reference":
    case "plant_reference":
      return ["object", "composition", "unspecified"];
    default:
      return ["composition", "unspecified", "object", "style"];
  }
};

const toCanvasReferenceRole = (role: unknown): CanvasReferenceRole | null =>
  typeof role === "string" && CANVAS_REFERENCE_ROLES.includes(role as CanvasReferenceRole)
    ? (role as CanvasReferenceRole)
    : null;

const buildTrustedContextForJob = (job: CarverAiJobPayload): PromptEngineTrustedContext => {
  const target = job.canvasGraphContext?.target
    ? {
        contextId: job.canvasGraphContext.target.nodeId,
        title: job.canvasGraphContext.target.title,
        assetId: job.canvasGraphContext.target.assetId,
        role: job.canvasGraphContext.target.role,
        prompt: job.canvasGraphContext.target.prompt,
        source: "canvas_target" as const,
        locked: job.snapshot.locks.some((lock) => lock.targetId === job.canvasGraphContext?.target.nodeId),
      }
    : null;

  return {
    projectId: job.projectId,
    contextRevision: job.promptEngine?.contextRevision ?? job.snapshot.snapshotVersion,
    snapshotId: job.promptEngine?.snapshotId ?? job.inputSnapshotId ?? undefined,
    executionMode: job.executionMode,
    target,
    availableTargets: target ? [target] : [],
    availableReferences: [
      ...(job.canvasGraphContext?.imageReferences ?? []).map((reference) => ({
        contextId: reference.nodeId,
        title: reference.title,
        assetId: reference.assetId,
        graphRole: toCanvasReferenceRole(reference.role),
        allowedRoles: mapReferenceRoleToAllowedRoles(String(reference.role ?? "generic_reference")),
        source: "image_reference" as const,
      })),
      ...(job.canvasGraphContext?.presetReferences ?? []).map((reference) => ({
        contextId: reference.childId ?? reference.nodeId,
        title: reference.label,
        assetId: reference.assetId,
        graphRole: toCanvasReferenceRole(reference.role),
        allowedRoles: mapReferenceRoleToAllowedRoles(String(reference.role ?? "generic_reference")),
        source: "preset_reference" as const,
      })),
    ],
    selectedObjectIds: job.snapshot.selection.objectIds,
    selectedRegionIds: job.snapshot.selection.regionIds,
    lockedObjectIds: job.snapshot.locks
      .filter((lock) => lock.targetType === "object" && typeof lock.targetId === "string")
      .map((lock) => lock.targetId as string),
    locks: job.snapshot.locks,
    mask:
      job.executionMode === "region_edit"
        ? {
            assetId: job.maskAssetId,
            required: true,
            regionId: job.snapshot.selection.regionIds[0],
          }
        : null,
    explicitConstraints: {
      preserve: job.canvasGraphContext?.preserveRules ?? [],
    },
  };
};

const buildRequiredAssetIds = (job: CarverAiJobPayload) => {
  const ids = new Set<string>();

  if (job.canvasGraphContext?.target.assetId) {
    ids.add(job.canvasGraphContext.target.assetId);
  }

  for (const reference of job.canvasGraphContext?.imageReferences ?? []) {
    if (reference.assetId) {
      ids.add(reference.assetId);
    }
  }

  for (const reference of job.canvasGraphContext?.presetReferences ?? []) {
    if (reference.assetId) {
      ids.add(reference.assetId);
    }
  }

  if (job.maskAssetId) {
    ids.add(job.maskAssetId);
  }

  return [...ids];
};

export const prepareGenerationState = async (
  job: CarverAiJobPayload,
): Promise<PreparedGenerationState> => {
  const snapshotBrief = buildSnapshotAwareEditBrief(job);
  const editBrief = job.canvasGraphContext
    ? buildConnectedGenerationBrief(snapshotBrief, job.canvasGraphContext)
    : snapshotBrief;
  const shouldCompilePrompt = shouldCompilePromptForJob(job.jobType);

  const compiledPromptV2 = shouldCompilePrompt
    ? await compileGenerationPromptV2({
        rawPrompt: job.prompt,
        trustedContext: buildTrustedContextForJob(job),
        requiredAssetIds: buildRequiredAssetIds(job),
        parentEngineRunId: job.promptEngine?.parentEngineRunId ?? null,
      })
    : null;

  return {
    editBrief,
    compiledPromptMeta: compiledPromptV2 ? mapGenerationResultToLegacyMeta(compiledPromptV2) : null,
    compiledPromptV2,
    finalPrompt: compiledPromptV2?.providerPrompt ?? null,
  };
};

export const prepareGenerationJobResult = (state: PreparedGenerationState): PreparedGenerationJobResult => ({
  provider: "carver-worker-briefing",
  jobResult: buildPreparedJobResult({
    provider: "carver-worker-briefing",
    stage: state.compiledPromptMeta ? "prompt_compiled" : "brief_ready",
    editBrief: state.editBrief,
    compiledPromptMeta: state.compiledPromptMeta,
    compiledPromptV2: state.compiledPromptV2,
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
      compiledPromptV2: state.compiledPromptV2,
      generatedImages: [persisted.generatedImage],
      assistantMessage,
      outputAssetIds: [persisted.assetId],
    }),
  };
};
