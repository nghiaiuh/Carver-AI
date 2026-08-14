/*
 * Flow: Calls OpenAI Images from the worker.
 * 1. Submit the final compiled prompt to the image model.
 * 2. Normalize the provider response into a buffer-backed image payload.
 * 3. Throw clear errors that higher layers can map into job failures.
 */

import {
  type CarverImageExecutionMode,
  OPENAI_IMAGE_MODEL,
  OPENAI_IMAGE_OUTPUT_FORMAT,
  OPENAI_IMAGE_QUALITY,
  OPENAI_IMAGE_SIZE,
  OPENAI_IMAGES_URL,
} from "@carver/shared";
import type { OpenAIHttpTransport } from "@carver/shared";
import { hasAllowedMagicBytes } from "@carver/storage/image-format";
import { createSafeLogger } from "@carver/shared";
import sharp from "sharp";
import { GenerationStageError } from "../../errors/generation-stage-error";

const logger = createSafeLogger("worker.openai-image");
const DEFAULT_OPENAI_IMAGE_REQUEST_TIMEOUT_MS = 240_000;
const MAX_PROVIDER_IMAGE_BYTES = 20 * 1024 * 1024;

export function getOpenAiImageRequestTimeoutMs(rawValue = process.env.OPENAI_IMAGE_REQUEST_TIMEOUT_MS) {
  const configured = Number(rawValue ?? DEFAULT_OPENAI_IMAGE_REQUEST_TIMEOUT_MS);
  if (!Number.isInteger(configured) || configured < 10_000 || configured > 600_000) {
    return DEFAULT_OPENAI_IMAGE_REQUEST_TIMEOUT_MS;
  }

  return configured;
}

type OpenAIImageGenerationResponse = {
  data?: Array<{
    b64_json?: string;
    url?: string;
    revised_prompt?: string;
  }>;
  error?: {
    message?: string;
    code?: string;
  };
};

const MIN_OPENAI_IMAGE_OUTPUT_COUNT = 1;
const MAX_OPENAI_IMAGE_OUTPUT_COUNT = 4;

export type OpenAiGeneratedImage = {
  buffer: Buffer;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
  width: number;
  height: number;
  revisedPrompt: string | null;
  provider: string;
};

type ImageInput = {
  buffer: Buffer;
  mimeType: string;
};

function toBlobPart(buffer: Buffer) {
  return new Uint8Array(buffer);
}

async function imageUrlToBuffer(imageUrl: string, transport: OpenAIHttpTransport) {
  const response = await fetchWithTimeout(imageUrl, {
    timeoutMs: getOpenAiImageRequestTimeoutMs(),
    transport,
  });
  if (!response.ok) {
    throw new Error("OpenAI returned an image URL that could not be downloaded.");
  }

  const contentType = response.headers.get("content-type") ?? "";
  const contentLength = Number(response.headers.get("content-length"));
  if (!contentType.toLowerCase().startsWith("image/")) {
    throw new Error("OpenAI returned an invalid image content type.");
  }
  if (Number.isFinite(contentLength) && contentLength > MAX_PROVIDER_IMAGE_BYTES) {
    throw new Error("OpenAI returned an image that exceeds the output limit.");
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_PROVIDER_IMAGE_BYTES) {
    throw new Error("OpenAI returned an image that exceeds the output limit.");
  }
  return buffer;
}

function inferOutputMimeType(buffer: Buffer): OpenAiGeneratedImage["mimeType"] {
  if (hasAllowedMagicBytes(buffer, "image/png")) {
    return "image/png";
  }

  if (hasAllowedMagicBytes(buffer, "image/webp")) {
    return "image/webp";
  }

  if (hasAllowedMagicBytes(buffer, "image/jpeg")) {
    return "image/jpeg";
  }

  throw new Error("OpenAI returned image bytes with an unsupported format.");
}

async function inspectGeneratedImage(
  buffer: Buffer,
  mimeType: OpenAiGeneratedImage["mimeType"],
): Promise<{ width: number; height: number }> {
  const metadata = await sharp(buffer, {
    failOn: "none",
    limitInputPixels: 40_000_000,
  }).metadata();
  if (!metadata.width || !metadata.height || metadata.width > 8_000 || metadata.height > 8_000) {
    throw new Error("OpenAI returned image dimensions outside supported limits.");
  }
  if (!hasAllowedMagicBytes(buffer, mimeType)) {
    throw new Error("OpenAI returned image bytes with an unsupported format.");
  }

  return { width: metadata.width, height: metadata.height };
}

export function normalizeOpenAiImageOutputCount(value: number | undefined) {
  const candidate =
    typeof value === "number" && Number.isInteger(value) ? value : MIN_OPENAI_IMAGE_OUTPUT_COUNT;
  return Math.min(MAX_OPENAI_IMAGE_OUTPUT_COUNT, Math.max(MIN_OPENAI_IMAGE_OUTPUT_COUNT, candidate));
}

export function buildOpenAiImageGenerationRequestBody(params: {
  model: string;
  prompt: string;
  size: string;
  outputCount?: number;
}) {
  return JSON.stringify({
    model: params.model,
    prompt: params.prompt,
    size: params.size,
    quality: OPENAI_IMAGE_QUALITY,
    output_format: OPENAI_IMAGE_OUTPUT_FORMAT,
    n: normalizeOpenAiImageOutputCount(params.outputCount),
  });
}

async function parseGeneratedImages(payload: OpenAIImageGenerationResponse, transport: OpenAIHttpTransport) {
  const images = payload.data ?? [];
  if (images.length === 0) {
    throw new Error("Image generation returned no image.");
  }

  return Promise.all(
    images.map(async (image) => {
      const buffer = image.b64_json
        ? Buffer.from(image.b64_json, "base64")
        : image.url
          ? await imageUrlToBuffer(image.url, transport)
          : null;

      if (!buffer) {
        throw new Error("Image generation returned no image buffer.");
      }
      if (buffer.length > MAX_PROVIDER_IMAGE_BYTES) {
        throw new Error("OpenAI returned an image that exceeds the output limit.");
      }

      return {
        buffer,
        revisedPrompt: image.revised_prompt ?? null,
      };
    }),
  );
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit & { timeoutMs: number; transport: OpenAIHttpTransport },
) {
  const { timeoutMs, transport, ...requestInit } = init;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await transport(String(input), {
      ...requestInit,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`OpenAI image request timed out after ${timeoutMs / 1000} seconds.`);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function createImagesEditRequest(params: {
  prompt: string;
  size: string;
  outputCount: number;
  targetImage: ImageInput;
  referenceImages: ImageInput[];
  maskImage?: ImageInput | null;
}) {
  const formData = new FormData();
  formData.set("model", OPENAI_IMAGE_MODEL);
  formData.set("prompt", params.prompt);
  formData.set("size", params.size);
  formData.set("quality", OPENAI_IMAGE_QUALITY);
  formData.set("output_format", OPENAI_IMAGE_OUTPUT_FORMAT);
  formData.set("n", String(params.outputCount));

  formData.append(
    "image[]",
    new File([toBlobPart(params.targetImage.buffer)], "target.png", { type: params.targetImage.mimeType }),
  );

  params.referenceImages.forEach((image, index) => {
    formData.append(
      "image[]",
      new File([toBlobPart(image.buffer)], `reference-${index + 1}.png`, { type: image.mimeType }),
    );
  });

  if (params.maskImage) {
    formData.set(
      "mask",
      new File([toBlobPart(params.maskImage.buffer)], "mask.png", { type: params.maskImage.mimeType }),
    );
  }

  return formData;
}

export async function generateImagesFromPrompt(params: {
  prompt: string;
  mode: CarverImageExecutionMode;
  model?: string;
  size?: string;
  outputCount?: number;
  targetImage?: ImageInput | null;
  referenceImages?: ImageInput[];
  maskImage?: ImageInput | null;
  transport?: OpenAIHttpTransport;
}): Promise<OpenAiGeneratedImage[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  const transport = params.transport ?? ((input, init) => fetch(input, init));

  if (!apiKey && !params.transport) {
    throw new GenerationStageError("provider_configuration", "OpenAI image provider is not configured.", {
      providerCode: "missing_api_key",
    });
  }

  const endpoint =
    params.mode === "text_to_image"
      ? OPENAI_IMAGES_URL
      : OPENAI_IMAGES_URL.replace("/generations", "/edits");

  if (params.mode !== "text_to_image" && !params.targetImage) {
    throw new GenerationStageError("input_resolution", "Image edit is missing a target image.");
  }

  const resolvedModel = params.model?.trim() || OPENAI_IMAGE_MODEL;
  const resolvedSize = params.size?.trim() || OPENAI_IMAGE_SIZE;
  const resolvedOutputCount = normalizeOpenAiImageOutputCount(params.outputCount);
  const resolvedTargetImage = params.targetImage ?? null;

  const requestBody =
    params.mode === "text_to_image"
      ? buildOpenAiImageGenerationRequestBody({
          model: resolvedModel,
          prompt: params.prompt,
          size: resolvedSize,
          outputCount: resolvedOutputCount,
        })
      : await createImagesEditRequest({
          prompt: params.prompt,
          size: resolvedSize,
          outputCount: resolvedOutputCount,
          targetImage: resolvedTargetImage as ImageInput,
          referenceImages: params.referenceImages ?? [],
          maskImage: params.maskImage,
        });

  logger.info("calling openai images api", {
    model: resolvedModel,
    endpoint,
    mode: params.mode,
    size: resolvedSize,
    outputCount: resolvedOutputCount,
    referenceImageCount: params.referenceImages?.length ?? 0,
    hasTargetImage: Boolean(params.targetImage),
    hasMaskImage: Boolean(params.maskImage),
  });

  let response: Response;
  try {
    response = await fetchWithTimeout(endpoint, {
      method: "POST",
      headers:
        requestBody instanceof FormData
          ? {
              ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
            }
          : {
              "Content-Type": "application/json",
              ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
            },
      body: requestBody,
      timeoutMs: getOpenAiImageRequestTimeoutMs(),
      transport,
    });
  } catch (error) {
    throw new GenerationStageError("provider_request", "OpenAI image request did not complete.", { cause: error });
  }

  const payload = (await response.json().catch(() => ({}))) as OpenAIImageGenerationResponse;
  if (!response.ok) {
    throw new GenerationStageError("provider_request", "OpenAI image request was rejected.", {
      providerStatus: response.status,
      providerCode: typeof payload.error?.code === "string" ? payload.error.code : null,
    });
  }

  let parsedImages: Awaited<ReturnType<typeof parseGeneratedImages>>;
  try {
    parsedImages = await parseGeneratedImages(payload, transport);
  } catch (error) {
    throw new GenerationStageError("provider_request", "OpenAI returned an unusable image response.", { cause: error });
  }

  if (parsedImages.length !== resolvedOutputCount) {
    throw new GenerationStageError("provider_request", "OpenAI returned an incomplete image response.", {
      providerCode: "incomplete_image_output_count",
    });
  }

  try {
    const images = await Promise.all(
      parsedImages.map(async ({ buffer, revisedPrompt }) => {
        const mimeType = inferOutputMimeType(buffer);
        const dimensions = await inspectGeneratedImage(buffer, mimeType);
        return {
          buffer,
          mimeType,
          width: dimensions.width,
          height: dimensions.height,
          revisedPrompt,
          provider: resolvedModel,
        };
      }),
    );
    logger.info("openai images api succeeded", {
      model: resolvedModel,
      mode: params.mode,
      size: resolvedSize,
      outputCount: images.length,
    });
    return images;
  } catch (error) {
    throw new GenerationStageError("provider_request", "OpenAI returned an invalid image response.", { cause: error });
  }
}
