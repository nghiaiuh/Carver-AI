import assert from "node:assert/strict";
import test from "node:test";
import { createQueuedOpenAITransport, openAIJsonResponse } from "@carver/shared/testing/openaiTransport";
import type { PromptEngineTrustedContext, PromptInterpreterResult } from "@carver/shared";
import { compileGenerationPromptV2 } from "./server";

const trustedContext: PromptEngineTrustedContext = {
  projectId: "project-1",
  contextRevision: 7,
  snapshotId: "snapshot-1",
  executionMode: "text_to_image",
  target: null,
  availableTargets: [],
  availableReferences: [],
  selectedObjectIds: [],
  selectedRegionIds: [],
  lockedObjectIds: [],
  locks: [],
  mask: null,
  explicitConstraints: { preserve: [] },
};

const validInterpretation: PromptInterpreterResult = {
  executionMode: "text_to_image",
  targetHint: null,
  operations: [{ type: "restyle", style: "warm autumn landscape" }],
  references: [],
  preserveRequests: [],
  avoidRequests: [],
  notes: [],
};

const interpreterResponse = (value: unknown) =>
  openAIJsonResponse({ output_text: JSON.stringify(value) });

test("prompt interpreter uses injected transport and compiles a stable plan without an OpenAI key", async () => {
  const first = createQueuedOpenAITransport([interpreterResponse(validInterpretation)]);
  const second = createQueuedOpenAITransport([interpreterResponse(validInterpretation)]);

  const [firstResult, secondResult] = await Promise.all([
    compileGenerationPromptV2({
      rawPrompt: "Create a calm koi garden.",
      trustedContext,
      forceModel: true,
      transport: first.transport,
    }),
    compileGenerationPromptV2({
      rawPrompt: "Create a calm koi garden.",
      trustedContext,
      forceModel: true,
      transport: second.transport,
    }),
  ]);

  assert.equal(firstResult.planHash, secondResult.planHash);
  assert.equal(firstResult.plan.degraded, false);
  assert.equal(first.requests.length, 1);

  const body = JSON.parse(String(first.requests[0]?.init.body)) as {
    input: Array<{ content: Array<{ text: string }> }>;
  };
  assert.match(body.input[0]!.content[0]!.text, /Raw prompt: Create a calm koi garden\./);
});

test("prompt interpreter retries malformed structured output once with a repair hint", async () => {
  const fake = createQueuedOpenAITransport([
    openAIJsonResponse({ output_text: "not-json" }),
    interpreterResponse(validInterpretation),
  ]);

  const result = await compileGenerationPromptV2({
    rawPrompt: "Create a landscape concept.",
    trustedContext,
    forceModel: true,
    transport: fake.transport,
  });

  assert.equal(result.plan.degraded, false);
  assert.equal(result.interpreter.attemptCount, 2);
  assert.equal(fake.requests.length, 2);
  const repairBody = JSON.parse(String(fake.requests[1]?.init.body)) as {
    input: Array<{ content: Array<{ text: string }> }>;
  };
  assert.match(repairBody.input[0]!.content[0]!.text, /Repair hint:/);
});

test("prompt interpreter provider failures degrade safely without exposing the raw provider message", async () => {
  const providerSecret = "provider private detail for a customer prompt";
  const fake = createQueuedOpenAITransport([
    openAIJsonResponse({ error: { message: providerSecret, code: "invalid_request" } }, 400),
  ]);

  const result = await compileGenerationPromptV2({
    rawPrompt: "Create a landscape concept.",
    trustedContext,
    forceModel: true,
    transport: fake.transport,
  });

  assert.equal(result.plan.degraded, true);
  assert.equal(result.interpreter.attemptCount, 1);
  assert.doesNotMatch(result.interpreter.fallbackReason ?? "", /provider private detail/);
  assert.ok(result.warnings.some((warning) => warning.code === "INTERPRETER_FALLBACK"));
});

test("camera metadata bypasses the language interpreter and is compiled afterward", async () => {
  const fake = createQueuedOpenAITransport([
    interpreterResponse({
      ...validInterpretation,
      executionMode: "image_edit",
      operations: [],
      preserveRequests: ["Keep the pond unchanged."],
    }),
  ]);
  const cameraContext: PromptEngineTrustedContext = {
    ...trustedContext,
    executionMode: "image_edit",
    target: {
      contextId: "site-image",
      title: "Existing courtyard",
      source: "canvas_target",
    },
    availableTargets: [],
    cameraShot: {
      shotSetNodeId: "camera-set-1",
      shotId: "shot-01",
      shotName: "Camera 01",
      order: 0,
      mode: "orbit",
      orbit: {
        rotate: -41.96062127060776,
        tilt: -0.06290910766336777,
        distance: 7.5,
        lens: 35,
      },
    },
  };

  const result = await compileGenerationPromptV2({
    rawPrompt: "Keep the pond unchanged.",
    trustedContext: cameraContext,
    forceModel: true,
    transport: fake.transport,
  });
  const body = JSON.parse(String(fake.requests[0]?.init.body)) as {
    input: Array<{ content: Array<{ text: string }> }>;
  };
  const interpreterPrompt = body.input[0]!.content[0]!.text;

  assert.match(interpreterPrompt, /Raw prompt: Keep the pond unchanged\./);
  assert.doesNotMatch(interpreterPrompt, /AUTHORIZED CAMERA SHOT/);
  assert.doesNotMatch(interpreterPrompt, /azimuth/i);
  assert.doesNotMatch(interpreterPrompt, /-41\.96062127060776/);
  assert.match(result.providerPrompt, /front-left three-quarter view/);
  assert.match(result.providerPrompt, /azimuth -42°/);
  assert.match(result.providerPrompt, /APPROVED SEMANTIC PLAN/);
  assert.match(result.providerPrompt, /Keep the pond unchanged\./);
  assert.doesNotMatch(result.providerPrompt, /Camera 01/);
});

test("camera-only generation skips the language interpreter and compiles the orbit prompt", async () => {
  const fake = createQueuedOpenAITransport([]);
  const result = await compileGenerationPromptV2({
    rawPrompt: "",
    trustedContext: {
      ...trustedContext,
      executionMode: "image_edit",
      target: {
        contextId: "site-image",
        title: "Existing courtyard",
        source: "canvas_target",
      },
      availableTargets: [],
      cameraShot: {
        shotSetNodeId: "camera-set-1",
        shotId: "shot-01",
        shotName: "Camera 01",
        order: 0,
        mode: "orbit",
        orbit: { rotate: -42, tilt: 0, distance: 7.5, lens: 35 },
      },
    },
    forceModel: true,
    transport: fake.transport,
  });

  assert.equal(fake.requests.length, 0);
  assert.equal(result.plan.degraded, false);
  assert.equal(result.interpreter.attemptCount, 0);
  assert.match(result.providerPrompt, /VIEWPOINT RECONSTRUCTION/);
  assert.match(result.providerPrompt, /front-left three-quarter view/);
});
