import assert from "node:assert/strict";
import test from "node:test";
import { TEST_PNG_BASE64 } from "@carver/shared/testing/openaiTransport";
import {
  createEmptyCanvasSnapshotDocument,
  normalizeCameraShotDirective,
  type CarverAiJobPayload,
  type CarverEditBrief,
  type PersistedGeneratedImage,
} from "@carver/shared";
import { buildNovelViewGenerationRequest, toChangeAngleOperation } from "@carver/ai/prompt-engine";
import type { OpenAiGeneratedImage } from "../providers/openai/generate-image";
import type { PersistedGeneratedOutput } from "./asset-persistence-service";
import {
  buildImageGeneratorPrompt,
  executeGeneratedImageJob,
  getExactCenterCropDimensions,
  prepareGenerationState,
  type PreparedGenerationState,
} from "./generation-service";

test("generated image crops are centered and preserve exact requested ratio", () => {
  const wide = getExactCenterCropDimensions({ width: 1536, height: 1024, ratio: "21:9" });
  assert.equal(wide.width / 21, wide.height / 9);
  assert.equal(wide.left, Math.floor((1536 - wide.width) / 2));
  assert.equal(wide.top, Math.floor((1024 - wide.height) / 2));

  const standardWide = getExactCenterCropDimensions({ width: 1536, height: 1024, ratio: "16:9" });
  assert.equal(standardWide.width / 16, standardWide.height / 9);

  const portrait = getExactCenterCropDimensions({ width: 1024, height: 1536, ratio: "9:16" });
  assert.equal(portrait.width / 9, portrait.height / 16);
  assert.equal(portrait.left, Math.floor((1024 - portrait.width) / 2));
});

test("image generator keeps the card prompt separate from connected text references", () => {
  const prompt = buildImageGeneratorPrompt(
    {
      imageGeneratorContext: {
        textReferences: [
          {
            nodeId: "assistant-1",
            title: "Assistant #1",
            content: "1. Autumn garden\n2. Winter garden",
            sourceKind: "assistant",
          },
        ],
      },
    } as never,
    "Create an autumn concept",
  );

  assert.match(prompt, /PRIMARY DIRECTION\nCreate an autumn concept/);
  assert.match(prompt, /CONNECTED TEXT REFERENCE MATERIAL\n\[1\] Assistant #1/);
  assert.match(prompt, /Follow PRIMARY DIRECTION as the requested outcome/);
  assert.doesNotMatch(prompt, /IMAGE GENERATOR TASK/);
});

test("image generator prevents an unprompted list from being blended into one image", () => {
  const prompt = buildImageGeneratorPrompt(
    {
      imageGeneratorContext: {
        textReferences: [
          {
            nodeId: "assistant-1",
            title: "Assistant #1",
            content: "1. Autumn garden\n2. Winter garden",
            sourceKind: "assistant",
          },
        ],
      },
    } as never,
    "",
  );

  assert.match(prompt, /No direct direction was entered/);
  assert.match(prompt, /choose one coherent option for this image/);
  assert.match(prompt, /do not blend contradictory options together/);
});

test("review and rejection decisions stop before the image provider", async () => {
  for (const decision of ["require_review", "reject"] as const) {
    let providerCalls = 0;
    const state: PreparedGenerationState = {
      editBrief: {} as CarverEditBrief,
      compiledPromptMeta: null,
      compiledPromptV2: { plan: { decision } } as never,
      finalPrompt: "Provider prompt must not be used.",
    };

    await assert.rejects(
      executeGeneratedImageJob(
        {
          jobId: `job-decision-${decision}`,
          projectId: "project-1",
          userId: "user-1",
          targetType: "image-generator",
          executionMode: "text_to_image",
        } as CarverAiJobPayload,
        state,
        {
          dependencies: {
            generateImagesFromPrompt: async () => {
              providerCalls += 1;
              return [];
            },
          },
        },
      ),
      new RegExp(`Generation decision gate blocked provider execution: ${decision}`),
    );

    assert.equal(providerCalls, 0, decision);
  }
});

test("camera-shot generation rejects any execution mode other than image_edit", async () => {
  await assert.rejects(
    prepareGenerationState(
      {
        jobType: "generate_concept",
        executionMode: "text_to_image",
      } as CarverAiJobPayload,
      {
        shotSetNodeId: "camera-set-1",
        shotId: "shot-01",
        shotName: "Camera 01",
        order: 0,
        mode: "orbit",
        orbit: { rotate: -42, tilt: 0, distance: 7.5, lens: 35 },
      },
    ),
    /requires image_edit execution mode/,
  );
});

test("orbit prompt reaches the image provider prompt field", async () => {
  const imageBuffer = Buffer.from(TEST_PNG_BASE64, "base64");
  const shot = normalizeCameraShotDirective({
    shot: {
      shotSetNodeId: "camera-set-1",
      shotId: "shot-01",
      shotName: "Camera 01",
      order: 0,
      mode: "orbit" as const,
      orbit: { rotate: -41.96062127060776, tilt: -0.06290910766336777, distance: 7.5, lens: 35 },
    },
    inputAssetIds: ["asset-source"],
  });
  const source = {
    nodeId: "source-image",
    title: "Existing courtyard",
    imageUrl: "",
    assetId: "asset-source",
    role: "direct_edit_target",
    prompt: null,
  };
  const job: CarverAiJobPayload = {
    jobId: "job-orbit-prompt",
    projectId: "project-1",
    userId: "user-1",
    jobType: "generate_concept",
    executionMode: "image_edit",
    targetType: "image-generator",
    prompt: "",
    promptMode: "auto",
    inputSnapshotId: null,
    snapshot: createEmptyCanvasSnapshotDocument(),
    referenceAssetIds: [],
    inputAssetIds: ["asset-source"],
    outputCount: 1,
    canvasGraphContext: {
      target: source,
      imageReferences: [],
      presetReferences: [],
      preserveRules: [],
      referenceSummary: "Camera source image.",
      connectionSummary: "Orbit camera connected.",
    },
    imageGeneratorContext: {
      nodeId: "generator-1",
      nodeTitle: "Image Generator",
      imageReferences: [],
      presetReferences: [],
      textReferences: [{
        nodeId: shot.shotSetNodeId,
        title: "Multi-Angles",
        content: "Application camera metadata",
        sourceKind: "camera-shot-set",
      }],
      cameraShotSet: {
        shotSetNodeId: shot.shotSetNodeId,
        source,
        shots: [shot],
      },
      connectionSummary: "Orbit camera connected.",
    },
    cameraShotSetContext: {
      shotSetNodeId: shot.shotSetNodeId,
      source,
      shots: [shot],
    },
  };
  const state = await prepareGenerationState(job, shot);

  assert.ok(state.novelViewRequest);
  assert.deepEqual(state.novelViewRequest.cameraSpec, shot.cameraSpec);
  assert.match(state.finalPrompt ?? "", /front-left three-quarter view/);
  assert.match(state.finalPrompt ?? "", /azimuth -42°/);
  assert.doesNotMatch(state.finalPrompt ?? "", /Camera 01/);

  let providerPrompt = "";
  await executeGeneratedImageJob(job, state, {
    dependencies: {
      findReusableGeneratedImageAsset: async () => null,
      findReusableGeneratedImageAssets: async () => [],
      resolveGenerationTargetImage: async () => ({ buffer: imageBuffer, mimeType: "image/png" }),
      resolveGenerationReferenceImages: async () => [],
      resolveGenerationMaskImage: async () => null,
      generateImagesFromPrompt: async (params) => {
        providerPrompt = params.prompt;
        return [{
          buffer: imageBuffer,
          mimeType: "image/png",
          width: 1,
          height: 1,
          revisedPrompt: null,
          provider: "fixture",
        }];
      },
      persistGeneratedImageAsset: async (params) => ({
        assetId: "asset-output",
        generatedImage: {
          id: "asset-output",
          assetId: "asset-output",
          title: params.title,
          imageUrl: "",
          width: 1,
          height: 1,
          prompt: params.prompt,
          mimeType: "image/png",
          provider: "fixture",
          cameraShot: params.cameraShot,
        },
      }),
    },
  });

  assert.equal(providerPrompt, state.novelViewRequest.prompt);
  assert.match(providerPrompt, /VIEWPOINT RECONSTRUCTION/);
  assert.match(providerPrompt, /azimuth -42°/);
});

test("multi-angle generation persists a camera-labelled output with n=1", async () => {
  const imageBuffer = Buffer.from(TEST_PNG_BASE64, "base64");
  const shot = {
    shotSetNodeId: "camera-set-1",
    shotId: "camera-1",
    shotName: "Front",
    order: 0,
    mode: "orbit" as const,
    orbit: { rotate: 0, tilt: 0, distance: 7.5, lens: 35 },
  };
  const operation = toChangeAngleOperation({
    shot,
    targetId: "source",
    targetName: "Source",
  });
  assert.ok(operation);
  const novelViewRequest = buildNovelViewGenerationRequest({
    operation,
    sourceImageId: "asset-source",
    prompt: "Camera prompt",
  });
  let providerCalls = 0;
  const result = await executeGeneratedImageJob({
    jobId: "job-camera-1",
    projectId: "project-1",
    userId: "user-1",
    targetType: "image-generator",
    executionMode: "image_edit",
    outputCount: 1,
    aspectRatio: "1:1",
    cameraShotSetContext: {
      shotSetNodeId: shot.shotSetNodeId,
      source: { nodeId: "source", title: "Source", imageUrl: "", assetId: "asset-source", role: "direct_edit_target", prompt: null },
      shots: [shot],
    },
  } as CarverAiJobPayload, {
    editBrief: {} as CarverEditBrief,
    compiledPromptMeta: null,
    compiledPromptV2: null,
    finalPrompt: "Camera prompt",
    cameraShot: shot,
    novelViewRequest,
  }, {
    dependencies: {
      findReusableGeneratedImageAsset: async () => null,
      findReusableGeneratedImageAssets: async () => [],
      resolveGenerationTargetImage: async () => ({ buffer: imageBuffer, mimeType: "image/png" }),
      resolveGenerationReferenceImages: async () => [],
      resolveGenerationMaskImage: async () => null,
      generateImagesFromPrompt: async (params) => {
        providerCalls += 1;
        assert.equal(params.outputCount, 1);
        return [{ buffer: imageBuffer, mimeType: "image/png", width: 1, height: 1, revisedPrompt: null, provider: "fixture" }];
      },
      persistGeneratedImageAsset: async (params) => ({
        assetId: "asset-camera-1",
        generatedImage: {
          id: "asset-camera-1", assetId: "asset-camera-1", title: params.title, imageUrl: "", width: 1, height: 1,
          prompt: params.prompt, mimeType: "image/png", provider: "fixture", cameraShot: params.cameraShot,
        },
      }),
    },
  });

  assert.equal(providerCalls, 1);
  assert.equal(result.jobResult.generatedImages[0]?.cameraShot?.shotId, shot.shotId);
  assert.match(result.jobResult.generatedImages[0]?.title ?? "", /Camera 01 - Front/);
});

test("image generator worker persists every fake provider output without OpenAI, R2, or Supabase", async () => {
  const imageBuffer = Buffer.from(TEST_PNG_BASE64, "base64");
  const providerImages: OpenAiGeneratedImage[] = [0, 1].map((index) => ({
    buffer: imageBuffer,
    mimeType: "image/png",
    width: 1,
    height: 1,
    revisedPrompt: `Fixture output ${index + 1}`,
    provider: "fake-openai-images",
  }));
  const persisted: Array<{ outputIndex?: number; title: string }> = [];
  let providerCalls = 0;

  const job = {
    jobId: "job-1",
    projectId: "project-1",
    userId: "user-1",
    targetType: "image-generator",
    executionMode: "text_to_image",
    outputCount: 2,
    aspectRatio: "1:1",
  } as CarverAiJobPayload;
  const state: PreparedGenerationState = {
    editBrief: {} as CarverEditBrief,
    compiledPromptMeta: null,
    compiledPromptV2: null,
    finalPrompt: "Create a koi garden concept.",
  };

  const result = await executeGeneratedImageJob(job, state, {
    dependencies: {
      findReusableGeneratedImageAsset: async () => null,
      resolveGenerationTargetImage: async () => null,
      resolveGenerationReferenceImages: async () => [],
      resolveGenerationMaskImage: async () => null,
      generateImagesFromPrompt: async (params) => {
        providerCalls += 1;
        assert.equal(params.outputCount, 2);
        return providerImages;
      },
      persistGeneratedImageAsset: async (params) => {
        persisted.push({ outputIndex: params.outputIndex, title: params.title });
        const generatedImage: PersistedGeneratedImage = {
          id: `asset-${params.outputIndex}`,
          assetId: `asset-${params.outputIndex}`,
          title: params.title,
          imageUrl: "",
          width: params.width,
          height: params.height,
          mimeType: params.mimeType,
          prompt: params.prompt,
          provider: params.provider,
        };
        return { assetId: `asset-${params.outputIndex}`, generatedImage };
      },
    },
  });

  assert.equal(providerCalls, 1);
  assert.deepEqual(persisted, [
    { outputIndex: 0, title: "Generated concept 1" },
    { outputIndex: 1, title: "Generated concept 2" },
  ]);
  assert.deepEqual(result.jobResult.outputAssetIds, ["asset-0", "asset-1"]);
});

test("a retry reuses a persisted image-generator output after a post-persist failure", async () => {
  const prompt = "Create a koi garden concept.";
  let reusableOutput: PersistedGeneratedOutput | null = null;
  let providerCalls = 0;
  let persistedOutputCount = 0;
  const job = {
    jobId: "job-retry-1",
    projectId: "project-1",
    userId: "user-1",
    targetType: "image-generator",
    executionMode: "text_to_image",
    outputCount: 1,
    aspectRatio: "1:1",
    simulation: {
      scenario: "fail_after_asset_persisted_once",
      delayMs: 0,
    },
  } as CarverAiJobPayload;
  const state: PreparedGenerationState = {
    editBrief: {} as CarverEditBrief,
    compiledPromptMeta: null,
    compiledPromptV2: null,
    finalPrompt: prompt,
  };
  const dependencies = {
    findReusableGeneratedImageAsset: async () => reusableOutput,
    resolveGenerationTargetImage: async () => null,
    resolveGenerationReferenceImages: async () => [],
    resolveGenerationMaskImage: async () => null,
    generateImagesFromPrompt: async () => {
      providerCalls += 1;
      throw new Error("The provider must not run in this simulated retry test.");
    },
    persistGeneratedImageAsset: async (): Promise<PersistedGeneratedOutput> => {
      persistedOutputCount += 1;
      const persistedOutput: PersistedGeneratedOutput = {
        assetId: "asset-retry-1",
        generatedImage: {
          id: "asset-retry-1",
          assetId: "asset-retry-1",
          title: "Generated concept",
          imageUrl: "",
          width: 1,
          height: 1,
          mimeType: "image/png",
          prompt,
          provider: "fixture",
        },
      };
      reusableOutput = persistedOutput;
      return persistedOutput;
    },
  };

  await assert.rejects(
    executeGeneratedImageJob(job, state, { currentAttempt: 1, dependencies }),
    /temporary simulation failure/,
  );

  const result = await executeGeneratedImageJob(job, state, { currentAttempt: 2, dependencies });

  assert.equal(persistedOutputCount, 1);
  assert.equal(providerCalls, 0);
  assert.deepEqual(result.jobResult.outputAssetIds, ["asset-retry-1"]);
});
