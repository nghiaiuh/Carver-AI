/*
 * Deletes stale R2 binaries that have no asset metadata. Metadata remains the
 * source of truth; a conservative age and prefix policy protects uploads still
 * in flight and objects not owned by Carver's storage lifecycle.
 */

import { getSupabaseAdmin } from "@carver/db/server";
import { createSafeLogger } from "@carver/shared";
import { deleteR2Objects, listR2Objects, type R2ObjectSummary } from "@carver/storage/r2";
import type { RunWithMaintenanceLease } from "./maintenance-lease";

const logger = createSafeLogger("worker.r2-orphan-cleanup");
const DEFAULT_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PAGE_SIZE = 1_000;
const UUID_PREFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\//i;

export const isManagedCarverR2Key = (key: string) => key.startsWith("users/") || UUID_PREFIX.test(key);

export const isExpiredUnreferencedR2Object = (params: {
  object: R2ObjectSummary;
  referencedKeys: ReadonlySet<string>;
  now: number;
  ttlMs: number;
}) => {
  if (!isManagedCarverR2Key(params.object.key) || params.referencedKeys.has(params.object.key)) {
    return false;
  }

  const modifiedAt = params.object.lastModified?.getTime();
  return typeof modifiedAt === "number" && modifiedAt <= params.now - params.ttlMs;
};

function readPositiveDuration(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function listAssetStoragePaths() {
  const supabase = getSupabaseAdmin();
  const paths = new Set<string>();
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("assets")
      .select("storage_path")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    for (const row of data ?? []) {
      if (row.storage_path) paths.add(row.storage_path);
    }
    if ((data?.length ?? 0) < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return paths;
}

async function listLibraryStoragePaths() {
  const supabase = getSupabaseAdmin();
  const paths = new Set<string>();
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("library_assets")
      .select("thumb_storage_path, preview_storage_path, original_storage_path")
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw error;
    for (const row of data ?? []) {
      for (const path of [row.thumb_storage_path, row.preview_storage_path, row.original_storage_path]) {
        if (path) paths.add(path);
      }
    }
    if ((data?.length ?? 0) < PAGE_SIZE) break;
    offset += PAGE_SIZE;
  }

  return paths;
}

export async function runR2OrphanCleanup(params: {
  now?: number;
  ttlMs?: number;
  dryRun?: boolean;
} = {}) {
  const now = params.now ?? Date.now();
  const ttlMs = params.ttlMs ?? readPositiveDuration(process.env.R2_ORPHAN_CLEANUP_TTL_MS, DEFAULT_TTL_MS);
  const dryRun = params.dryRun ?? process.env.R2_ORPHAN_CLEANUP_DRY_RUN === "true";
  const [assetPaths, libraryPaths, objects] = await Promise.all([
    listAssetStoragePaths(),
    listLibraryStoragePaths(),
    listR2Objects(),
  ]);
  const referencedKeys = new Set([...assetPaths, ...libraryPaths]);
  const orphanKeys = objects
    .filter((object) => isExpiredUnreferencedR2Object({ object, referencedKeys, now, ttlMs }))
    .map((object) => object.key);

  if (!dryRun && orphanKeys.length > 0) {
    await deleteR2Objects(orphanKeys);
  }

  return {
    scannedObjects: objects.length,
    referencedObjects: referencedKeys.size,
    orphanObjects: orphanKeys.length,
    deletedObjects: dryRun ? 0 : orphanKeys.length,
    dryRun,
    ttlMs,
  };
}

export function startR2OrphanCleanupScheduler(params: { runWithLease?: RunWithMaintenanceLease } = {}) {
  if (process.env.R2_ORPHAN_CLEANUP_ENABLED === "false") {
    logger.info("R2 orphan cleanup scheduler disabled");
    return () => undefined;
  }

  const intervalMs = readPositiveDuration(process.env.R2_ORPHAN_CLEANUP_INTERVAL_MS, DEFAULT_INTERVAL_MS);
  let stopped = false;
  let inFlight = false;

  const run = async (trigger: "startup" | "interval") => {
    if (stopped || inFlight) return;
    inFlight = true;
    const execute = async () => {
      const result = await runR2OrphanCleanup();
      logger.info("R2 orphan cleanup completed", { trigger, ...result });
    };

    try {
      if (params.runWithLease) {
        await params.runWithLease("r2-orphan-cleanup", execute);
      } else {
        await execute();
      }
    } catch (error) {
      logger.error("R2 orphan cleanup failed", { trigger, error });
    } finally {
      inFlight = false;
    }
  };

  void run("startup");
  const intervalId = setInterval(() => void run("interval"), intervalMs);
  logger.info("R2 orphan cleanup scheduler started", { intervalMs });

  return () => {
    stopped = true;
    clearInterval(intervalId);
  };
}
