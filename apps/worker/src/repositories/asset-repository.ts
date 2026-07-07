/*
 * Flow: Persists generated asset metadata for worker outputs.
 * 1. Insert asset rows linked to project ownership and source job.
 * 2. Keep DB writes separate from R2 upload operations.
 * 3. Return the created row so services can build job results.
 */

import { getSupabaseAdmin } from "@carver/db/server";
import type { Database } from "@carver/db";

export type AssetRow = Database["public"]["Tables"]["assets"]["Row"];

export const createGeneratedAsset = async (params: {
  assetId?: string;
  projectId: string;
  ownerId: string;
  storageBucket: string;
  storagePath: string;
  mimeType: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  sourceJobId: string;
  metadata: Record<string, unknown>;
}) => {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("assets")
    .upsert({
      id: params.assetId,
      project_id: params.projectId,
      owner_id: params.ownerId,
      kind: "generated",
      storage_bucket: params.storageBucket,
      storage_path: params.storagePath,
      mime_type: params.mimeType,
      width: params.width,
      height: params.height,
      size_bytes: params.sizeBytes,
      source_job_id: params.sourceJobId,
      metadata: params.metadata as never,
    }, { onConflict: "id" })
    .select()
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Unable to create generated asset metadata.");
  }

  return data as AssetRow;
};
