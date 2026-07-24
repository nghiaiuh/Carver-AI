import sharp from "sharp";

const DATA_URL_PATTERN = /^data:(image\/(?:png|jpeg|webp));base64,([a-z0-9+/=\s]+)$/i;

export const ALLOWED_INLINE_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
] as const);

export const DEFAULT_MAX_INLINE_IMAGE_BYTES = 8 * 1024 * 1024;

export type ParsedDataUrlImage = {
  buffer: Buffer;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  sizeBytes: number;
};

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

export function hasAllowedMagicBytes(buffer: Buffer, mimeType: string) {
  if (mimeType === "image/jpeg") {
    return buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  if (mimeType === "image/png") {
    return (
      buffer.length > 8 &&
      buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    );
  }

  if (mimeType === "image/webp") {
    return (
      buffer.length > 12 &&
      buffer.subarray(0, 4).toString("ascii") === "RIFF" &&
      buffer.subarray(8, 12).toString("ascii") === "WEBP"
    );
  }

  return false;
}

export function parseDataUrlImage(
  dataUrl: string,
  maxBytes = DEFAULT_MAX_INLINE_IMAGE_BYTES,
): ParsedDataUrlImage {
  const trimmed = dataUrl.trim();
  const match = DATA_URL_PATTERN.exec(trimmed);
  if (!match) {
    throw new Error("Inline image must be a base64 PNG, JPEG, or WebP data URL.");
  }

  const mimeType = match[1].toLowerCase() as ParsedDataUrlImage["mimeType"];
  if (!ALLOWED_INLINE_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new Error("Inline image type is not supported.");
  }

  const buffer = Buffer.from(match[2].replace(/\s+/g, ""), "base64");
  if (buffer.length === 0) {
    throw new Error("Inline image is empty.");
  }

  if (buffer.length > maxBytes) {
    throw new Error("Inline image is too large.");
  }

  if (!hasAllowedMagicBytes(buffer, mimeType)) {
    throw new Error("Inline image content does not match the declared MIME type.");
  }

  return {
    buffer,
    mimeType,
    sizeBytes: buffer.length,
  };
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

export function extensionForMimeType(mimeType: string) {
  if (mimeType === "image/png") {
    return "png";
  }

  if (mimeType === "image/webp") {
    return "webp";
  }

  return "jpg";
}
