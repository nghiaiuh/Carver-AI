/*
 * Flow: Calls OpenAI Images from the worker.
 * 1. Submit the final compiled prompt to the image model.
 * 2. Normalize the provider response into a buffer-backed image payload.
 * 3. Throw clear errors that higher layers can map into job failures.
 */

import {
  OPENAI_IMAGE_MODEL,
  OPENAI_IMAGE_OUTPUT_FORMAT,
  OPENAI_IMAGE_PARTIAL_IMAGES,
  OPENAI_IMAGE_QUALITY,
  OPENAI_IMAGE_SIZE,
  OPENAI_IMAGES_URL,
} from "@carver/shared";

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
  mimeType: "image/png";
  width: number;
  height: number;
  revisedPrompt: string | null;
  provider: string;
};

function parseImageSize(size: string): { width: number; height: number } {
  const [width, height] = size.split("x").map(Number);
  return {
    width: Number.isFinite(width) ? width : 1024,
    height: Number.isFinite(height) ? height : 1024,
  };
}

async function imageUrlToBuffer(imageUrl: string) {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error("OpenAI returned an image URL that could not be downloaded.");
  }

  return Buffer.from(await response.arrayBuffer());
}

export async function generateImageFromPrompt(prompt: string): Promise<OpenAiGeneratedImage> {
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

  const buffer = firstImage.b64_json
    ? Buffer.from(firstImage.b64_json, "base64")
    : firstImage.url
      ? await imageUrlToBuffer(firstImage.url)
      : null;

  if (!buffer) {
    throw new Error("Image generation returned no image buffer.");
  }

  const { width, height } = parseImageSize(OPENAI_IMAGE_SIZE);
  return {
    buffer,
    mimeType: "image/png",
    width,
    height,
    revisedPrompt: firstImage.revised_prompt ?? null,
    provider: OPENAI_IMAGE_MODEL,
  };
}
