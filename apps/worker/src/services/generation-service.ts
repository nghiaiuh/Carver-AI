/*
 * Flow: Prepares generation-related worker output.
 * 1. Build the snapshot-aware edit brief.
 * 2. Merge canvas graph context when present.
 * 3. Compile prompt metadata for generation/refinement jobs.
 */

import { buildConnectedGenerationBrief, buildSnapshotAwareEditBrief } from "@carver/ai";
import {
  buildNovelViewGenerationRequest,
  mapGenerationResultToLegacyMeta,
  toChangeAngleOperation,
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
  CameraShotDirective,
  GenerationPromptResultV2,
  ImageGenerationRequest,
} from "@carver/shared";
import {
  getImageGeneratorProviderSize,
  resolveImageGeneratorAspectRatio,
  type ResolvedImageGeneratorAspectRatio,
} from "@carver/shared";
import sharp from "sharp";
import { buildGeneratedJobResult, buildPreparedJobResult } from "../mappers/build-job-result";
import { generateImagesFromPrompt } from "../providers/openai/generate-image";
import {
  findReusableGeneratedImageAsset,
  findReusableGeneratedImageAssets,
  persistGeneratedImageAsset,
  type PersistedGeneratedOutput,
} from "./asset-persistence-service";
import { resolveGenerationMaskImage, resolveGenerationReferenceImages, resolveGenerationTargetImage } from "./job-image-sources";
import { persistGeneratedAssistantMessage } from "./job-chat-persistence";
import { createSafeLogger } from "@carver/shared";
import { generateSimulatedImage, shouldFailAfterPersistedOutput } from "./simulation-generation-service";
import { GenerationDecisionGateError } from "../errors/generation-decision-gate";
import { runGenerationStage } from "../errors/generation-stage-error";
import { buildModelConditioning, hashSourceImageContent } from "../novel-view/build-model-conditioning";

const logger = createSafeLogger("worker.generation-service");
const shouldCompilePromptForJob = (jobType: CarverAiJobPayload["jobType"]) =>
  jobType === "generate_concept" || jobType === "refine_concept";
const isLocalPromptDebugEnabled = () =>
  process.env.NODE_ENV !== "production" &&
  process.env.CARVER_DEBUG_GENERATION_PROMPTS === "true";

const logProviderDebugPrompt = (params: {
  jobId: string;
  cameraShot: CameraShotDirective | null;
  prompt: string;
}) => {
  if (!isLocalPromptDebugEnabled()) return;

  const shot = params.cameraShot
    ? `shotId=${params.cameraShot.shotId} mode=${params.cameraShot.mode} order=${params.cameraShot.order}`
    : "shot=none";
  process.stdout.write(
    `\n[carver:debug:image-provider:input jobId=${params.jobId} ${shot}]\n${params.prompt}\n[/carver:debug:image-provider:input]\n`,
  );
};

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
  cameraShot?: CameraShotDirective | null;
  novelViewRequest?: ImageGenerationRequest | null;
};

const assertProviderExecutionAllowed = (state: PreparedGenerationState) => {
  const decision =
    state.compiledPromptV2?.plan.decision ?? state.compiledPromptMeta?.decision;

  if (decision === "reject" || decision === "require_review") {
    throw new GenerationDecisionGateError(decision);
  }
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

const buildTrustedContextForJob = (
  job: CarverAiJobPayload,
  cameraShot?: CameraShotDirective | null,
): PromptEngineTrustedContext => {
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
    cameraShot: cameraShot ?? null,
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

export type GenerationServiceDependencies = {
  findReusableGeneratedImageAsset: typeof findReusableGeneratedImageAsset;
  findReusableGeneratedImageAssets: typeof findReusableGeneratedImageAssets;
  persistGeneratedImageAsset: typeof persistGeneratedImageAsset;
  resolveGenerationTargetImage: typeof resolveGenerationTargetImage;
  resolveGenerationReferenceImages: typeof resolveGenerationReferenceImages;
  resolveGenerationMaskImage: typeof resolveGenerationMaskImage;
  generateImagesFromPrompt: typeof generateImagesFromPrompt;
  persistGeneratedAssistantMessage: typeof persistGeneratedAssistantMessage;
};

const defaultGenerationServiceDependencies: GenerationServiceDependencies = {
  findReusableGeneratedImageAsset,
  findReusableGeneratedImageAssets,
  persistGeneratedImageAsset,
  resolveGenerationTargetImage,
  resolveGenerationReferenceImages,
  resolveGenerationMaskImage,
  generateImagesFromPrompt,
  persistGeneratedAssistantMessage,
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

export const buildImageGeneratorPrompt = (job: CarverAiJobPayload, basePrompt: string) => {
  const primaryDirection = basePrompt.trim();
  const textReferences = (job.imageGeneratorContext?.textReferences ?? []).filter(
    (reference) => reference.sourceKind !== "camera-shot-set",
  );
  if (textReferences.length === 0) {
    return primaryDirection;
  }

  const referenceSection = textReferences
    .map((reference, index) => `[${index + 1}] ${reference.title}\n${reference.content.trim()}`)
    .join("\n\n");

  return [
    "IMAGE GENERATOR BRIEF",
    "",
    "PRIMARY DIRECTION",
    primaryDirection || "No direct direction was entered in the Image Generator card.",
    "",
    "CONNECTED TEXT REFERENCE MATERIAL",
    referenceSection,
    "",
    "INTERPRETATION RULES",
    primaryDirection
      ? "Follow PRIMARY DIRECTION as the requested outcome. Use connected text only as supporting context; do not let it override the primary direction."
      : "Use the connected text as the requested direction. If it contains alternatives or numbered options, choose one coherent option for this image and do not blend contradictory options together.",
  ].join("\n");
};

export const prepareGenerationState = async (
  job: CarverAiJobPayload,
  cameraShot?: CameraShotDirective | null,
): Promise<PreparedGenerationState> => {
  if (cameraShot && job.executionMode !== "image_edit") {
    throw new Error("Camera-shot generation requires image_edit execution mode.");
  }

  const basePrompt =
    job.targetType === "image-generator"
      ? buildImageGeneratorPrompt(job, job.prompt)
      : job.prompt;
  const snapshotBrief = buildSnapshotAwareEditBrief(job);
  const editBrief = job.canvasGraphContext
    ? buildConnectedGenerationBrief(snapshotBrief, job.canvasGraphContext)
    : snapshotBrief;
  const shouldCompilePrompt = shouldCompilePromptForJob(job.jobType);

  const compiledPromptV2 = shouldCompilePrompt
    ? await runGenerationStage("prompt_compile", () =>
        compileGenerationPromptV2({
          rawPrompt: basePrompt,
          trustedContext: buildTrustedContextForJob(job, cameraShot),
          requiredAssetIds: buildRequiredAssetIds(job),
          parentEngineRunId: job.promptEngine?.parentEngineRunId ?? null,
        }),
      )
    : null;
  const changeAngleOperation = cameraShot && job.canvasGraphContext?.target
    ? toChangeAngleOperation({
        shot: cameraShot,
        targetId: job.canvasGraphContext.target.nodeId,
        targetName: job.canvasGraphContext.target.title,
      })
    : null;
  const sourceImageId =
    job.cameraShotSetContext?.source.assetId ??
    job.canvasGraphContext?.target.assetId;
  const novelViewRequest = compiledPromptV2 && changeAngleOperation && sourceImageId && cameraShot
    ? buildNovelViewGenerationRequest({
        operation: changeAngleOperation,
        sourceImageId,
        prompt: compiledPromptV2.providerPrompt,
        cameraSpec: cameraShot.cameraSpec,
      })
    : null;

  return {
    editBrief,
    compiledPromptMeta: compiledPromptV2 ? mapGenerationResultToLegacyMeta(compiledPromptV2) : null,
    compiledPromptV2,
    finalPrompt: novelViewRequest?.prompt ?? compiledPromptV2?.providerPrompt ?? null,
    cameraShot: cameraShot ?? null,
    novelViewRequest,
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
    dependencies?: Partial<GenerationServiceDependencies>;
  },
): Promise<PreparedGenerationJobResult> => {
  assertProviderExecutionAllowed(state);

  if (!state.finalPrompt) {
    throw new Error("Image-generating jobs require a compiled prompt.");
  }
  const dependencies = { ...defaultGenerationServiceDependencies, ...options?.dependencies };
  const cameraShots = job.cameraShotSetContext?.shots ?? [];
  const isMultiAngleJob = cameraShots.length > 0;

  const reusableOutput = isMultiAngleJob
    ? null
    : await runGenerationStage("asset_persistence", () =>
        dependencies.findReusableGeneratedImageAsset({
          jobId: job.jobId,
          projectId: job.projectId,
          ownerId: job.userId,
        }),
      );
  const reusableShotOutputs = isMultiAngleJob
    ? await runGenerationStage("asset_persistence", () =>
        dependencies.findReusableGeneratedImageAssets({
          jobId: job.jobId,
          projectId: job.projectId,
          ownerId: job.userId,
        }),
      )
    : [];
  const reusableShotOutputIds = new Set(
    reusableShotOutputs
      .map((output) => output.generatedImage.cameraShot?.shotId)
      .filter((shotId): shotId is string => Boolean(shotId)),
  );
  let persistedOutputs: PersistedGeneratedOutput[] = reusableShotOutputs;
  const requestedOutputCount = isMultiAngleJob ? 1 : Math.min(Math.max(job.outputCount ?? 1, 1), 4);
  const shouldPersistChatMessage = job.targetType !== "image-generator";

  if (reusableOutput && requestedOutputCount === 1) {
    persistedOutputs = [reusableOutput];
    logger.info("reusing generated asset from an earlier attempt", {
      jobId: job.jobId,
      projectId: job.projectId,
      assetId: reusableOutput.assetId,
    });
  } else {
    const [targetImage, referenceImages, maskImage] = await runGenerationStage("input_resolution", () =>
      Promise.all([
        dependencies.resolveGenerationTargetImage(job),
        dependencies.resolveGenerationReferenceImages(job),
        dependencies.resolveGenerationMaskImage(job),
      ]),
    );

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
      ? await runGenerationStage("input_metadata", () =>
          sharp(inputMetadataSource.buffer, { failOn: "none", limitInputPixels: 40_000_000 }).metadata(),
        )
      : null;
    const generatorAspectRatio = job.targetType === "image-generator"
      ? resolveImageGeneratorAspectRatio({
          requested: job.aspectRatio,
          inputWidth: inputMetadata?.width,
          inputHeight: inputMetadata?.height,
        })
      : null;

    const shotsToGenerate = isMultiAngleJob
      ? cameraShots.filter((shot) => !reusableShotOutputIds.has(shot.shotId))
      : [null];
    let outputIndex = 0;

    for (const shot of shotsToGenerate) {
      const shotState = shot && state.cameraShot?.shotId !== shot.shotId
        ? await prepareGenerationState(job, shot)
        : state;
      assertProviderExecutionAllowed(shotState);
      if (shot?.mode === "orbit" && !shotState.novelViewRequest) {
        throw new Error("Orbit camera generation is missing its structured novel-view prompt.");
      }
      const providerPrompt = shot?.mode === "orbit"
        ? shotState.novelViewRequest!.prompt
        : shotState.finalPrompt;
      if (!providerPrompt) {
        throw new Error("Multi-angle shot is missing a compiled prompt.");
      }
      // New multi-angle jobs already carry both a normalized CameraSpec and a
      // semantic PromptPlan. Build the provider-neutral package before any
      // provider work. MA-007 will map its image roles into adapter inputs;
      // legacy persisted jobs continue through the compatible prompt path.
      if (shot && shotState.compiledPromptV2 && shot.cameraSpec && targetImage && inputMetadata?.width && inputMetadata.height) {
        const conditioning = await runGenerationStage("conditioning_assembly", async () =>
          buildModelConditioning({
            job,
            cameraShot: shot,
            compiledPrompt: shotState.compiledPromptV2!,
            source: {
              // The resolver's asset ID must agree with the canonical request
              // source. The builder validates that agreement before provider work.
              assetId: targetImage.assetId ?? job.cameraShotSetContext!.source.assetId!,
              width: inputMetadata.width,
              height: inputMetadata.height,
              mimeType: targetImage.mimeType,
              contentHash: hashSourceImageContent(targetImage.buffer),
            },
          }),
        );
        logger.info("model conditioning assembled", {
          jobId: job.jobId,
          shotId: shot.shotId,
          conditioningHash: conditioning.conditioningHash,
          evidenceStatus: conditioning.sceneEvidence.status,
          referenceCount: conditioning.referenceImages.length,
        });
      }
      logProviderDebugPrompt({
        jobId: job.jobId,
        cameraShot: shot,
        prompt: providerPrompt,
      });
      const images = job.simulation
        ? await Promise.all(
            Array.from({ length: requestedOutputCount }, () =>
              generateSimulatedImage({
                job,
                prompt: providerPrompt,
                currentAttempt: options?.currentAttempt ?? 1,
              }),
            ),
          )
        : await runGenerationStage("provider_request", () =>
            dependencies.generateImagesFromPrompt({
              prompt: providerPrompt,
              mode: job.executionMode,
              model: job.model && job.model !== "auto" ? job.model : undefined,
              size: generatorAspectRatio ? getImageGeneratorProviderSize(generatorAspectRatio) : undefined,
              outputCount: requestedOutputCount,
              targetImage,
              referenceImages,
              maskImage,
            }),
          );
      // Persist each camera shot before advancing to the next provider call.
      // A later-shot failure can then replay only the missing shot on retry.
      for (const providerImage of images) {
        const persistedOutputIndex = shot?.order ?? outputIndex;
        logger.info("generation provider image received", {
          jobId: job.jobId,
          projectId: job.projectId,
          outputIndex: persistedOutputIndex,
          mimeType: providerImage.mimeType,
          width: providerImage.width,
          height: providerImage.height,
          provider: providerImage.provider,
        });

        const normalizedImage = generatorAspectRatio
          ? await runGenerationStage("output_normalization", () =>
              cropGeneratedImageToAspectRatio({
                buffer: providerImage.buffer,
                mimeType: providerImage.mimeType,
                ratio: generatorAspectRatio,
              }),
            )
          : providerImage;

        const persisted = await runGenerationStage("asset_persistence", () =>
          dependencies.persistGeneratedImageAsset({
            jobId: job.jobId,
            projectId: job.projectId,
            ownerId: job.userId,
            prompt: providerImage.revisedPrompt ?? providerPrompt,
            title: shot
              ? `Camera ${String(shot.order + 1).padStart(2, "0")} - ${shot.shotName}`
              : requestedOutputCount > 1
                ? `Generated concept ${outputIndex + 1}`
                : "Generated concept",
            outputIndex: persistedOutputIndex,
            cameraShot: shot
              ? {
                  shotSetNodeId: shot.shotSetNodeId,
                  shotId: shot.shotId,
                  shotName: shot.shotName,
                  order: shot.order,
                  mode: shot.mode,
                }
              : undefined,
            buffer: normalizedImage.buffer,
            mimeType: providerImage.mimeType,
            width: normalizedImage.width,
            height: normalizedImage.height,
            provider: providerImage.provider,
          }),
        );

        persistedOutputs.push(persisted);
        if (!shot) {
          outputIndex += 1;
        }
      }
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

  if (isMultiAngleJob) {
    persistedOutputs.sort(
      (left, right) =>
        (left.generatedImage.cameraShot?.order ?? Number.MAX_SAFE_INTEGER) -
        (right.generatedImage.cameraShot?.order ?? Number.MAX_SAFE_INTEGER),
    );
  }

  const assistantContent =
    job.executionMode === "text_to_image"
      ? "Generated an image from the current prompt."
      : job.executionMode === "region_edit"
        ? "Generated a region edit from the selected canvas target and mask."
        : "Generated a concept image from the selected canvas target and connected references.";

  const assistantMessage = shouldPersistChatMessage
    ? await runGenerationStage("job_completion", () =>
        dependencies.persistGeneratedAssistantMessage({
          jobId: job.jobId,
          projectId: job.projectId,
          threadId: job.threadId,
          content: assistantContent,
          generatedImages: persistedOutputs.map((output) => output.generatedImage),
        }),
      )
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
