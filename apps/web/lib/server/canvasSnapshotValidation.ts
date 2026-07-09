import "server-only";

import type { Database } from "@carver/db";
import type { CanvasSnapshotDocument } from "@carver/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { collectSnapshotAssetIds } from "../../app/canvas/utils/snapshotAssetRefs";

const MAX_SNAPSHOT_BYTES = 2_000_000;
const MAX_SNAPSHOT_NODES = 300;
const MAX_SNAPSHOT_EDGES = 600;

function hasUnsafeImageUrl(value: string | undefined) {
  if (!value) {
    return false;
  }

  return (
    value.startsWith("data:") ||
    value.startsWith("blob:") ||
    value.startsWith("file:") ||
    value.includes("base64,")
  );
}

export function validateCanvasSnapshotDocument(document: CanvasSnapshotDocument) {
  const encoded = JSON.stringify(document);
  if (encoded.length > MAX_SNAPSHOT_BYTES) {
    return "Snapshot payload is too large.";
  }

  if (document.graph.nodes.length > MAX_SNAPSHOT_NODES) {
    return "Snapshot has too many nodes.";
  }

  if (document.graph.edges.length > MAX_SNAPSHOT_EDGES) {
    return "Snapshot has too many edges.";
  }

  const nodeIds = new Set(document.graph.nodes.map((node) => node.id));
  if (
    document.graph.activeGenerationTargetId &&
    !nodeIds.has(document.graph.activeGenerationTargetId)
  ) {
    return "Snapshot activeGenerationTargetId is invalid.";
  }

  for (const node of document.graph.nodes) {
    if (hasUnsafeImageUrl(node.imageUrl) || hasUnsafeImageUrl(node.sourceImage?.url)) {
      return "Snapshot contains unsupported local image URLs.";
    }

    if (!nodeIds.has(node.id)) {
      return "Snapshot contains an invalid node id.";
    }

    if (!node.presetGroup) {
      continue;
    }

    for (const child of node.presetGroup.children) {
      if (hasUnsafeImageUrl(child.imageSrc) || hasUnsafeImageUrl(child.sourceImage?.url)) {
        return "Snapshot contains unsupported preset image URLs.";
      }
    }
  }

  for (const edge of document.graph.edges) {
    if (!nodeIds.has(edge.sourceId) || !nodeIds.has(edge.targetId)) {
      return "Snapshot contains edges that reference missing nodes.";
    }
  }

  return null;
}

export async function validateSnapshotAssetOwnership(params: {
  supabase: SupabaseClient<Database>;
  projectId: string;
  userId: string;
  document: CanvasSnapshotDocument;
}) {
  const assetIds = collectSnapshotAssetIds(params.document);
  if (assetIds.length === 0) {
    return null;
  }

  const [projectAssetsResult, libraryAssetsResult] = await Promise.all([
    params.supabase
      .from("assets")
      .select("id")
      .eq("owner_id", params.userId)
      .eq("project_id", params.projectId)
      .in("id", assetIds),
    params.supabase
      .from("library_assets")
      .select("id")
      .eq("owner_id", params.userId)
      .in("id", assetIds),
  ]);

  if (projectAssetsResult.error || libraryAssetsResult.error) {
    return "Unable to validate snapshot assets.";
  }

  const ownedAssetIds = new Set([
    ...(projectAssetsResult.data ?? []).map((asset) => asset.id),
    ...(libraryAssetsResult.data ?? []).map((asset) => asset.id),
  ]);

  for (const assetId of assetIds) {
    if (!ownedAssetIds.has(assetId)) {
      return "Snapshot contains an asset that is not available in this project.";
    }
  }

  return null;
}
