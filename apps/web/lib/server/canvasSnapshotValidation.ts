import "server-only";

import type { Database } from "@carver/db";
import type { CanvasSnapshotDocument } from "@carver/shared";
import type { SupabaseClient } from "@supabase/supabase-js";
import { collectSnapshotAssetIds } from "../../app/canvas/utils/snapshotAssetRefs";

const MAX_SNAPSHOT_BYTES = 5_000_000;
const MAX_SNAPSHOT_NODES = 300;
const MAX_SNAPSHOT_EDGES = 600;
const MAX_SNAPSHOT_MARKERS = 200;
const MAX_SNAPSHOT_ADDED_OBJECTS = 200;
const MAX_SNAPSHOT_SKETCH_LINES = 400;
const MAX_SNAPSHOT_SKETCH_GROUPS = 200;
const MAX_SNAPSHOT_PEN_STROKES = 400;
const MAX_MASK_HISTORY_ENTRIES = 10;

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

  if (document.markers.length > MAX_SNAPSHOT_MARKERS) {
    return "Snapshot has too many markers.";
  }

  if (document.addedObjects.length > MAX_SNAPSHOT_ADDED_OBJECTS) {
    return "Snapshot has too many added objects.";
  }

  if (document.sketchLines.length > MAX_SNAPSHOT_SKETCH_LINES) {
    return "Snapshot has too many sketch lines.";
  }

  if (document.sketchGroups.length > MAX_SNAPSHOT_SKETCH_GROUPS) {
    return "Snapshot has too many sketch groups.";
  }

  if (document.penStrokes.length > MAX_SNAPSHOT_PEN_STROKES) {
    return "Snapshot has too many pen strokes.";
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

    if (node.regionMask && !node.regionMask.dataUrl.startsWith("data:image/")) {
      return "Snapshot contains an invalid region mask.";
    }

    if (
      node.maskHistory &&
      (node.maskHistory.past.length > MAX_MASK_HISTORY_ENTRIES ||
        node.maskHistory.future.length > MAX_MASK_HISTORY_ENTRIES)
    ) {
      return "Snapshot contains too much mask history.";
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

  const sketchLineIds = new Set(document.sketchLines.map((line) => line.id));
  for (const group of document.sketchGroups) {
    for (const lineId of group.lineIds) {
      if (!sketchLineIds.has(lineId)) {
        return "Snapshot contains a sketch group with missing lines.";
      }
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
