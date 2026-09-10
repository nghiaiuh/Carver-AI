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
  EvaluationScore,
  GenerationPromptResultV2,
  GenerationCandidate,
  ImageGenerationRequest,
  ModelConditioning,
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
import {
  buildProviderImageManifest,
  resolveGenerationMaskImage,
  resolveGenerationReferenceImages,
  resolveGenerationTargetImage,
} from "./job-image-sources";
import { persistGeneratedAssistantMessage } from "./job-chat-persistence";
import { createSafeLogger } from "@carver/shared";
import { generateSimulatedImage, shouldFailAfterPersistedOutput } from "./simulation-generation-service";
import { shotInvocationRepository } from "../repositories/shot-invocation-repository";
import { persistCandidateEvaluation } from "../repositories/candidate-evaluation-repository";
import { GenerationDecisionGateError } from "../errors/generation-decision-gate";
import { runGenerationStage } from "../errors/generation-stage-error";
import { buildModelConditioning, hashSourceImageContent } from "../novel-view/build-model-conditioning";
import {
  buildSceneEvidence,
  buildSceneEvidenceProviderImages,
} from "../novel-view/scene-evidence-builder";
import {
  buildShotInvocationIdentity,
  ShotInvocationBusyError,
  ShotInvocationOutcomeUnknownError,
  type ShotInvocationStore,
} from "./shot-invocation-service";
import { planCandidatePolicy } from "../novel-view/evaluator/candidate-policy";
import {
  evaluateGeneratedCandidate,
  selectDeterministicWinner,
} from "../novel-view/evaluator/evaluate-candidate";
import {
  OPENAI_IMAGE_PROVIDER_CAPABILITY,
  benchmarkProviderConditioning,
} from "../providers/provider-capabilities";

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
  persistCandidateEvaluation: typeof persistCandidateEvaluation;
  shotInvocationStore: ShotInvocationStore;
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
  persistCandidateEvaluation,
  shotInvocationStore: shotInvocationRepository,
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
  const reusableWinnerForShot = (outputs: readonly PersistedGeneratedOutput[], shotId: string) =>
    outputs
      .filter((output) =>
        output.generatedImage.cameraShot?.shotId === shotId &&
        output.evaluationScore?.decision !== "reject",
      )
      .sort((left, right) => {
        const leftScore = left.evaluationScore?.compositeScore ?? -1;
        const rightScore = right.evaluationScore?.compositeScore ?? -1;
        return rightScore - leftScore ||
          (left.candidate?.candidateIndex ?? 0) - (right.candidate?.candidateIndex ?? 0);
      })[0] ?? null;
  const reusableShotWinners = cameraShots.flatMap((shot) => {
    const winner = reusableWinnerForShot(reusableShotOutputs, shot.shotId);
    return winner ? [winner] : [];
  });
  if (isMultiAngleJob) {
    for (const output of reusableShotWinners) {
      const shot = output.generatedImage.cameraShot;
      if (!shot) continue;
      const identity = buildShotInvocationIdentity({
        jobId: job.jobId,
        shotSetNodeId: shot.shotSetNodeId,
        shotId: shot.shotId,
        shotOrder: shot.order,
        candidateIndex: output.candidate?.candidateIndex ?? 0,
      });
      await runGenerationStage("shot_invocation", () =>
        dependencies.shotInvocationStore.markPersisted({
          jobId: job.jobId,
          projectId: job.projectId,
          ownerId: job.userId,
          identity,
          outputAssetId: output.assetId,
          conditioningHash: null,
          providerModel: output.generatedImage.provider ?? null,
        }),
      );
    }
  }
  const reusableShotOutputIds = new Set(
    reusableShotWinners
      .map((output) => output.generatedImage.cameraShot?.shotId)
      .filter((shotId): shotId is string => Boolean(shotId)),
  );
  let persistedOutputs: PersistedGeneratedOutput[] = reusableShotWinners;
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
    const findReusableShotOutput = async (shotId: string, assetId?: string) => {
      const outputs = await dependencies.findReusableGeneratedImageAssets({
        jobId: job.jobId,
        projectId: job.projectId,
        ownerId: job.userId,
      });
      return outputs.find((output) =>
        output.generatedImage.cameraShot?.shotId === shotId && (!assetId || output.assetId === assetId),
      ) ?? null;
    };
    const findReusableShotWinner = async (shotId: string) => {
      const outputs = await dependencies.findReusableGeneratedImageAssets({
        jobId: job.jobId,
        projectId: job.projectId,
        ownerId: job.userId,
      });
      return reusableWinnerForShot(outputs, shotId);
    };
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
      let conditioning: ModelConditioning | null = null;
      let evidenceImages: ReturnType<typeof buildSceneEvidenceProviderImages> = [];
      let sceneEvidenceBuild: Awaited<ReturnType<typeof buildSceneEvidence>> | null = null;
      // New multi-angle jobs already carry both a normalized CameraSpec and a
      // semantic PromptPlan. Build the provider-neutral package before any
      // provider work. Legacy persisted jobs continue through the compatible
      // source/reference manifest until their next job creation.
      const cameraSpec = shot?.cameraSpec;
      if (shot && shotState.compiledPromptV2 && cameraSpec && targetImage && inputMetadata?.width && inputMetadata.height) {
        const conditioningAssembly = await runGenerationStage("conditioning_assembly", async () => {
          const sourceContentHash = hashSourceImageContent(targetImage.buffer);
          const evidenceBuild = await buildSceneEvidence({
            source: {
              assetId: targetImage.assetId ?? job.cameraShotSetContext!.source.assetId!,
              buffer: targetImage.buffer,
              contentHash: sourceContentHash,
            },
            targetCamera: cameraSpec,
            protectedRegionMaskAssetId: job.maskAssetId,
          });
          return {
            evidenceBuild,
            conditioning: buildModelConditioning({
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
                contentHash: sourceContentHash,
              },
              sceneEvidence: evidenceBuild.evidence,
            },
            ),
          };
        });
        sceneEvidenceBuild = conditioningAssembly.evidenceBuild;
        evidenceImages = buildSceneEvidenceProviderImages(sceneEvidenceBuild.artifacts);
        conditioning = conditioningAssembly.conditioning;
        logger.info("model conditioning assembled", {
          jobId: job.jobId,
          shotId: shot.shotId,
          conditioningHash: conditioning.conditioningHash,
          evidenceStatus: conditioning.sceneEvidence.status,
          referenceCount: conditioning.referenceImages.length,
        });
      }
      const imageManifest = await runGenerationStage("input_resolution", async () =>
        buildProviderImageManifest({
          conditioning,
          targetImage,
          referenceImages,
          maskImage,
          evidenceImages,
        }),
      );
      const requestedProviderModel = job.model && job.model !== "auto" ? job.model : undefined;
      const candidatePolicy = planCandidatePolicy(conditioning?.sceneEvidence);
      const shotCandidateCount = shot ? candidatePolicy.candidateCount : requestedOutputCount;
      if (conditioning) {
        const benchmark = benchmarkProviderConditioning({
          conditioning,
          orderedRoles: imageManifest.map((image) => image.role),
          candidates: shotCandidateCount,
          providers: [OPENAI_IMAGE_PROVIDER_CAPABILITY],
        });
        logger.info("provider conditioning capability benchmark", {
          jobId: job.jobId,
          shotId: shot?.shotId ?? null,
          candidateCount: shotCandidateCount,
          supported: benchmark[0]?.supported ?? false,
        });
      }
      const shotInvocation = shot
        ? await runGenerationStage("shot_invocation", () =>
            dependencies.shotInvocationStore.claim({
              jobId: job.jobId,
              projectId: job.projectId,
              ownerId: job.userId,
              identity: buildShotInvocationIdentity({
                jobId: job.jobId,
                shotSetNodeId: shot.shotSetNodeId,
                shotId: shot.shotId,
                shotOrder: shot.order,
              }),
            }),
          )
        : null;

      if (shotInvocation?.kind === "persisted") {
        const persisted = await runGenerationStage("asset_persistence", () =>
          findReusableShotWinner(shot!.shotId),
        );
        if (!persisted) {
          const durableOutput = await runGenerationStage("asset_persistence", () =>
            findReusableShotOutput(shot!.shotId, shotInvocation.outputAssetId),
          );
          if (durableOutput?.evaluationScore?.decision === "reject") {
            throw new GenerationDecisionGateError("reject");
          }
          throw new Error("Durable shot state references an unavailable output asset.");
        }
        persistedOutputs.push(persisted);
        continue;
      }

      if (shotInvocation?.kind === "outcome_unknown") {
        const persisted = await runGenerationStage("asset_persistence", () => findReusableShotWinner(shot!.shotId));
        if (!persisted) {
          const durableOutput = await runGenerationStage("asset_persistence", () => findReusableShotOutput(shot!.shotId));
          if (durableOutput?.evaluationScore?.decision === "reject") {
            throw new GenerationDecisionGateError("reject");
          }
          throw new ShotInvocationOutcomeUnknownError(shotInvocation.identity.invocationId);
        }
        await runGenerationStage("shot_invocation", () =>
          dependencies.shotInvocationStore.markPersisted({
            jobId: job.jobId,
            projectId: job.projectId,
            ownerId: job.userId,
            identity: shotInvocation.identity,
            outputAssetId: persisted.assetId,
            conditioningHash: conditioning?.conditioningHash ?? null,
            providerModel: persisted.generatedImage.provider ?? null,
          }),
        );
        persistedOutputs.push(persisted);
        continue;
      }

      if (shotInvocation?.kind === "busy") {
        throw new ShotInvocationBusyError(shotInvocation.identity.invocationId);
      }

      if (shotInvocation?.kind === "claimed") {
        // This write is immediately before the external call. Any crash after
        // it must remain outcome_unknown unless a matching asset is recovered.
        await runGenerationStage("shot_invocation", () =>
          dependencies.shotInvocationStore.markOutcomeUnknown({
            jobId: job.jobId,
            projectId: job.projectId,
            ownerId: job.userId,
            identity: shotInvocation.identity,
            claimToken: shotInvocation.claimToken,
            conditioningHash: conditioning?.conditioningHash ?? null,
            requestedModel: requestedProviderModel ?? null,
          }),
        );
      }
      logProviderDebugPrompt({
        jobId: job.jobId,
        cameraShot: shot,
        prompt: providerPrompt,
      });
      const images = job.simulation
        ? await Promise.all(
            Array.from({ length: shotCandidateCount }, () =>
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
              model: requestedProviderModel,
              size: generatorAspectRatio ? getImageGeneratorProviderSize(generatorAspectRatio) : undefined,
              outputCount: shotCandidateCount,
              imageManifest,
              targetImage,
              referenceImages,
              maskImage,
            }),
          );
      if (shot && images.length !== shotCandidateCount) {
        throw new Error(
          `The image provider returned ${images.length} candidates; expected ${shotCandidateCount} for camera shot ${shot.shotId}.`,
        );
      }
      // Persist every paid candidate before selecting a shot winner. The durable
      // invocation remains candidate zero for the current provider `n` call;
      // each returned candidate still has a stable ID and evaluation receipt.
      const evaluatedShotCandidates: Array<{
        candidate: GenerationCandidate;
        score: EvaluationScore;
        output: PersistedGeneratedOutput;
      }> = [];
      for (const [candidateIndex, providerImage] of images.entries()) {
        const persistedOutputIndex = shot
          ? (shot.order * 4) + candidateIndex
          : outputIndex;
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

        const candidateIdentity = shot
          ? buildShotInvocationIdentity({
              jobId: job.jobId,
              shotSetNodeId: shot.shotSetNodeId,
              shotId: shot.shotId,
              shotOrder: shot.order,
              candidateIndex,
            })
          : null;
        const candidateForEvaluation = candidateIdentity
          ? {
              ...candidateIdentity,
              conditioningHash: conditioning?.conditioningHash ?? null,
              assetId: "pending-persistence",
            } satisfies GenerationCandidate
          : null;
        const evidenceBuildForEvaluation = sceneEvidenceBuild;
        const evaluationScore = candidateForEvaluation && conditioning && evidenceBuildForEvaluation
          ? await runGenerationStage("candidate_evaluation", () =>
              evaluateGeneratedCandidate({
                candidate: candidateForEvaluation,
                image: {
                  buffer: normalizedImage.buffer,
                  mimeType: providerImage.mimeType,
                  width: normalizedImage.width,
                  height: normalizedImage.height,
                },
                evidence: conditioning.sceneEvidence,
                artifacts: evidenceBuildForEvaluation.artifacts,
              }),
            )
          : undefined;

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
            ...(candidateIdentity
              ? {
                  invocationId: candidateIdentity.invocationId,
                  candidateId: candidateIdentity.candidateId,
                  candidateIndex,
                  conditioningHash: conditioning?.conditioningHash ?? null,
                }
              : {}),
            ...(evaluationScore ? { evaluationScore } : {}),
            buffer: normalizedImage.buffer,
            mimeType: providerImage.mimeType,
            width: normalizedImage.width,
            height: normalizedImage.height,
            provider: providerImage.provider,
          }),
        );

        if (shotInvocation?.kind === "claimed" && candidateIndex === 0) {
          await runGenerationStage("shot_invocation", () =>
            dependencies.shotInvocationStore.markPersisted({
              jobId: job.jobId,
              projectId: job.projectId,
              ownerId: job.userId,
              identity: shotInvocation.identity,
              claimToken: shotInvocation.claimToken,
              outputAssetId: persisted.assetId,
              conditioningHash: conditioning?.conditioningHash ?? null,
              providerModel: providerImage.provider,
            }),
          );
        }

        if (candidateForEvaluation && evaluationScore) {
          evaluatedShotCandidates.push({
            candidate: { ...candidateForEvaluation, assetId: persisted.assetId },
            score: evaluationScore,
            output: persisted,
          });
          await runGenerationStage("candidate_evaluation", () =>
            dependencies.persistCandidateEvaluation({
              jobId: job.jobId,
              projectId: job.projectId,
              ownerId: job.userId,
              candidate: { ...candidateForEvaluation, assetId: persisted.assetId },
              assetId: persisted.assetId,
              score: evaluationScore,
            }),
          );
        } else {
          persistedOutputs.push(persisted);
        }
        if (!shot) {
          outputIndex += 1;
        }
      }
      if (shot && evaluatedShotCandidates.length > 0) {
        const winner = selectDeterministicWinner(evaluatedShotCandidates);
        if (!winner) {
          throw new GenerationDecisionGateError("reject");
        }
        const selected = evaluatedShotCandidates.find((entry) => entry.candidate.candidateId === winner.candidate.candidateId);
        if (!selected) throw new Error("Candidate evaluator selected an unavailable output.");
        if (shotInvocation?.kind === "claimed" && winner.candidate.candidateIndex !== 0) {
          await runGenerationStage("shot_invocation", () =>
            dependencies.shotInvocationStore.markPersisted({
              jobId: job.jobId,
              projectId: job.projectId,
              ownerId: job.userId,
              identity: {
                invocationId: winner.candidate.invocationId,
                candidateId: winner.candidate.candidateId,
                shotSetNodeId: shot.shotSetNodeId,
                shotId: shot.shotId,
                shotOrder: shot.order,
                candidateIndex: winner.candidate.candidateIndex,
              },
              outputAssetId: selected.output.assetId,
              conditioningHash: winner.candidate.conditioningHash,
              providerModel: selected.output.generatedImage.provider ?? null,
            }),
          );
        }
        persistedOutputs.push(selected.output);
        logger.info("deterministic candidate winner selected", {
          jobId: job.jobId,
          shotId: shot.shotId,
          candidateId: winner.candidate.candidateId,
          candidateIndex: winner.candidate.candidateIndex,
          score: winner.score.compositeScore,
        });
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
