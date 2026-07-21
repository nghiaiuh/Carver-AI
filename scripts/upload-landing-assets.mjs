#!/usr/bin/env node

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

const dryRun = process.argv.includes("--dry-run");
const dirArg = process.argv.find((arg) => arg.startsWith("--dir="));
const prefixArg = process.argv.find((arg) => arg.startsWith("--prefix="));

const rootDir = path.resolve(process.cwd(), dirArg?.split("=")[1] ?? "apps/web/public/landing");
const keyPrefix = (prefixArg?.split("=")[1] ?? "landing").replace(/^\/+|\/+$/g, "");

async function loadEnvFile(filePath) {
  try {
    const contents = await readFile(filePath, "utf8");
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const separatorIndex = trimmed.indexOf("=");
      if (separatorIndex === -1) continue;

      const key = trimmed.slice(0, separatorIndex).trim();
      const rawValue = trimmed.slice(separatorIndex + 1).trim();
      const value = rawValue.replace(/^['"]|['"]$/g, "");

      if (!(key in process.env)) {
        process.env[key] = value;
      }
    }
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return;
    }

    throw error;
  }
}

await loadEnvFile(path.resolve(process.cwd(), ".env"));
await loadEnvFile(path.resolve(process.cwd(), ".env.local"));
await loadEnvFile(path.resolve(process.cwd(), "apps/web/.env"));
await loadEnvFile(path.resolve(process.cwd(), "apps/web/.env.local"));
await loadEnvFile(path.resolve(process.cwd(), "apps/worker/.env"));
await loadEnvFile(path.resolve(process.cwd(), "apps/worker/.env.local"));

const required = [
  "CLOUDFLARE_R2_ACCOUNT_ID",
  "CLOUDFLARE_R2_ACCESS_KEY_ID",
  "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
  "CLOUDFLARE_R2_BUCKET",
];

const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new Error(`Missing required env: ${missing.join(", ")}`);
}

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

function getContentType(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".avif":
      return "image/avif";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

async function collectFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(absolutePath)));
      continue;
    }

    files.push(absolutePath);
  }

  return files;
}

function toPublicUrl(key) {
  const publicBaseUrl = process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL?.replace(/\/+$/, "");
  return publicBaseUrl ? `${publicBaseUrl}/${key}` : null;
}

const files = await collectFiles(rootDir);
const uploaded = [];

for (const filePath of files) {
  const relativePath = path.relative(rootDir, filePath).replace(/\\/g, "/");
  const key = `${keyPrefix}/${relativePath}`;
  const body = await readFile(filePath);
  const contentType = getContentType(filePath);

  if (!dryRun) {
    await r2.send(
      new PutObjectCommand({
        Bucket: process.env.CLOUDFLARE_R2_BUCKET,
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: "public, max-age=31536000, immutable",
      }),
    );
  }

  uploaded.push({
    file: relativePath,
    key,
    bytes: body.byteLength,
    contentType,
    url: toPublicUrl(key),
  });
}

console.log(
  JSON.stringify(
    {
      mode: dryRun ? "dry-run" : "upload",
      rootDir,
      keyPrefix,
      fileCount: uploaded.length,
      publicBaseUrl: process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL ?? null,
      suggestedNextPublicLandingAssetBaseUrl: process.env.CLOUDFLARE_R2_PUBLIC_BASE_URL ?? null,
      uploaded,
    },
    null,
    2,
  ),
);
