import assert from "node:assert/strict";
import test from "node:test";
import { TEST_PNG_BASE64 } from "@carver/shared/testing/openaiTransport";
import type { CarverAiJobPayload, CarverEditBrief, PersistedGeneratedImage } from "@carver/shared";
import type { OpenAiGeneratedImage } from "../providers/openai/generate-image";
import type { PersistedGeneratedOutput } from "./asset-persistence-service";
import {
  buildImageGeneratorPrompt,
  executeGeneratedImageJob,
  getExactCenterCropDimensions,
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
