/*
 * Flow: Keeps R2-backed preset library metadata fresh without frontend sync buttons.
 * 1. Discover known user owners from DB metadata.
 * 2. Sync R2 objects into library_folders/library_assets with service-role access.
 * 3. Run on startup and a configurable interval, skipping overlapping runs.
 */

import { getSupabaseAdmin } from "@carver/db/server";
import { createSafeLogger } from "@carver/shared";
import { syncLibraryFromBucket } from "@carver/storage";

const logger = createSafeLogger("worker.library-sync");

const DEFAULT_INTERVAL_MS = 30 * 60 * 1000;

function readIntervalMs() {
  const raw = Number(process.env.LIBRARY_SYNC_INTERVAL_MS ?? DEFAULT_INTERVAL_MS);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_INTERVAL_MS;
}

async function listKnownOwnerIds() {
  const supabase = getSupabaseAdmin();
  const [profilesResult, projectsResult, foldersResult] = await Promise.all([
    supabase.from("profiles").select("id"),
    supabase.from("projects").select("owner_id"),
    supabase.from("library_folders").select("owner_id"),
  ]);

  for (const result of [profilesResult, projectsResult, foldersResult]) {
    if (result.error) {
      throw result.error;
    }
  }

  return [
    ...new Set([
      ...(profilesResult.data ?? []).map((profile) => profile.id),
      ...(projectsResult.data ?? []).map((project) => project.owner_id),
      ...(foldersResult.data ?? []).map((folder) => folder.owner_id),
    ].filter(Boolean)),
  ];
}

export function startLibrarySyncScheduler() {
  if (process.env.LIBRARY_R2_SYNC_ENABLED === "false") {
    logger.info("library sync scheduler disabled");
    return () => undefined;
  }

  const intervalMs = readIntervalMs();
  let stopped = false;
  let inFlight = false;
  let intervalId: NodeJS.Timeout | null = null;

  const runSync = async (trigger: "startup" | "interval") => {
    if (stopped || inFlight) {
      return;
    }

    inFlight = true;
    try {
      const ownerIds = await listKnownOwnerIds();
      logger.info("library sync started", {
        trigger,
        ownerCount: ownerIds.length,
      });

      for (const ownerId of ownerIds) {
        try {
          const result = await syncLibraryFromBucket({ ownerId });
          logger.info("library owner synced", {
            trigger,
            ownerId,
            createdAssets: result.summary.createdAssets,
            createdFolders: result.summary.createdFolders,
            failedAssets: result.summary.failedAssets,
            scannedObjects: result.summary.scannedObjects,
          });
        } catch (error) {
          logger.error("library owner sync failed", {
            trigger,
            ownerId,
            error,
          });
        }
      }
    } catch (error) {
      logger.error("library sync failed before owner loop", {
        trigger,
        error,
      });
    } finally {
      inFlight = false;
    }
  };

  void runSync("startup");
  intervalId = setInterval(() => {
    void runSync("interval");
  }, intervalMs);

  logger.info("library sync scheduler started", {
    intervalMs,
  });

  return () => {
    stopped = true;
    if (intervalId) {
      clearInterval(intervalId);
    }
  };
}
