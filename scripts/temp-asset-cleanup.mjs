#!/usr/bin/env node

// Removes only explicitly-marked temporary AI input assets after a TTL. Dry run
// is the default; --delete is required for mutation. Active jobs protect their
// input asset IDs from deletion even when the asset is old.

import { DeleteObjectsCommand, S3Client } from "@aws-sdk/client-s3";
import { createClient } from "@supabase/supabase-js";

const shouldDelete = process.argv.includes("--delete");
const ttlArg = process.argv.find((arg) => arg.startsWith("--ttl-hours="));
const ttlHours = Number(ttlArg?.split("=")[1] ?? 24);
if (!Number.isFinite(ttlHours) || ttlHours < 1 || ttlHours > 24 * 30) {
  throw new Error("--ttl-hours must be between 1 and 720.");
}

const required = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "CLOUDFLARE_R2_ACCOUNT_ID", "CLOUDFLARE_R2_ACCESS_KEY_ID", "CLOUDFLARE_R2_SECRET_ACCESS_KEY", "CLOUDFLARE_R2_BUCKET"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) throw new Error(`Missing required env: ${missing.join(", ")}`);

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const r2 = new S3Client({ region: "auto", endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`, credentials: { accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID, secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY }, forcePathStyle: true });
const cutoff = new Date(Date.now() - ttlHours * 60 * 60 * 1000).toISOString();

const [{ data: candidates, error: assetsError }, { data: activeJobs, error: jobsError }] = await Promise.all([
  supabase.from("assets").select("id, storage_path, metadata, created_at").lt("created_at", cutoff),
  supabase.from("ai_jobs").select("input_asset_ids").in("status", ["queued", "running"]),
]);
if (assetsError) throw assetsError;
if (jobsError) throw jobsError;

const protectedAssetIds = new Set((activeJobs ?? []).flatMap((job) => Array.isArray(job.input_asset_ids) ? job.input_asset_ids : []));
const expired = (candidates ?? []).filter((asset) => asset.metadata?.temporary === true && !protectedAssetIds.has(asset.id));

console.log(JSON.stringify({ mode: shouldDelete ? "delete" : "dry-run", ttlHours, candidateCount: expired.length, assetIds: expired.map((asset) => asset.id) }, null, 2));

if (shouldDelete && expired.length) {
  let deletedCount = 0;
  let r2CleanupPendingCount = 0;
  for (let index = 0; index < expired.length; index += 1000) {
    const batch = expired.slice(index, index + 1000);
    const { data: currentActiveJobs, error: currentJobsError } = await supabase
      .from("ai_jobs")
      .select("input_asset_ids")
      .in("status", ["queued", "running"]);
    if (currentJobsError) throw currentJobsError;

    const currentlyProtectedAssetIds = new Set(
      (currentActiveJobs ?? []).flatMap((job) => Array.isArray(job.input_asset_ids) ? job.input_asset_ids : []),
    );
    const deletableBatch = batch.filter((asset) => !currentlyProtectedAssetIds.has(asset.id));
    if (deletableBatch.length === 0) continue;

    // The database row is authoritative. If R2 is unavailable after the row is
    // gone, the orphan cleanup pass can safely remove the binary later.
    const { error } = await supabase.from("assets").delete().in("id", deletableBatch.map((asset) => asset.id));
    if (error) throw error;
    deletedCount += deletableBatch.length;

    try {
      await r2.send(new DeleteObjectsCommand({ Bucket: process.env.CLOUDFLARE_R2_BUCKET, Delete: { Objects: deletableBatch.map((asset) => ({ Key: asset.storage_path })), Quiet: true } }));
    } catch {
      // The metadata is already gone, so a future orphan pass can delete these
      // objects safely. Do not report this durable cleanup as a failed DB job.
      r2CleanupPendingCount += deletableBatch.length;
    }
  }
  console.log(JSON.stringify({ deleted: deletedCount, r2CleanupPendingCount, note: "Rows protected by newly active jobs were skipped." }, null, 2));
}
