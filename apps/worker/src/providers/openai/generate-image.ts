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
  OPENAI_IMAGE_PARTIAL_IMAGES,
  OPENAI_IMAGE_QUALITY,
  OPENAI_IMAGE_SIZE,
  OPENAI_IMAGES_URL,
} from "@carver/shared";
import { hasAllowedMagicBytes } from "@carver/storage";
import { createSafeLogger } from "@carver/shared";
import sharp from "sharp";

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
  };
};

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

async function imageUrlToBuffer(imageUrl: string) {
  const response = await fetchWithTimeout(imageUrl, {
    timeoutMs: getOpenAiImageRequestTimeoutMs(),
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

async function parseGeneratedImage(payload: OpenAIImageGenerationResponse) {
  const firstImage = payload.data?.[0];
  if (!firstImage) {
    throw new Error("Image generation returned no image.");
  }

  const buffer = firstImage.b64_json
    ? Buffer.from(firstImage.b64_json, "base64")
    : firstImage.url
      ? await imageUrlToBuffer(firstImage.url)
      : null;

  if (!buffer) {
    throw new Error("Image generation returned no image buffer.");
  }
  if (buffer.length > MAX_PROVIDER_IMAGE_BYTES) {
    throw new Error("OpenAI returned an image that exceeds the output limit.");
  }

  return {
    buffer,
    revisedPrompt: firstImage.revised_prompt ?? null,
  };
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit & { timeoutMs: number },
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), init.timeoutMs);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`OpenAI image request timed out after ${init.timeoutMs / 1000} seconds.`);
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function createImagesEditRequest(params: {
  prompt: string;
  targetImage: ImageInput;
  referenceImages: ImageInput[];
  maskImage?: ImageInput | null;
}) {
  const formData = new FormData();
  formData.set("model", OPENAI_IMAGE_MODEL);
  formData.set("prompt", params.prompt);
  formData.set("size", OPENAI_IMAGE_SIZE);
  formData.set("quality", OPENAI_IMAGE_QUALITY);
  formData.set("output_format", OPENAI_IMAGE_OUTPUT_FORMAT);

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

export async function generateImageFromPrompt(params: {
  prompt: string;
  mode: CarverImageExecutionMode;
  targetImage?: ImageInput | null;
  referenceImages?: ImageInput[];
  maskImage?: ImageInput | null;
}): Promise<OpenAiGeneratedImage> {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required to generate images.");
  }

  const endpoint =
    params.mode === "text_to_image"
      ? OPENAI_IMAGES_URL
      : OPENAI_IMAGES_URL.replace("/generations", "/edits");

  if (params.mode !== "text_to_image" && !params.targetImage) {
    throw new Error("Image edit requires a target image.");
  }

  const resolvedTargetImage = params.targetImage ?? null;

  const requestBody =
    params.mode === "text_to_image"
      ? JSON.stringify({
          model: OPENAI_IMAGE_MODEL,
          prompt: params.prompt,
          size: OPENAI_IMAGE_SIZE,
          quality: OPENAI_IMAGE_QUALITY,
          output_format: OPENAI_IMAGE_OUTPUT_FORMAT,
          partial_images: OPENAI_IMAGE_PARTIAL_IMAGES,
          n: 1,
        })
      : await createImagesEditRequest({
          prompt: params.prompt,
          targetImage: resolvedTargetImage as ImageInput,
          referenceImages: params.referenceImages ?? [],
          maskImage: params.maskImage,
        });

  logger.info("calling openai images api", {
    model: OPENAI_IMAGE_MODEL,
    endpoint,
    mode: params.mode,
    referenceImageCount: params.referenceImages?.length ?? 0,
    hasTargetImage: Boolean(params.targetImage),
    hasMaskImage: Boolean(params.maskImage),
  });

  const response = await fetchWithTimeout(endpoint, {
    method: "POST",
    headers:
      requestBody instanceof FormData
        ? {
            Authorization: `Bearer ${apiKey}`,
          }
        : {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
    body: requestBody,
    timeoutMs: getOpenAiImageRequestTimeoutMs(),
  });

  const payload = (await response.json().catch(() => ({}))) as OpenAIImageGenerationResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message || "Image generation failed.");
  }

  const { buffer, revisedPrompt } = await parseGeneratedImage(payload);
  const mimeType = inferOutputMimeType(buffer);
  logger.info("openai images api succeeded", {
    model: OPENAI_IMAGE_MODEL,
    mode: params.mode,
    mimeType,
  });

  const { width, height } = await inspectGeneratedImage(buffer, mimeType);
  return {
    buffer,
    mimeType,
    width,
    height,
    revisedPrompt,
    provider: OPENAI_IMAGE_MODEL,
  };
}
