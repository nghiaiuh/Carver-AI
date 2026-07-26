#!/usr/bin/env node

import {
  DeleteObjectsCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";

const shouldDelete = process.argv.includes("--delete");
const ttlHoursArg = process.argv.find((arg) => arg.startsWith("--ttl-hours="));
const ttlHours = Number(ttlHoursArg?.split("=")[1] ?? 24);
if (!Number.isFinite(ttlHours) || ttlHours < 1 || ttlHours > 24 * 30) {
  throw new Error("--ttl-hours must be between 1 and 720.");
}
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
  const selectAll = async (table, columns) => {
    const pageSize = 1000;
    const rows = [];

    for (let from = 0; ; from += pageSize) {
      const { data, error } = await supabase
        .from(table)
        .select(columns)
        .range(from, from + pageSize - 1);

      if (error) throw error;
      rows.push(...(data ?? []));
      if ((data ?? []).length < pageSize) return rows;
    }
  };

  const known = new Set();

  const [assets, libraryAssets] = await Promise.all([
    selectAll("assets", "storage_path"),
    selectAll("library_assets", "thumb_storage_path, preview_storage_path, original_storage_path"),
  ]);

  for (const asset of assets ?? []) {
    if (typeof asset.storage_path === "string" && asset.storage_path) {
      known.add(asset.storage_path);
    }
  }

  for (const asset of libraryAssets ?? []) {
    for (const path of [asset.thumb_storage_path, asset.preview_storage_path, asset.original_storage_path]) {
      if (typeof path === "string" && path) {
        known.add(path);
      }
    }
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
const hashObjectKey = (key) => createHash("sha256").update(key).digest("hex").slice(0, 12);

console.log(
  JSON.stringify(
    {
      mode: shouldDelete ? "delete" : "dry-run",
      ttlHours,
      scannedR2Objects: r2Keys.length,
      knownStoragePaths: knownStoragePaths.size,
      orphanCount: orphanKeys.length,
      // Object paths are private metadata. Hashes retain enough correlation for
      // a cleanup audit without leaking a user/project storage hierarchy.
      orphanKeyHashes: orphanKeys.slice(0, 25).map(hashObjectKey),
    },
    null,
    2,
  ),
);

if (shouldDelete && orphanKeys.length > 0) {
  // Re-read metadata immediately before mutation so a concurrent upload cannot
  // be deleted merely because it appeared after the initial scan.
  const currentKnownStoragePaths = await listKnownStoragePaths();
  const keysStillOrphaned = orphanKeys.filter((key) => !currentKnownStoragePaths.has(key));
  await deleteKeys(keysStillOrphaned);
  console.log(JSON.stringify({ deleted: keysStillOrphaned.length }, null, 2));
}
