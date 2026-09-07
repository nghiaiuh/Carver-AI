import assert from "node:assert/strict";
import test from "node:test";
import { TEST_PNG_BASE64 } from "@carver/shared/testing/openaiTransport";
import {
  createEmptyCanvasSnapshotDocument,
  normalizeCameraShotDirective,
  type CarverAiJobPayload,
  type CarverEditBrief,
  type PersistedGeneratedImage,
  type AiJobShotInvocationIdentity,
} from "@carver/shared";
import { buildNovelViewGenerationRequest, toChangeAngleOperation } from "@carver/ai/prompt-engine";
import type { OpenAiGeneratedImage } from "../providers/openai/generate-image";
import type { PersistedGeneratedOutput } from "./asset-persistence-service";
import {
  ShotInvocationOutcomeUnknownError,
  type ShotInvocationClaim,
  type ShotInvocationStore,
} from "./shot-invocation-service";
import {
  buildImageGeneratorPrompt,
  executeGeneratedImageJob,
  getExactCenterCropDimensions,
  prepareGenerationState,
  type PreparedGenerationState,
} from "./generation-service";

type InMemoryShotInvocation = {
  identity: AiJobShotInvocationIdentity;
  status: "pending" | "outcome_unknown" | "persisted";
  claimToken: string | null;
  outputAssetId: string | null;
};

const createInMemoryShotInvocationStore = () => {
  const invocations = new Map<string, InMemoryShotInvocation>();
  let claimCounter = 0;
  const keyFor = (identity: AiJobShotInvocationIdentity) => identity.invocationId;

  const store: ShotInvocationStore = {
    claim: async ({ identity }) => {
      const key = keyFor(identity);
      const existing = invocations.get(key);
      if (existing?.status === "persisted" && existing.outputAssetId) {
        return { kind: "persisted", identity, outputAssetId: existing.outputAssetId } satisfies ShotInvocationClaim;
      }
      if (existing?.status === "outcome_unknown") {
        return { kind: "outcome_unknown", identity } satisfies ShotInvocationClaim;
      }
      if (existing?.claimToken) {
        return { kind: "busy", identity } satisfies ShotInvocationClaim;
      }

      const claimToken = `claim-${++claimCounter}`;
      invocations.set(key, {
        identity,
        status: "pending",
        claimToken,
        outputAssetId: null,
      });
      return { kind: "claimed", identity, claimToken } satisfies ShotInvocationClaim;
    },
    markOutcomeUnknown: async ({ identity, claimToken }) => {
      const invocation = invocations.get(keyFor(identity));
      assert.equal(invocation?.claimToken, claimToken);
      assert.equal(invocation?.status, "pending");
      if (invocation) {
        invocation.status = "outcome_unknown";
      }
    },
    markPersisted: async ({ identity, outputAssetId, claimToken }) => {
      const key = keyFor(identity);
      const invocation = invocations.get(key);
      if (!invocation) {
        invocations.set(key, {
          identity,
          status: "persisted",
          claimToken: null,
          outputAssetId,
        });
        return;
      }
      if (claimToken) {
        assert.equal(invocation.claimToken, claimToken);
      }
      assert.ok(invocation.status === "outcome_unknown" || invocation.status === "persisted");
      invocation.status = "persisted";
      invocation.outputAssetId = outputAssetId;
    },
  };

  return { store, invocations };
};

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

test("orbit prompt, conditioning manifest, and selected model reach the image provider", async () => {
  const imageBuffer = Buffer.from(TEST_PNG_BASE64, "base64");
  const referenceBuffer = Buffer.from("style-reference-bytes", "utf8");
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
    model: "gpt-image-2-2026-09-01",
    referenceAssetIds: ["asset-style"],
    inputAssetIds: ["asset-source", "asset-style"],
    outputCount: 1,
    canvasGraphContext: {
      target: source,
      imageReferences: [{
        nodeId: "style-node",
        title: "Autumn planting style",
        imageUrl: "",
        assetId: "asset-style",
        role: "style_reference",
      }],
      presetReferences: [],
      preserveRules: [],
      referenceSummary: "Camera source image.",
      connectionSummary: "Orbit camera connected.",
    },
    imageGeneratorContext: {
      nodeId: "generator-1",
      nodeTitle: "Image Generator",
      imageReferences: [{
        nodeId: "style-node",
        title: "Autumn planting style",
        imageUrl: "",
        assetId: "asset-style",
        role: "style_reference",
      }],
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
  let providerModel: string | undefined;
  let providerImageManifest: Array<{ role: string; assetId: string | null; buffer: Buffer }> = [];
  let persistedInvocationId: string | undefined;
  let persistedCandidateId: string | undefined;
  const shotInvocationState = createInMemoryShotInvocationStore();
  const result = await executeGeneratedImageJob(job, state, {
    dependencies: {
      findReusableGeneratedImageAsset: async () => null,
      findReusableGeneratedImageAssets: async () => [],
      resolveGenerationTargetImage: async () => ({
        buffer: imageBuffer,
        mimeType: "image/png",
        assetId: "asset-source",
      }),
      resolveGenerationReferenceImages: async () => [{
        buffer: referenceBuffer,
        mimeType: "image/png",
        assetId: "asset-style",
        contextId: "style-node",
        sourceNodeId: "style-node",
        role: "style_reference",
      }],
      resolveGenerationMaskImage: async () => null,
      shotInvocationStore: shotInvocationState.store,
      generateImagesFromPrompt: async (params) => {
        providerPrompt = params.prompt;
        providerModel = params.model;
        providerImageManifest = (params.imageManifest ?? []).map((image) => ({
          role: image.role,
          assetId: image.assetId,
          buffer: image.buffer,
        }));
        return [{
          buffer: imageBuffer,
          mimeType: "image/png",
          width: 1,
          height: 1,
          revisedPrompt: null,
          provider: params.model ?? "fixture",
        }];
      },
      persistGeneratedImageAsset: async (params) => {
        persistedInvocationId = params.invocationId;
        persistedCandidateId = params.candidateId;
        return {
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
            provider: params.provider,
            cameraShot: params.cameraShot,
          },
        };
      },
    },
  });

  assert.equal(providerPrompt, state.novelViewRequest.prompt);
  assert.equal(providerModel, job.model);
  assert.equal(result.jobResult.generatedImages[0]?.provider, job.model);
  assert.match(persistedInvocationId ?? "", /^shot-invocation:/);
  assert.match(persistedCandidateId ?? "", /^shot-candidate:/);
  assert.deepEqual(providerImageManifest.map((image) => [image.role, image.assetId]), [
    ["authoritative_source", "asset-source"],
    ["reference", "asset-style"],
  ]);
  assert.deepEqual(providerImageManifest.map((image) => image.buffer), [imageBuffer, referenceBuffer]);
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
  const shotInvocationState = createInMemoryShotInvocationStore();
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
      shotInvocationStore: shotInvocationState.store,
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

test("a crash after first-shot asset persistence resumes only the missing camera shot", async () => {
  const imageBuffer = Buffer.from(TEST_PNG_BASE64, "base64");
  const shots = [
    {
      shotSetNodeId: "camera-set-replay",
      shotId: "shot-first",
      shotName: "Front",
      order: 0,
      mode: "orbit" as const,
      orbit: { rotate: 0, tilt: 0, distance: 7.5, lens: 35 },
    },
    {
      shotSetNodeId: "camera-set-replay",
      shotId: "shot-second",
      shotName: "Left corner",
      order: 1,
      mode: "orbit" as const,
      orbit: { rotate: -42, tilt: -18, distance: 7.5, lens: 35 },
    },
  ];
  const source = {
    nodeId: "source-replay",
    title: "Source image",
    imageUrl: "",
    assetId: "asset-source-replay",
    role: "direct_edit_target",
    prompt: null,
  };
  const firstOperation = toChangeAngleOperation({
    shot: shots[0]!,
    targetId: source.nodeId,
    targetName: source.title,
  });
  assert.ok(firstOperation);
  const firstNovelViewRequest = buildNovelViewGenerationRequest({
    operation: firstOperation,
    sourceImageId: source.assetId,
    prompt: "Front camera prompt",
  });
  const job = {
    jobId: "job-multi-angle-replay",
    projectId: "project-1",
    userId: "user-1",
    jobType: "generate_concept",
    executionMode: "image_edit",
    targetType: "image-generator",
    prompt: "Render controlled camera views.",
    promptMode: "auto",
    inputSnapshotId: null,
    snapshot: createEmptyCanvasSnapshotDocument(),
    referenceAssetIds: [],
    inputAssetIds: [source.assetId],
    outputCount: 1,
    canvasGraphContext: {
      target: source,
      imageReferences: [],
      presetReferences: [],
      preserveRules: [],
      referenceSummary: "Camera source image.",
      connectionSummary: "Two camera shots connected.",
    },
    cameraShotSetContext: {
      shotSetNodeId: "camera-set-replay",
      source,
      shots,
    },
  } as CarverAiJobPayload;
  const state: PreparedGenerationState = {
    editBrief: {} as CarverEditBrief,
    compiledPromptMeta: null,
    compiledPromptV2: null,
    finalPrompt: firstNovelViewRequest.prompt,
    cameraShot: shots[0],
    novelViewRequest: firstNovelViewRequest,
  };
  const persistedByShot = new Map<string, PersistedGeneratedOutput>();
  const providerCalls: string[] = [];
  const shotInvocationState = createInMemoryShotInvocationStore();
  let failAfterFirstPersist = true;
  const dependencies = {
    findReusableGeneratedImageAssets: async () => [...persistedByShot.values()],
    resolveGenerationTargetImage: async () => ({ buffer: imageBuffer, mimeType: "image/png" }),
    resolveGenerationReferenceImages: async () => [],
    resolveGenerationMaskImage: async () => null,
    generateImagesFromPrompt: async (params: { prompt: string }) => {
      const shotId = params.prompt.includes("Front camera prompt") ? "shot-first" : "shot-second";
      providerCalls.push(shotId);
      return [{
        buffer: imageBuffer,
        mimeType: "image/png" as const,
        width: 1,
        height: 1,
        revisedPrompt: null,
        provider: "fixture",
      }];
    },
    persistGeneratedImageAsset: async (params: {
      cameraShot?: { shotId: string; shotName: string; order: number; mode: "plan" | "orbit"; shotSetNodeId: string };
      title: string;
      prompt: string;
      width: number;
      height: number;
      mimeType: string;
      provider: string;
    }): Promise<PersistedGeneratedOutput> => {
      const cameraShot = params.cameraShot;
      assert.ok(cameraShot);
      const output: PersistedGeneratedOutput = {
        assetId: `asset-${cameraShot.shotId}`,
        generatedImage: {
          id: `asset-${cameraShot.shotId}`,
          assetId: `asset-${cameraShot.shotId}`,
          title: params.title,
          imageUrl: "",
          width: params.width,
          height: params.height,
          mimeType: params.mimeType,
          prompt: params.prompt,
          provider: params.provider,
          cameraShot,
        },
      };
      persistedByShot.set(cameraShot.shotId, output);
      if (cameraShot.shotId === "shot-first" && failAfterFirstPersist) {
        failAfterFirstPersist = false;
        throw new Error("temporary post-persist interruption");
      }
      return output;
    },
    shotInvocationStore: shotInvocationState.store,
  };

  await assert.rejects(
    executeGeneratedImageJob(job, state, { dependencies }),
    /asset_persistence/,
  );
  assert.deepEqual([...persistedByShot.keys()], ["shot-first"]);

  const replay = await executeGeneratedImageJob(job, state, { dependencies });

  assert.deepEqual(providerCalls, ["shot-first", "shot-second"]);
  assert.deepEqual(replay.jobResult.outputAssetIds, ["asset-shot-first", "asset-shot-second"]);
});

test("an unknown shot outcome stops replay before a duplicate provider call", async () => {
  const imageBuffer = Buffer.from(TEST_PNG_BASE64, "base64");
  const shot = {
    shotSetNodeId: "camera-set-unknown",
    shotId: "shot-unknown",
    shotName: "Front",
    order: 0,
    mode: "plan" as const,
    plan: {
      u: 0,
      v: 0,
      height: 1,
      targetU: 0,
      targetV: 0,
      lens: 35,
      pitch: 0,
      roll: 0,
      viewDirection: "look-at-target" as const,
    },
  };
  let providerCalls = 0;
  const shotInvocationState = createInMemoryShotInvocationStore();
  const job = {
    jobId: "job-outcome-unknown",
    projectId: "project-1",
    userId: "user-1",
    jobType: "generate_concept",
    targetType: "image-generator",
    executionMode: "image_edit",
    cameraShotSetContext: {
      shotSetNodeId: shot.shotSetNodeId,
      source: { nodeId: "source", title: "Source", imageUrl: "", assetId: "asset-source", role: "direct_edit_target", prompt: null },
      shots: [shot],
    },
  } as CarverAiJobPayload;
  const state: PreparedGenerationState = {
    editBrief: {} as CarverEditBrief,
    compiledPromptMeta: null,
    compiledPromptV2: null,
    finalPrompt: "Reconstruct the requested camera view.",
    cameraShot: shot,
    novelViewRequest: null,
  };
  const dependencies = {
    findReusableGeneratedImageAsset: async () => null,
    findReusableGeneratedImageAssets: async () => [],
    resolveGenerationTargetImage: async () => ({ buffer: imageBuffer, mimeType: "image/png", assetId: "asset-source" }),
    resolveGenerationReferenceImages: async () => [],
    resolveGenerationMaskImage: async () => null,
    shotInvocationStore: shotInvocationState.store,
    generateImagesFromPrompt: async () => {
      providerCalls += 1;
      throw new Error("simulated ambiguous provider transport failure");
    },
  };

  await assert.rejects(
    executeGeneratedImageJob(job, state, { dependencies }),
    /provider_request/,
  );
  assert.equal(providerCalls, 1);

  await assert.rejects(
    executeGeneratedImageJob(job, state, { dependencies }),
    (error: unknown) => error instanceof ShotInvocationOutcomeUnknownError,
  );

  assert.equal(providerCalls, 1);
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
