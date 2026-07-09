import "server-only";

import type { Database } from "@carver/db";
import {
  coerceCanvasSnapshotDocument,
  createEmptyCanvasSnapshotDocument,
  type CanvasSnapshotDocument,
} from "@carver/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

type CanvasSnapshotRow = Database["public"]["Tables"]["canvas_snapshots"]["Row"];
type SaveProjectCanvasSnapshotRpcRow = {
  created_at: string;
  document_hash: string | null;
  is_user_visible: boolean;
  snapshot_kind: string;
  snapshot_id: string;
  version: number;
};
type ProjectSnapshotRpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{
    data: SaveProjectCanvasSnapshotRpcRow[] | null;
    error: { message: string } | null;
  }>;
};

export type ProjectCanvasSnapshotMeta = {
  snapshotId: string;
  version: number;
  createdAt: string;
  snapshotKind: string;
  isUserVisible: boolean;
  documentHash: string | null;
};

export async function loadCurrentProjectSnapshot(
  supabase: SupabaseClient<Database>,
  projectId: string,
): Promise<{
  document: CanvasSnapshotDocument;
  snapshot: ProjectCanvasSnapshotMeta | null;
}> {
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id, current_canvas_snapshot_id")
    .eq("id", projectId)
    .maybeSingle();

  if (projectError) {
    throw new Error(projectError.message);
  }

  const currentSnapshotId = project?.current_canvas_snapshot_id ?? null;
  if (!project || !currentSnapshotId) {
    return {
      document: createEmptyCanvasSnapshotDocument(),
      snapshot: null,
    };
  }

  const { data: snapshot, error: snapshotError } = await supabase
    .from("canvas_snapshots")
    .select("id, project_id, version, canvas_json, created_at, snapshot_kind, is_user_visible, document_hash")
    .eq("id", currentSnapshotId)
    .eq("project_id", projectId)
    .maybeSingle();

  if (snapshotError) {
    throw new Error(snapshotError.message);
  }

  if (!snapshot || snapshot.id !== currentSnapshotId || snapshot.project_id !== projectId) {
    return {
      document: createEmptyCanvasSnapshotDocument(),
      snapshot: null,
    };
  }

  return {
    document: coerceCanvasSnapshotDocument(snapshot.canvas_json),
    snapshot: mapSnapshotMeta(snapshot),
  };
}

export async function saveProjectSnapshot(
  supabase: SupabaseClient<Database>,
  params: {
    projectId: string;
    snapshot: CanvasSnapshotDocument;
    reason?: "initial" | "manual" | "close" | "job_checkpoint";
    documentHash?: string | null;
  },
): Promise<ProjectCanvasSnapshotMeta> {
  const rpcClient = supabase as unknown as ProjectSnapshotRpcClient;
  const { data, error } = await rpcClient.rpc("save_project_canvas_snapshot", {
    target_project_id: params.projectId,
    snapshot_canvas_json: params.snapshot,
    snapshot_reason: params.reason ?? "manual",
    snapshot_document_hash: params.documentHash ?? null,
  });

  if (error) {
    throw new Error(error.message);
  }

  const savedSnapshot = data?.[0];
  if (!savedSnapshot) {
    throw new Error("Snapshot save RPC returned no snapshot row.");
  }

  return {
    snapshotId: savedSnapshot.snapshot_id,
    version: savedSnapshot.version,
    createdAt: savedSnapshot.created_at,
    snapshotKind: savedSnapshot.snapshot_kind,
    isUserVisible: savedSnapshot.is_user_visible,
    documentHash: savedSnapshot.document_hash,
  };
}

function mapSnapshotMeta(
  snapshot: Pick<CanvasSnapshotRow, "id" | "version" | "created_at" | "snapshot_kind" | "is_user_visible" | "document_hash">,
): ProjectCanvasSnapshotMeta {
  return {
    snapshotId: snapshot.id,
    version: snapshot.version,
    createdAt: snapshot.created_at,
    snapshotKind: snapshot.snapshot_kind,
    isUserVisible: snapshot.is_user_visible,
    documentHash: snapshot.document_hash,
  };
}
