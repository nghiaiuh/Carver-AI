import assert from "node:assert/strict";
import test from "node:test";
import {
  createQueuedOpenAITransport,
  openAIJsonResponse,
  TEST_PNG_BASE64,
} from "@carver/shared/testing/openaiTransport";
import { GenerationStageError } from "../../errors/generation-stage-error";
import type { ProviderImageInput } from "../image-provider";
import {
  buildOpenAiImageGenerationRequestBody,
  generateImagesFromPrompt,
  getOpenAiImageRequestTimeoutMs,
  normalizeOpenAiImageOutputCount,
} from "./generate-image";

const imagePayload = (count: number, value = TEST_PNG_BASE64) => ({
  data: Array.from({ length: count }, (_, index) => ({
    b64_json: value,
    revised_prompt: `Fixture prompt ${index + 1}`,
  })),
});

test("OpenAI image request timeout uses a safe bounded configuration", () => {
  assert.equal(getOpenAiImageRequestTimeoutMs("15000"), 15_000);
  assert.equal(getOpenAiImageRequestTimeoutMs("9999"), 240_000);
  assert.equal(getOpenAiImageRequestTimeoutMs("601000"), 240_000);
  assert.equal(getOpenAiImageRequestTimeoutMs("invalid"), 240_000);
});

test("image generation request forwards the selected output count as OpenAI n", () => {
  const payload = JSON.parse(
    buildOpenAiImageGenerationRequestBody({
      model: "gpt-image-2",
      prompt: "Generate a landscape concept.",
      size: "1536x1024",
      outputCount: 3,
    }),
  ) as Record<string, unknown>;

  assert.equal(payload.n, 3);
  assert.equal("partial_images" in payload, false);
});

test("image generation output count stays within the Canvas limit", () => {
  assert.equal(normalizeOpenAiImageOutputCount(undefined), 1);
  assert.equal(normalizeOpenAiImageOutputCount(0), 1);
  assert.equal(normalizeOpenAiImageOutputCount(3), 3);
  assert.equal(normalizeOpenAiImageOutputCount(12), 4);
});

test("image adapter sends a captured text-to-image request and normalizes multiple fixture outputs", async () => {
  const fake = createQueuedOpenAITransport([openAIJsonResponse(imagePayload(2))]);

  const images = await generateImagesFromPrompt({
    prompt: "Create a Vietnamese koi garden.",
    mode: "text_to_image",
    model: "gpt-image-2",
    size: "1536x1024",
    outputCount: 2,
    transport: fake.transport,
  });

  assert.equal(images.length, 2);
  assert.equal(images[0]?.mimeType, "image/png");
  assert.equal(images[0]?.width, 1);
  assert.equal(images[0]?.height, 1);
  assert.equal(fake.requests.length, 1);

  const request = JSON.parse(String(fake.requests[0]?.init.body)) as Record<string, unknown>;
  assert.equal(request.model, "gpt-image-2");
  assert.equal(request.size, "1536x1024");
  assert.equal(request.n, 2);
  assert.equal("partial_images" in request, false);
});

test("image edit request carries target, references, mask, and output count in multipart form data", async () => {
  const fake = createQueuedOpenAITransport([openAIJsonResponse(imagePayload(2))]);
  const input = { buffer: Buffer.from(TEST_PNG_BASE64, "base64"), mimeType: "image/png" };

  await generateImagesFromPrompt({
    prompt: "Add autumn planting.",
    mode: "region_edit",
    outputCount: 2,
    targetImage: input,
    referenceImages: [input],
    maskImage: input,
    transport: fake.transport,
  });

  const body = fake.requests[0]?.init.body;
  assert.ok(body instanceof FormData);
  assert.match(String(body.get("prompt")), /^Add autumn planting\./);
  assert.equal(body.get("model"), "gpt-image-2");
  assert.equal(body.get("n"), "2");
  assert.equal(body.getAll("image[]").length, 2);
  assert.ok(body.get("mask"));
});

test("image edit maps ordered conditioning roles and bytes while forwarding the selected model", async () => {
  const fake = createQueuedOpenAITransport([openAIJsonResponse(imagePayload(1))]);
  const selectedModel = "gpt-image-2-2026-09-01";
  const source = Buffer.from("authoritative-source", "utf8");
  const cameraGuide = Buffer.from("camera-guide", "utf8");
  const reference = Buffer.from("style-reference", "utf8");
  const mask = Buffer.from("protected-mask", "utf8");
  const imageManifest: ProviderImageInput[] = [
    { role: "authoritative_source", assetId: "asset-source", required: true, buffer: source, mimeType: "image/png" },
    { role: "camera_guide", assetId: "asset-guide", required: true, buffer: cameraGuide, mimeType: "image/png" },
    { role: "reference", assetId: "asset-style", required: true, buffer: reference, mimeType: "image/png" },
    { role: "protected_region", assetId: "asset-mask", required: true, buffer: mask, mimeType: "image/png" },
  ];

  const images = await generateImagesFromPrompt({
    prompt: "Create a controlled view.",
    mode: "image_edit",
    model: selectedModel,
    outputCount: 1,
    imageManifest,
    transport: fake.transport,
  });

  const body = fake.requests[0]?.init.body;
  assert.ok(body instanceof FormData);
  assert.equal(body.get("model"), selectedModel);
  assert.match(String(body.get("prompt")), /Image 1 is the authoritative source image\./);
  assert.match(String(body.get("prompt")), /Image 2 is the camera geometry guide\./);
  assert.match(String(body.get("prompt")), /Image 3 is the connected reference image\./);
  assert.match(String(body.get("prompt")), /native mask applies only to Image 1/);

  const files = body.getAll("image[]") as File[];
  assert.deepEqual(files.map((file) => file.name), [
    "authoritative-source.png",
    "camera-guide-2.png",
    "reference-3.png",
  ]);
  assert.deepEqual(
    await Promise.all(files.map(async (file) => Buffer.from(await file.arrayBuffer()))),
    [source, cameraGuide, reference],
  );
  const maskFile = body.get("mask") as File;
  assert.equal(maskFile.name, "protected-region-mask.png");
  assert.deepEqual(Buffer.from(await maskFile.arrayBuffer()), mask);
  assert.equal(images[0]?.provider, selectedModel);
});

test("image edit rejects provider input over the documented sixteen-image limit without truncation", async () => {
  const fake = createQueuedOpenAITransport([]);
  const source = { role: "authoritative_source" as const, assetId: "asset-source", required: true, buffer: Buffer.from("source"), mimeType: "image/png" };
  const references: ProviderImageInput[] = Array.from({ length: 16 }, (_, index) => ({
    role: "reference",
    assetId: `asset-reference-${index + 1}`,
    required: true,
    buffer: Buffer.from(`reference-${index + 1}`),
    mimeType: "image/png",
  }));

  await assert.rejects(
    generateImagesFromPrompt({
      prompt: "x",
      mode: "image_edit",
      imageManifest: [source, ...references],
      transport: fake.transport,
    }),
    (error: unknown) => error instanceof GenerationStageError && error.providerCode === "too_many_input_images",
  );
  assert.equal(fake.requests.length, 0);
});

test("image adapter maps provider rejection, malformed output, and incomplete output to safe stage errors", async () => {
  const rejection = createQueuedOpenAITransport([
    openAIJsonResponse({ error: { message: "private provider detail", code: "rate_limit" } }, 429),
  ]);
  await assert.rejects(
    generateImagesFromPrompt({ prompt: "x", mode: "text_to_image", transport: rejection.transport }),
    (error: unknown) =>
      error instanceof GenerationStageError &&
      error.stage === "provider_request" &&
      error.providerStatus === 429 &&
      error.providerCode === "rate_limit" &&
      !error.message.includes("private provider detail"),
  );

  const malformed = createQueuedOpenAITransport([openAIJsonResponse({ data: [] })]);
  await assert.rejects(
    generateImagesFromPrompt({ prompt: "x", mode: "text_to_image", transport: malformed.transport }),
    (error: unknown) => error instanceof GenerationStageError && error.stage === "provider_request",
  );

  const incomplete = createQueuedOpenAITransport([openAIJsonResponse(imagePayload(1))]);
  await assert.rejects(
    generateImagesFromPrompt({ prompt: "x", mode: "text_to_image", outputCount: 2, transport: incomplete.transport }),
    (error: unknown) =>
      error instanceof GenerationStageError && error.providerCode === "incomplete_image_output_count",
  );
});

test("image adapter rejects invalid image bytes and a transport timeout without making a network call", async () => {
  const invalidImage = createQueuedOpenAITransport([openAIJsonResponse(imagePayload(1, "not-an-image"))]);
  await assert.rejects(
    generateImagesFromPrompt({ prompt: "x", mode: "text_to_image", transport: invalidImage.transport }),
    (error: unknown) => error instanceof GenerationStageError && error.stage === "provider_request",
  );

  const timeout = new Error("fixture timeout");
  timeout.name = "AbortError";
  const timedOut = createQueuedOpenAITransport([timeout]);
  await assert.rejects(
    generateImagesFromPrompt({ prompt: "x", mode: "text_to_image", transport: timedOut.transport }),
    (error: unknown) => error instanceof GenerationStageError && error.stage === "provider_request",
  );
});
