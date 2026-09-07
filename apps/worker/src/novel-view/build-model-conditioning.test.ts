import assert from "node:assert/strict";
import test from "node:test";
import {
  createEmptyCanvasSnapshotDocument,
  normalizeCameraShotDirective,
  type CarverAiJobPayload,
  type GenerationPromptResultV2,
} from "@carver/shared";
import {
  buildModelConditioning,
  hashSourceImageContent,
  ModelConditioningAssemblyError,
} from "./build-model-conditioning";

const SOURCE_ASSET_ID = "asset-source";

const makeShot = () =>
  normalizeCameraShotDirective({
    shot: {
      shotSetNodeId: "camera-set-1",
      shotId: "shot-1",
      shotName: "Front-left",
      order: 0,
      mode: "orbit",
      orbit: { rotate: -42, tilt: 8, distance: 7.5, lens: 35 },
    },
    aspectRatio: 16 / 9,
    inputAssetIds: [SOURCE_ASSET_ID],
  });

const makeCompiledPrompt = (): GenerationPromptResultV2 => {
  const shot = makeShot();
  return {
    engineVersion: "2",
    engineRunId: "engine-run-1",
    planHash: "plan-hash-1",
    contextRevision: 4,
    providerPrompt: "This provider prose must not be embedded into ModelConditioning.",
    warnings: [],
    interpreter: {
      model: "test-interpreter",
      latencyMs: 0,
      attemptCount: 1,
      fallbackReason: null,
    },
    plan: {
      schemaVersion: 2,
      purpose: "generation",
      executionMode: "image_edit",
      rawGoal: "Create the requested camera view without altering the pond.",
      cameraShot: shot,
      operations: [{
        operationId: "operation-1",
        type: "modify_attribute",
        targetContextId: "pond-1",
        attribute: "viewpoint",
        value: "front-left camera",
      }],
      target: {
        value: {
          contextId: "source-node",
          title: "Canonical source",
          assetId: SOURCE_ASSET_ID,
          source: "canvas_target",
        },
        source: "trusted_context",
        evidence: ["canonical source"],
      },
      references: [],
      constraints: [
        {
          id: "preserve-layout",
          type: "preserve_layout",
          source: "system_policy",
          severity: "hard",
          description: "Preserve the exact site footprint and path positions.",
        },
        {
          id: "preserve-region",
          type: "preserve_region",
          source: "trusted_context",
          severity: "hard",
          regionId: "region-locked",
          description: "Keep the locked planting region unchanged.",
        },
        {
          id: "forbid-addition",
          type: "forbid_addition",
          source: "system_policy",
          severity: "hard",
          description: "Do not add new structures.",
        },
      ],
      decision: "continue",
      risk: { level: "low", reasons: [] },
      reviewReasons: [],
      degraded: false,
    },
    executionTarget: {
      contextId: "source-node",
      title: "Canonical source",
      assetId: SOURCE_ASSET_ID,
      source: "canvas_target",
    },
    validatedReferences: [],
    revalidation: {
      projectScoped: true,
      snapshotScoped: false,
      expectedContextRevision: 4,
      referenceContextIds: [],
      requiredAssetIds: [SOURCE_ASSET_ID],
      requiresMask: false,
      requiresTarget: true,
    },
  };
};

const makeJob = (): CarverAiJobPayload => {
  const shot = makeShot();
  const snapshot = createEmptyCanvasSnapshotDocument();
  const source = {
    nodeId: "source-node",
    title: "Canonical source",
    imageUrl: "",
    assetId: SOURCE_ASSET_ID,
    role: "direct_edit_target",
    prompt: null,
  };

  return {
    jobId: "job-1",
    projectId: "project-1",
    userId: "user-1",
    jobType: "generate_concept",
    executionMode: "image_edit",
    targetType: "image-generator",
    prompt: "Create a controlled camera view.",
    model: "provider-model-that-must-not-affect-conditioning",
    inputSnapshotId: null,
    promptMode: "auto",
    snapshot: {
      ...snapshot,
      selection: {
        ...snapshot.selection,
        objectIds: [],
        regionIds: ["region-user-selected"],
      },
    },
    referenceAssetIds: ["asset-style", "asset-material"],
    inputAssetIds: [SOURCE_ASSET_ID, "asset-style", "asset-material"],
    canvasGraphContext: {
      target: source,
      imageReferences: [
        {
          nodeId: "style-node",
          title: "Style reference",
          imageUrl: "",
          assetId: "asset-style",
          role: "style_reference",
        },
      ],
      presetReferences: [
        {
          nodeId: "material-group",
          category: "materials",
          childId: "stone",
          slot: null,
          label: "Stone reference",
          imageSrc: "",
          assetId: "asset-material",
          role: "material_reference",
        },
      ],
      preserveRules: ["Preserve the pond outline.", "Preserve the house position."],
      referenceSummary: "Two connected references.",
      connectionSummary: "Source plus style and material references.",
    },
    cameraShotSetContext: {
      shotSetNodeId: shot.shotSetNodeId,
      source,
      shots: [shot],
    },
  };
};

const buildFixtureConditioning = (job = makeJob()) => {
  const sourceBytes = Buffer.from("authoritative-source-pixels", "utf8");
  return buildModelConditioning({
    job,
    cameraShot: job.cameraShotSetContext!.shots[0]!,
    compiledPrompt: makeCompiledPrompt(),
    source: {
      assetId: SOURCE_ASSET_ID,
      width: 1280,
      height: 720,
      mimeType: "image/png",
      contentHash: hashSourceImageContent(sourceBytes),
    },
  });
};

test("ModelConditioning has a stable hash independent of provider choice and graph reference order", () => {
  const first = buildFixtureConditioning();
  const reorderedJob = makeJob();
  reorderedJob.model = "a-different-provider-model";
  reorderedJob.canvasGraphContext = {
    ...reorderedJob.canvasGraphContext!,
    imageReferences: [...reorderedJob.canvasGraphContext!.imageReferences].reverse(),
    presetReferences: [...reorderedJob.canvasGraphContext!.presetReferences].reverse(),
  };
  const second = buildFixtureConditioning(reorderedJob);

  assert.equal(first.conditioningHash, second.conditioningHash);
  assert.equal(first.conditioningId, `model-conditioning:${first.conditioningHash}`);
  assert.equal(first.sceneEvidence.status, "unavailable");
  assert.deepEqual(first.sceneEvidence.degradationCodes, ["SCENE_EVIDENCE_NOT_BUILT"]);
  assert.deepEqual(first.referenceImages.map((reference) => reference.role), ["material", "style"]);
  assert.deepEqual(first.constraints.protectedRegionIds, ["region-locked", "region-user-selected"]);
  assert.match(first.instructions.changeOnly.join("\n"), /without altering the pond/);
});

test("ModelConditioning changes when semantic reference roles or canonical source content change", () => {
  const first = buildFixtureConditioning();
  const roleChangedJob = makeJob();
  roleChangedJob.canvasGraphContext = {
    ...roleChangedJob.canvasGraphContext!,
    imageReferences: [{
      ...roleChangedJob.canvasGraphContext!.imageReferences[0]!,
      role: "layout_reference",
    }],
  };
  const roleChanged = buildFixtureConditioning(roleChangedJob);
  const changedSource = buildModelConditioning({
    job: makeJob(),
    cameraShot: makeShot(),
    compiledPrompt: makeCompiledPrompt(),
    source: {
      assetId: SOURCE_ASSET_ID,
      width: 1280,
      height: 720,
      mimeType: "image/png",
      contentHash: hashSourceImageContent(Buffer.from("changed-source-pixels", "utf8")),
    },
  });

  assert.notEqual(first.conditioningHash, roleChanged.conditioningHash);
  assert.notEqual(first.conditioningHash, changedSource.conditioningHash);
});

test("ModelConditioning serializes only stable semantic data, never provider transport data or source bytes", () => {
  const conditioning = buildFixtureConditioning();
  const serialized = JSON.stringify(conditioning);
  const providerOnlyKeys = new Set([
    "provider",
    "endpoint",
    "formData",
    "outputCount",
    "candidateIds",
    "uploadId",
    "fileId",
    "requestBody",
  ]);
  const foundProviderOnlyKeys: string[] = [];
  const visit = (value: unknown) => {
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (providerOnlyKeys.has(key)) foundProviderOnlyKeys.push(key);
      visit(child);
    }
  };
  visit(conditioning);

  assert.deepEqual(foundProviderOnlyKeys, []);
  assert.doesNotMatch(serialized, /authoritative-source-pixels|https?:\/\/|data:image/i);
  assert.match(serialized, /asset-source/);
  assert.match(serialized, /sha256:/);
});

test("ModelConditioning fails closed when a legacy shot lacks CameraSpec or evidence mismatches", () => {
  const job = makeJob();
  const legacyShot = {
    ...job.cameraShotSetContext!.shots[0]!,
    cameraSpec: undefined,
  };

  assert.throws(
    () => buildModelConditioning({
      job: {
        ...job,
        cameraShotSetContext: {
          ...job.cameraShotSetContext!,
          shots: [legacyShot],
        },
      },
      cameraShot: legacyShot,
      compiledPrompt: makeCompiledPrompt(),
      source: {
        assetId: SOURCE_ASSET_ID,
        width: 1280,
        height: 720,
        mimeType: "image/png",
        contentHash: hashSourceImageContent(Buffer.from("authoritative-source-pixels", "utf8")),
      },
    }),
    ModelConditioningAssemblyError,
  );

  const sourceHash = hashSourceImageContent(Buffer.from("authoritative-source-pixels", "utf8"));
  assert.throws(
    () => buildModelConditioning({
      job,
      cameraShot: job.cameraShotSetContext!.shots[0]!,
      compiledPrompt: makeCompiledPrompt(),
      source: { assetId: "asset-other", width: 1280, height: 720, mimeType: "image/png", contentHash: sourceHash },
    }),
    /Resolved source asset/,
  );
  assert.throws(
    () => buildModelConditioning({
      job,
      cameraShot: job.cameraShotSetContext!.shots[0]!,
      compiledPrompt: makeCompiledPrompt(),
      source: { assetId: SOURCE_ASSET_ID, width: 1280, height: 720, mimeType: "image/png", contentHash: sourceHash },
      sceneEvidence: {
        ...buildFixtureConditioning().sceneEvidence,
        sourceContentHash: "sha256:not-the-source",
      },
    }),
    /Scene evidence content hash/,
  );
});
