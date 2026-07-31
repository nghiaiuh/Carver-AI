import { randomUUID } from "node:crypto";
import {
  DeleteObjectsCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type DeleteObjectsCommandInput,
  type GetObjectCommandInput,
  type GetObjectCommandOutput,
  type ListObjectsV2CommandInput,
  type ListObjectsV2CommandOutput,
  type PutObjectCommandInput,
} from "@aws-sdk/client-s3";

export type R2Env = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

const stripWrappingQuotes = (value: string) => value.replace(/^['"]|['"]$/g, "");

const readRequired = (env: Record<string, string | undefined>, key: string): string => {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  return stripWrappingQuotes(value);
};

export const getR2Env = (env: Record<string, string | undefined> = process.env): R2Env => ({
  accountId: readRequired(env, "CLOUDFLARE_R2_ACCOUNT_ID"),
  accessKeyId: readRequired(env, "CLOUDFLARE_R2_ACCESS_KEY_ID"),
  secretAccessKey: readRequired(env, "CLOUDFLARE_R2_SECRET_ACCESS_KEY"),
  bucket: readRequired(env, "CLOUDFLARE_R2_BUCKET"),
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

  const safeName =
    fileName
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
    CacheControl: params.cacheControl ?? "private, max-age=0, no-store",
  };

  await client.send(new PutObjectCommand(input));

}

export async function deleteR2Objects(keys: string[]) {
  const uniqueKeys = [...new Set(keys.filter((key) => key.trim().length > 0))];
  if (uniqueKeys.length === 0) return;

  const env = getR2Env();
  const client = getR2Client();

  // S3-compatible DeleteObjects accepts at most 1,000 keys. R2 can also
  // return per-key failures without rejecting the SDK request, so inspect the
  // response instead of reporting a false cleanup success.
  for (let start = 0; start < uniqueKeys.length; start += 1_000) {
    const batch = uniqueKeys.slice(start, start + 1_000);
    const input: DeleteObjectsCommandInput = {
      Bucket: env.bucket,
      Delete: {
        Objects: batch.map((Key) => ({ Key })),
        Quiet: true,
      },
    };

    const response = await client.send(new DeleteObjectsCommand(input));
    if ((response.Errors?.length ?? 0) > 0) {
      const codes = [...new Set(
        response.Errors
          ?.map((error) => error.Code)
          .filter((code): code is string => Boolean(code)),
      )];
      throw new Error(
        `R2 could not delete ${response.Errors?.length ?? 0} object(s)${codes.length > 0 ? ` (${codes.join(", ")})` : ""}.`,
      );
    }
  }
}

export type R2ObjectSummary = {
  key: string;
  size: number;
  lastModified?: Date;
  eTag?: string;
};

export async function listR2Objects(params: { prefix?: string } = {}) {
  const env = getR2Env();
  const client = getR2Client();
  const items: R2ObjectSummary[] = [];
  let continuationToken: string | undefined;

  do {
    const input: ListObjectsV2CommandInput = {
      Bucket: env.bucket,
      Prefix: params.prefix,
      ContinuationToken: continuationToken,
      MaxKeys: 1000,
    };

    const response: ListObjectsV2CommandOutput = await client.send(new ListObjectsV2Command(input));
    for (const object of response.Contents ?? []) {
      if (!object.Key) continue;
      items.push({
        key: object.Key,
        size: object.Size ?? 0,
        lastModified: object.LastModified ?? undefined,
        eTag: object.ETag ?? undefined,
      });
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return items;
}

async function bodyToBuffer(body: GetObjectCommandOutput["Body"]): Promise<Buffer> {
  if (!body) {
    throw new Error("Missing R2 object body.");
  }

  if (Buffer.isBuffer(body)) {
    return body;
  }

  if (body instanceof Uint8Array) {
    return Buffer.from(body);
  }

  const transformToByteArray = (body as { transformToByteArray?: () => Promise<Uint8Array> }).transformToByteArray;
  if (typeof transformToByteArray === "function") {
    return Buffer.from(await transformToByteArray.call(body));
  }

  const chunks: Buffer[] = [];
  for await (const chunk of body as AsyncIterable<Uint8Array | Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks);
}

export async function getR2ObjectBuffer(key: string): Promise<Buffer> {
  const env = getR2Env();
  const client = getR2Client();
  const input: GetObjectCommandInput = {
    Bucket: env.bucket,
    Key: key,
  };

  const response = await client.send(new GetObjectCommand(input));
  return bodyToBuffer(response.Body);
}
