import sharp from "sharp";
export {
  ALLOWED_INLINE_IMAGE_MIME_TYPES,
  DEFAULT_MAX_INLINE_IMAGE_BYTES,
  extensionForMimeType,
  hasAllowedMagicBytes,
  parseDataUrlImage,
  type ParsedDataUrlImage,
} from "./imageFormat";
import {
  DEFAULT_MAX_INLINE_IMAGE_BYTES,
  hasAllowedMagicBytes,
  parseDataUrlImage,
  type ParsedDataUrlImage,
} from "./imageFormat";

export type SanitizedInlineImage = ParsedDataUrlImage & {
  width: number;
  height: number;
};

export async function inspectImageBuffer(params: {
  buffer: Buffer;
  mimeType: string;
  maxBytes?: number;
}): Promise<{ width: number; height: number }> {
  const maxBytes = params.maxBytes ?? DEFAULT_MAX_INLINE_IMAGE_BYTES;
  if (params.buffer.length === 0 || params.buffer.length > maxBytes) {
    throw new Error("Image payload is too large.");
  }

  if (!hasAllowedMagicBytes(params.buffer, params.mimeType)) {
    throw new Error("Image content does not match the declared MIME type.");
  }

  const metadata = await sharp(params.buffer, {
    failOn: "none",
    limitInputPixels: 40_000_000,
  }).metadata();
  if (!metadata.width || !metadata.height || metadata.width > 8_000 || metadata.height > 8_000) {
    throw new Error("Image dimensions are invalid.");
  }

  return { width: metadata.width, height: metadata.height };
}

/** Decode and re-encode untrusted pixels to remove metadata and reject image bombs. */
export async function sanitizeDataUrlImage(
  dataUrl: string,
  maxBytes = DEFAULT_MAX_INLINE_IMAGE_BYTES,
): Promise<SanitizedInlineImage> {
  const parsed = parseDataUrlImage(dataUrl, maxBytes);
  const image = sharp(parsed.buffer, {
    failOn: "none",
    limitInputPixels: 40_000_000,
  }).rotate();
  const metadata = await image.metadata();

  if (!metadata.width || !metadata.height || metadata.width > 8_000 || metadata.height > 8_000) {
    throw new Error("Inline image dimensions are invalid.");
  }

  const buffer = await image.webp({ quality: 90 }).toBuffer();
  if (buffer.length === 0 || buffer.length > maxBytes) {
    throw new Error("Inline image is too large after processing.");
  }

  return {
    buffer,
    mimeType: "image/webp",
    sizeBytes: buffer.length,
    width: metadata.width,
    height: metadata.height,
  };
}
