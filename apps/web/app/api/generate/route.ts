/*
 * Route: API generate anh tu canvas context.
 * Thuoc: module AI generation / image rendering.
 * Vai tro: nhan payload generate tu canvas, bien doi prompt va goi model tao anh.
 * Chuc nang:
 * - xac thuc request.
 * - tong hop prompt da enhance tu prompt engine.
 * - gan snapshot, graph context va rules bao toan bo cuc.
 * - goi OpenAI Image API va tra ve anh + prompt metadata cho frontend.
 */

import { NextResponse } from "next/server";
import { buildConnectedGenerationBrief, buildSnapshotAwareEditBrief } from "@carver/ai";
import { compileFinalPrompt, type PromptMode } from "@carver/ai/prompt-engine";
import { coerceCanvasSnapshotDocument, isCanvasSnapshotDocument, type GeneratedCanvasImage } from "@carver/shared";
import {
  OPENAI_IMAGE_MODEL,
  OPENAI_IMAGE_OUTPUT_FORMAT,
  OPENAI_IMAGE_QUALITY,
  OPENAI_IMAGE_SIZE,
  OPENAI_IMAGE_PARTIAL_IMAGES,
  OPENAI_IMAGES_URL,
} from "../../../lib/constants";
import { getRequestContext } from "../_lib/auth";
import { badRequest, readJsonObject, stringValue } from "../_lib/http";

const promptModes: PromptMode[] = ["auto", "review", "expert"];

type GenerateRequestBody = Record<string, unknown>;
type CanvasGraphContext = Record<string, unknown>;

const arrayValue = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

const snapshotValue = (value: unknown) => (isCanvasSnapshotDocument(value) ? coerceCanvasSnapshotDocument(value) : undefined);

function promptModeValue(value: unknown): PromptMode {
  return typeof value === "string" && promptModes.includes(value as PromptMode) ? (value as PromptMode) : "auto";
}

function canvasGraphContextValue(body: GenerateRequestBody): CanvasGraphContext | undefined {
  const value = body.canvasGraphContext;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as CanvasGraphContext;
}

function getOpenAIImageUrl(image: { b64_json?: string; url?: string }) {
  return image.b64_json ? `data:image/png;base64,${image.b64_json}` : image.url;
}

function getImageMimeType(format: string) {
  if (format === "jpeg" || format === "jpg") return "image/jpeg";
  if (format === "webp") return "image/webp";
  return "image/png";
}

function parseImageSize(size: string): { width: number; height: number } {
  const [width, height] = size.split("x").map(Number);

  if (!width || !height) {
    return { width: 1024, height: 1024 };
  }

  return { width, height };
}

const { width, height } = parseImageSize(OPENAI_IMAGE_SIZE);

function buildGeneratedImage(params: {
  prompt: string;
  image: { b64_json?: string; url?: string; revised_prompt?: string };
}): GeneratedCanvasImage {
  const imageUrl = getOpenAIImageUrl(params.image);
  if (!imageUrl) {
    throw new Error("Image generation returned no image.");
  }

  return {
    id: `generated-${Date.now()}`,
    title: "Generated concept",
    imageUrl,
    width,
    height,
    prompt: params.image.revised_prompt || params.prompt,
    mimeType: getImageMimeType(OPENAI_IMAGE_OUTPUT_FORMAT),
    provider: OPENAI_IMAGE_MODEL,
  };
}

function buildPromptMeta(params: {
  rawPrompt: string;
  originalRawPrompt: string | undefined;
  body: GenerateRequestBody;
  compiledPrompt: Awaited<ReturnType<typeof compileFinalPrompt>>;
  snapshotAwareBrief: ReturnType<typeof buildSnapshotAwareEditBrief> | undefined;
  connectedBrief: ReturnType<typeof buildSnapshotAwareEditBrief> | undefined;
  canvasGraphContext: CanvasGraphContext | undefined;
  promptMode: PromptMode;
  debugPrompt: boolean;
}) {
  return {
    userSubmittedPrompt: params.rawPrompt,
    originalRawPrompt: params.originalRawPrompt,
    wasEnhanced: params.body.wasEnhanced === true,
    taskType: params.compiledPrompt.taskType,
    editScope: params.compiledPrompt.editScope,
    riskLevel: params.compiledPrompt.riskLevel,
    targetArea: params.compiledPrompt.targetArea,
    targetObject: params.compiledPrompt.targetObject,
    preserveRules: params.compiledPrompt.preserveRules,
    negativeConstraints: params.compiledPrompt.negativeConstraints,
    formulaUsed: params.compiledPrompt.formulaUsed,
    editBrief: params.compiledPrompt.editBrief,
    snapshotAwareBrief: params.connectedBrief ?? params.snapshotAwareBrief,
    canvasGraphContext: params.canvasGraphContext,
    shouldShowReview: params.compiledPrompt.shouldShowReview,
    ...(params.promptMode === "expert" || params.debugPrompt
      ? { enhancedPromptVisible: params.compiledPrompt.enhancedPrompt }
      : {}),
  };
}

type OpenAIImageGenerationResponse = {
  data?: Array<{
    b64_json?: string;
    url?: string;
    revised_prompt?: string;
  }>;
  error?: {
    message?: string;
  };
};

async function generateImageFromPrompt(prompt: string): Promise<GeneratedCanvasImage> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required to generate images.");
  }

  const response = await fetch(OPENAI_IMAGES_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_IMAGE_MODEL,
      prompt,
      size: OPENAI_IMAGE_SIZE,
      quality: OPENAI_IMAGE_QUALITY,
      output_format: OPENAI_IMAGE_OUTPUT_FORMAT,
      partial_images: OPENAI_IMAGE_PARTIAL_IMAGES,
      n: 1,
    }),
  });
  const payload = (await response.json().catch(() => ({}))) as OpenAIImageGenerationResponse;

  if (!response.ok) {
    throw new Error(payload.error?.message || "Image generation failed.");
  }

  const firstImage = payload.data?.[0];
  if (!firstImage) {
    throw new Error("Image generation returned no image.");
  }

  return buildGeneratedImage({ prompt, image: firstImage });
}

export async function POST(request: Request) {
  const context = await getRequestContext(request);
  if ("error" in context) {
    return context.error;
  }

  const body = (await readJsonObject(request)) as GenerateRequestBody;
  const rawPrompt = stringValue(body, "prompt") ?? stringValue(body, "rawPrompt");
  const originalRawPrompt = stringValue(body, "originalRawPrompt");

  if (!rawPrompt) {
    return badRequest("prompt is required");
  }

  const promptMode = promptModeValue(body.promptMode);
  const debugPrompt = body.debugPrompt === true;
  const snapshot = snapshotValue(body.snapshot ?? body.canvasSnapshot);
  const canvasGraphContext = canvasGraphContextValue(body);

  const compiledPrompt = compileFinalPrompt({
    rawPrompt,
    projectContext: body.projectContext,
    imageContext: body.imageContext,
    referenceImages: arrayValue(body.referenceImages),
    userStylePreset: stringValue(body, "userStylePreset"),
    generationMode: stringValue(body, "generationMode"),
    promptMode,
  });

  const snapshotAwareBrief = snapshot
    ? buildSnapshotAwareEditBrief({
        jobType: "generate_concept",
        prompt: rawPrompt,
        snapshot,
      })
    : undefined;
  const connectedBrief =
    snapshotAwareBrief && canvasGraphContext
      ? buildConnectedGenerationBrief(
          snapshotAwareBrief,
          canvasGraphContext as Parameters<typeof buildConnectedGenerationBrief>[1],
        )
      : snapshotAwareBrief;

  const promptMeta = buildPromptMeta({
    rawPrompt,
    originalRawPrompt,
    body,
    compiledPrompt,
    snapshotAwareBrief,
    connectedBrief,
    canvasGraphContext,
    promptMode,
    debugPrompt,
  });

  try {
    const generatedImage = await generateImageFromPrompt(compiledPrompt.enhancedPrompt);
    const assistantMessage = {
      id: `assistant-generation-${Date.now()}`,
      role: "assistant" as const,
      content: "Generated a concept image from the selected canvas target and connected references.",
      createdAt: new Date().toISOString(),
      generatedImages: [generatedImage],
    };

    return NextResponse.json({
      result: generatedImage,
      generatedImages: [generatedImage],
      assistantMessage,
      promptMeta,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unable to generate image.",
        promptMeta,
      },
      { status: 500 },
    );
  }
}
