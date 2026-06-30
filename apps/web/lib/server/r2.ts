import "server-only";

import { randomUUID } from "node:crypto";
import {
  DeleteObjectsCommand,
  PutObjectCommand,
  S3Client,
  type DeleteObjectsCommandInput,
  type PutObjectCommandInput,
} from "@aws-sdk/client-s3";

type R2Env = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
};

const readRequired = (env: Record<string, string | undefined>, key: string): string => {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
};

const getR2Env = (env: Record<string, string | undefined> = process.env): R2Env => ({
  accountId: readRequired(env, "CLOUDFLARE_R2_ACCOUNT_ID"),
  accessKeyId: readRequired(env, "CLOUDFLARE_R2_ACCESS_KEY_ID"),
  secretAccessKey: readRequired(env, "CLOUDFLARE_R2_SECRET_ACCESS_KEY"),
  bucket: readRequired(env, "CLOUDFLARE_R2_BUCKET"),
  publicBaseUrl: readRequired(env, "CLOUDFLARE_R2_PUBLIC_BASE_URL"),
});

let r2Client: S3Client | null = null;

export const getR2Client = () => {
  if (!r2Client) {
    const env = getR2Env();
    r2Client = new S3Client({
      region: "auto",
      endpoint: `https://${env.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.accessKeyId,
        secretAccessKey: env.secretAccessKey,
      },
      forcePathStyle: true,
    });
  }

  return r2Client;
};

export const getR2Bucket = () => getR2Env().bucket;

export const getR2PublicUrl = (key: string) => {
  const { publicBaseUrl } = getR2Env();
  return new URL(key, publicBaseUrl.endsWith("/") ? publicBaseUrl : `${publicBaseUrl}/`).toString();
};

export const createR2ObjectKey = (parts: string[], fileName: string) => {
  const cleanParts = parts
    .map((part) =>
      part
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, ""),
    )
    .filter(Boolean);

  const safeName = fileName
    .replace(/\.[^.]+$/, "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || "image";

  return [...cleanParts, `${Date.now()}-${randomUUID().slice(0, 8)}-${safeName}`].join("/");
};

export async function uploadR2Object(params: {
  key: string;
  body: Buffer;
  contentType: string;
  cacheControl?: string;
}) {
  const env = getR2Env();
  const client = getR2Client();
  const input: PutObjectCommandInput = {
    Bucket: env.bucket,
    Key: params.key,
    Body: params.body,
    ContentType: params.contentType,
    CacheControl: params.cacheControl ?? "public, max-age=31536000, immutable",
  };

  await client.send(new PutObjectCommand(input));

  return getR2PublicUrl(params.key);
}

export async function deleteR2Objects(keys: string[]) {
  if (keys.length === 0) return;

  const env = getR2Env();
  const client = getR2Client();
  const input: DeleteObjectsCommandInput = {
    Bucket: env.bucket,
    Delete: {
      Objects: keys.map((Key) => ({ Key })),
      Quiet: true,
    },
  };

  await client.send(new DeleteObjectsCommand(input));
}
