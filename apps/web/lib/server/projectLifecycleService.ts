import "server-only";

import type { Database } from "@carver/db";
import { deleteR2Objects } from "@carver/storage/r2";
import type { SupabaseClient } from "@supabase/supabase-js";

export class ProjectHasActiveJobsError extends Error {
  constructor() {
    super("PROJECT_HAS_ACTIVE_JOBS");
  }
}

export class ProjectDeleteNotFoundError extends Error {
  constructor() {
    super("PROJECT_NOT_FOUND");
  }
}

async function deleteR2ObjectsInBatches(storagePaths: string[]) {
  for (let start = 0; start < storagePaths.length; start += 1000) {
    await deleteR2Objects(storagePaths.slice(start, start + 1000));
  }
}

/**
 * Deletes database metadata first. R2 cleanup is intentionally separate so a
 * transient storage outage cannot leave a project record pointing to missing
 * binaries; the orphan pass can safely finish a failed R2 cleanup later.
 */
export async function deleteOwnedProject(params: {
  supabase: SupabaseClient<Database>;
  projectId: string;
  ownerId: string;
}): Promise<{ r2CleanupPending: boolean }> {
  const { data: activeJobs, error: activeJobsError } = await params.supabase
    .from("ai_jobs")
    .select("id")
    .eq("project_id", params.projectId)
    .in("status", ["queued", "running"])
    .limit(1);
  if (activeJobsError) {
    throw new Error(activeJobsError.message);
  }
  if ((activeJobs ?? []).length > 0) {
    throw new ProjectHasActiveJobsError();
  }

  const { data: assets, error: assetsError } = await params.supabase
    .from("assets")
    .select("storage_path")
    .eq("project_id", params.projectId)
    .eq("owner_id", params.ownerId);
  if (assetsError) {
    throw new Error(assetsError.message);
  }

  const { data: deletedProject, error: deleteError } = await params.supabase
    .from("projects")
    .delete()
    .eq("id", params.projectId)
    .eq("owner_id", params.ownerId)
    .select("id")
    .maybeSingle();
  if (deleteError) {
    throw new Error(deleteError.message);
  }
  if (!deletedProject) {
    throw new ProjectDeleteNotFoundError();
  }

  const storagePaths = [...new Set(
    (assets ?? [])
      .map((asset) => asset.storage_path)
      .filter((storagePath): storagePath is string => typeof storagePath === "string" && storagePath.length > 0),
  )];

  try {
    await deleteR2ObjectsInBatches(storagePaths);
    return { r2CleanupPending: false };
  } catch {
    return { r2CleanupPending: true };
  }
}
