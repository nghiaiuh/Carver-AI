import "server-only";

import type { Database } from "@carver/db";
import {
  coerceCanvasSnapshotDocument,
  type CanvasSnapshotDocument,
} from "@carver/shared";
import type { SupabaseClient } from "@supabase/supabase-js";

type ProjectCanvasDraftRow = {
  project_id: string;
  owner_id: string;
  base_snapshot_id: string | null;
  revision: number;
  document_hash: string | null;
  canvas_json: unknown;
  last_mutation_id: string | null;
  updated_at: string;
};

type ProjectCanvasDraftRpcRow = {
  project_id: string;
  owner_id: string;
  base_snapshot_id: string | null;
  revision: number;
  document_hash: string | null;
  last_mutation_id: string | null;
  updated_at: string;
};

type FinalizeProjectCanvasDraftRpcRow = {
  snapshot_id: string;
  version: number;
  created_at: string;
  snapshot_kind: string;
  is_user_visible: boolean;
  document_hash: string | null;
  base_snapshot_id: string | null;
  draft_revision: number;
};

type DraftRpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{
    data: ProjectCanvasDraftRpcRow[] | FinalizeProjectCanvasDraftRpcRow[] | null;
    error: { message: string } | null;
  }>;
};

export class ProjectCanvasDraftConflictError extends Error {}

export type ProjectCanvasDraftMeta = {
  projectId: string;
  ownerId: string;
  baseSnapshotId: string | null;
  revision: number;
  documentHash: string | null;
  lastMutationId: string | null;
  updatedAt: string;
};

export type FinalizedProjectCanvasSnapshotMeta = {
  snapshotId: string;
  version: number;
  createdAt: string;
  snapshotKind: string;
  isUserVisible: boolean;
  documentHash: string | null;
  baseSnapshotId: string | null;
  draftRevision: number;
};

function toDraftMeta(row: Pick<
  ProjectCanvasDraftRow,
  "project_id" | "owner_id" | "base_snapshot_id" | "revision" | "document_hash" | "last_mutation_id" | "updated_at"
>): ProjectCanvasDraftMeta {
  return {
    projectId: row.project_id,
    ownerId: row.owner_id,
    baseSnapshotId: row.base_snapshot_id,
    revision: row.revision,
    documentHash: row.document_hash,
    lastMutationId: row.last_mutation_id,
    updatedAt: row.updated_at,
  };
}

function isDraftConflictMessage(message: string) {
  return message.includes("DRAFT_CONFLICT");
}

function throwIfConflict(message: string): never {
  if (isDraftConflictMessage(message)) {
    throw new ProjectCanvasDraftConflictError("DRAFT_CONFLICT");
  }

  throw new Error(message);
}

export async function loadProjectCanvasDraft(
  supabase: SupabaseClient<Database>,
  projectId: string,
): Promise<{
  document: CanvasSnapshotDocument | null;
  draft: ProjectCanvasDraftMeta | null;
}> {
  const { data, error } = await supabase
    .from("project_canvas_drafts" as never)
    .select("project_id, owner_id, base_snapshot_id, revision, document_hash, canvas_json, last_mutation_id, updated_at")
    .eq("project_id" as never, projectId)
    .maybeSingle();
  const row = data as ProjectCanvasDraftRow | null;

  if (error) {
    throw new Error(error.message);
  }

  if (!row) {
    return {
      document: null,
      draft: null,
    };
  }

  return {
    document: coerceCanvasSnapshotDocument(row.canvas_json),
    draft: toDraftMeta(row),
  };
}

export async function saveProjectCanvasDraft(
  supabase: SupabaseClient<Database>,
  params: {
    projectId: string;
    expectedRevision: number | null;
    document: CanvasSnapshotDocument;
    documentHash: string | null;
    lastMutationId: string | null;
    baseSnapshotId?: string | null;
  },
) {
  const rpcClient = supabase as unknown as DraftRpcClient;
  const { data, error } = await rpcClient.rpc("upsert_project_canvas_draft", {
    target_project_id: params.projectId,
    expected_revision: params.expectedRevision,
    draft_canvas_json: params.document,
    draft_document_hash: params.documentHash,
    draft_last_mutation_id: params.lastMutationId,
    draft_base_snapshot_id: params.baseSnapshotId ?? null,
  });

  if (error) {
    throwIfConflict(error.message);
  }

  const savedDraft = (data as ProjectCanvasDraftRpcRow[] | null)?.[0];
  if (!savedDraft) {
    throw new Error("Draft save RPC returned no draft row.");
  }

  return {
    projectId: savedDraft.project_id,
    ownerId: savedDraft.owner_id,
    baseSnapshotId: savedDraft.base_snapshot_id,
    revision: savedDraft.revision,
    documentHash: savedDraft.document_hash,
    lastMutationId: savedDraft.last_mutation_id,
    updatedAt: savedDraft.updated_at,
  } satisfies ProjectCanvasDraftMeta;
}

export async function finalizeProjectCanvasDraft(
  supabase: SupabaseClient<Database>,
  params: {
    projectId: string;
    expectedRevision: number;
    reason: "manual" | "close" | "job_checkpoint";
  },
) {
  const rpcClient = supabase as unknown as DraftRpcClient;
  const { data, error } = await rpcClient.rpc("finalize_project_canvas_draft", {
    target_project_id: params.projectId,
    expected_revision: params.expectedRevision,
    snapshot_reason: params.reason,
  });

  if (error) {
    throwIfConflict(error.message);
  }

  const snapshot = (data as FinalizeProjectCanvasDraftRpcRow[] | null)?.[0];
  if (!snapshot) {
    throw new Error("Draft finalize RPC returned no snapshot row.");
  }

  return {
    snapshotId: snapshot.snapshot_id,
    version: snapshot.version,
    createdAt: snapshot.created_at,
    snapshotKind: snapshot.snapshot_kind,
    isUserVisible: snapshot.is_user_visible,
    documentHash: snapshot.document_hash,
    baseSnapshotId: snapshot.base_snapshot_id,
    draftRevision: snapshot.draft_revision,
  } satisfies FinalizedProjectCanvasSnapshotMeta;
}
