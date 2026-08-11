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
import {
  getImageGeneratorProviderSize,
  resolveImageGeneratorAspectRatio,
  type ResolvedImageGeneratorAspectRatio,
} from "@carver/shared";
import sharp from "sharp";
import { buildGeneratedJobResult, buildPreparedJobResult } from "../mappers/build-job-result";
import { generateImageFromPrompt } from "../providers/openai/generate-image";
import {
  findReusableGeneratedImageAsset,
  persistGeneratedImageAsset,
  type PersistedGeneratedOutput,
} from "./asset-persistence-service";
import { resolveGenerationMaskImage, resolveGenerationReferenceImages, resolveGenerationTargetImage } from "./job-image-sources";
import { persistGeneratedAssistantMessage } from "./job-chat-persistence";
import { createSafeLogger } from "@carver/shared";
import { generateSimulatedImage, shouldFailAfterPersistedOutput } from "./simulation-generation-service";

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

export function getExactCenterCropDimensions(params: {
  width: number;
  height: number;
  ratio: ResolvedImageGeneratorAspectRatio;
}) {
  const [ratioWidth, ratioHeight] = params.ratio.split(":").map(Number);
  const widthUnits = Math.max(1, Math.floor(params.width / ratioWidth));
  const heightUnits = Math.max(1, Math.floor(params.height / ratioHeight));
  const units = Math.min(widthUnits, heightUnits);
  const width = units * ratioWidth;
  const height = units * ratioHeight;

  return {
    width,
    height,
    left: Math.max(0, Math.floor((params.width - width) / 2)),
    top: Math.max(0, Math.floor((params.height - height) / 2)),
  };
}

export async function cropGeneratedImageToAspectRatio(params: {
  buffer: Buffer;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  ratio: ResolvedImageGeneratorAspectRatio;
}) {
  const metadata = await sharp(params.buffer, { failOn: "none", limitInputPixels: 40_000_000 }).metadata();
  if (!metadata.width || !metadata.height) {
    throw new Error("Generated image has invalid dimensions for aspect-ratio crop.");
  }

  const crop = getExactCenterCropDimensions({
    width: metadata.width,
    height: metadata.height,
    ratio: params.ratio,
  });
  let pipeline = sharp(params.buffer, { failOn: "none", limitInputPixels: 40_000_000 }).extract(crop);
  pipeline = params.mimeType === "image/png"
    ? pipeline.png()
    : params.mimeType === "image/jpeg"
      ? pipeline.jpeg()
      : pipeline.webp();

  return {
    buffer: await pipeline.toBuffer(),
    width: crop.width,
    height: crop.height,
  };
}

const buildImageGeneratorPrompt = (job: CarverAiJobPayload, basePrompt: string) => {
  const textReferences = job.imageGeneratorContext?.textReferences ?? [];
  if (textReferences.length === 0) {
    return basePrompt;
  }

  return [
    "IMAGE GENERATOR TASK",
    basePrompt,
    "",
    "CONNECTED TEXT REFERENCES",
    ...textReferences.map((reference, index) => `${index + 1}. ${reference.title}: ${reference.content}`),
  ].join("\n");
};

export const prepareGenerationState = async (
  job: CarverAiJobPayload,
): Promise<PreparedGenerationState> => {
  const promptWithTextReferences =
    job.targetType === "image-generator"
      ? buildImageGeneratorPrompt(job, job.prompt)
      : job.prompt;
  const snapshotBrief = buildSnapshotAwareEditBrief(job);
  const editBrief = job.canvasGraphContext
    ? buildConnectedGenerationBrief(snapshotBrief, job.canvasGraphContext)
    : snapshotBrief;
  const shouldCompilePrompt = shouldCompilePromptForJob(job.jobType);

  const compiledPromptV2 = shouldCompilePrompt
    ? await compileGenerationPromptV2({
        rawPrompt: promptWithTextReferences,
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

  const reusableOutput = await findReusableGeneratedImageAsset({
    jobId: job.jobId,
    projectId: job.projectId,
    ownerId: job.userId,
  });
  let persistedOutputs: PersistedGeneratedOutput[] = [];
  const requestedOutputCount = Math.min(Math.max(job.outputCount ?? 1, 1), 4);
  const shouldPersistChatMessage = job.targetType !== "image-generator";

  if (reusableOutput && requestedOutputCount === 1) {
    persistedOutputs = [reusableOutput];
    logger.info("reusing generated asset from an earlier attempt", {
      jobId: job.jobId,
      projectId: job.projectId,
      assetId: reusableOutput.assetId,
    });
  } else {
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

    const inputMetadataSource = targetImage ?? referenceImages[0] ?? null;
    const inputMetadata = inputMetadataSource
      ? await sharp(inputMetadataSource.buffer, { failOn: "none", limitInputPixels: 40_000_000 }).metadata()
      : null;
    const generatorAspectRatio = job.targetType === "image-generator"
      ? resolveImageGeneratorAspectRatio({
          requested: job.aspectRatio,
          inputWidth: inputMetadata?.width,
          inputHeight: inputMetadata?.height,
        })
      : null;

    for (let outputIndex = 0; outputIndex < requestedOutputCount; outputIndex += 1) {
      const providerImage = job.simulation
        ? await generateSimulatedImage({
            job,
            prompt: state.finalPrompt,
            currentAttempt: options?.currentAttempt ?? 1,
          })
        : await generateImageFromPrompt({
            prompt: state.finalPrompt,
            mode: job.executionMode,
            model: job.model && job.model !== "auto" ? job.model : undefined,
            size: generatorAspectRatio ? getImageGeneratorProviderSize(generatorAspectRatio) : undefined,
            targetImage,
            referenceImages,
            maskImage,
          });

      logger.info("generation provider image received", {
        jobId: job.jobId,
        projectId: job.projectId,
        executionMode: job.executionMode,
        outputIndex,
        mimeType: providerImage.mimeType,
        width: providerImage.width,
        height: providerImage.height,
        provider: providerImage.provider,
      });

      const normalizedImage = generatorAspectRatio
        ? await cropGeneratedImageToAspectRatio({
            buffer: providerImage.buffer,
            mimeType: providerImage.mimeType,
            ratio: generatorAspectRatio,
          })
        : providerImage;

      const persisted = await persistGeneratedImageAsset({
        jobId: job.jobId,
        projectId: job.projectId,
        ownerId: job.userId,
        prompt: providerImage.revisedPrompt ?? state.finalPrompt,
        title: requestedOutputCount > 1 ? `Generated concept ${outputIndex + 1}` : "Generated concept",
        outputIndex,
        buffer: normalizedImage.buffer,
        mimeType: providerImage.mimeType,
        width: normalizedImage.width,
        height: normalizedImage.height,
        provider: providerImage.provider,
      });

      persistedOutputs.push(persisted);
    }

    // Exercise the dangerous retry boundary without paying a provider: the
    // output exists, but a later step fails. The next attempt must reuse it.
    if (shouldFailAfterPersistedOutput(job.simulation, options?.currentAttempt ?? 1)) {
      throw new Error("temporary simulation failure: benchmark post-persist failure.");
    }
  }

  logger.info("generated asset persisted", {
    jobId: job.jobId,
    projectId: job.projectId,
    assetIds: persistedOutputs.map((output) => output.assetId),
  });

  if (persistedOutputs.length === 0 || persistedOutputs.some((output) => !output.assetId)) {
    throw new Error("Generated image persistence did not return an asset id.");
  }

  const assistantContent =
    job.executionMode === "text_to_image"
      ? "Generated an image from the current prompt."
      : job.executionMode === "region_edit"
        ? "Generated a region edit from the selected canvas target and mask."
        : "Generated a concept image from the selected canvas target and connected references.";

  const assistantMessage = shouldPersistChatMessage
    ? await persistGeneratedAssistantMessage({
        jobId: job.jobId,
        projectId: job.projectId,
        threadId: job.threadId,
        content: assistantContent,
        generatedImages: persistedOutputs.map((output) => output.generatedImage),
      })
    : null;

  if (assistantMessage) {
    logger.info("generated assistant message persisted", {
      jobId: job.jobId,
      projectId: job.projectId,
      threadId: job.threadId ?? null,
      assistantMessageId: assistantMessage.id,
    });
  }

  const provider = persistedOutputs[0]?.generatedImage.provider ?? "carver-worker";

  return {
    provider,
    jobResult: buildGeneratedJobResult({
      provider,
      editBrief: state.editBrief,
      compiledPromptMeta: state.compiledPromptMeta,
      compiledPromptV2: state.compiledPromptV2,
      generatedImages: persistedOutputs.map((output) => output.generatedImage),
      assistantMessage,
      outputAssetIds: persistedOutputs.map((output) => output.assetId),
    }),
  };
};
