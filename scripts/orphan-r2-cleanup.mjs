#!/usr/bin/env node

import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";

const shouldDelete = process.argv.includes("--delete");
const ttlHoursArg = process.argv.find((arg) => arg.startsWith("--ttl-hours="));
const ttlHours = Number(ttlHoursArg?.split("=")[1] ?? 24);
const cutoff = Date.now() - ttlHours * 60 * 60 * 1000;

const required = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "CLOUDFLARE_R2_ACCOUNT_ID",
  "CLOUDFLARE_R2_ACCESS_KEY_ID",
  "CLOUDFLARE_R2_SECRET_ACCESS_KEY",
  "CLOUDFLARE_R2_BUCKET",
];

const missing = required.filter((key) => !process.env[key]);
if (missing.length > 0) {
  throw new Error(`Missing required env: ${missing.join(", ")}`);
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const r2 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY,
  },
  forcePathStyle: true,
});

async function listR2Keys() {
  const keys = [];
  let continuationToken;

  do {
    const response = await r2.send(
      new ListObjectsV2Command({
        Bucket: process.env.CLOUDFLARE_R2_BUCKET,
        ContinuationToken: continuationToken,
        MaxKeys: 1000,
      }),
    );

    for (const object of response.Contents ?? []) {
      if (!object.Key) continue;
      if (object.LastModified && object.LastModified.getTime() > cutoff) continue;
      keys.push(object.Key);
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
}

async function listKnownStoragePaths() {
  const known = new Set();

  const [{ data: assets, error: assetsError }, { data: libraryAssets, error: libraryAssetsError }] =
    await Promise.all([
      supabase.from("assets").select("storage_path"),
      supabase
        .from("library_assets")
        .select("thumb_storage_path, preview_storage_path, original_storage_path"),
    ]);

  if (assetsError) throw assetsError;
  if (libraryAssetsError) throw libraryAssetsError;

  for (const asset of assets ?? []) {
    known.add(asset.storage_path);
  }

  for (const asset of libraryAssets ?? []) {
    known.add(asset.thumb_storage_path);
    known.add(asset.preview_storage_path);
    known.add(asset.original_storage_path);
  }

  return known;
}

async function deleteKeys(keys) {
  for (let index = 0; index < keys.length; index += 1000) {
    const batch = keys.slice(index, index + 1000);
    await r2.send(
      new DeleteObjectsCommand({
        Bucket: process.env.CLOUDFLARE_R2_BUCKET,
        Delete: {
          Objects: batch.map((Key) => ({ Key })),
          Quiet: true,
        },
      }),
    );
  }
}

const [r2Keys, knownStoragePaths] = await Promise.all([
  listR2Keys(),
  listKnownStoragePaths(),
]);

const orphanKeys = r2Keys.filter((key) => !knownStoragePaths.has(key));

console.log(
  JSON.stringify(
    {
      mode: shouldDelete ? "delete" : "dry-run",
      ttlHours,
      scannedR2Objects: r2Keys.length,
      knownStoragePaths: knownStoragePaths.size,
      orphanCount: orphanKeys.length,
      orphanKeys,
    },
    null,
    2,
  ),
);

if (shouldDelete && orphanKeys.length > 0) {
  await deleteKeys(orphanKeys);
  console.log(JSON.stringify({ deleted: orphanKeys.length }, null, 2));
}
