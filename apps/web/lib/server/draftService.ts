import "server-only";

import type { Database } from "@carver/db";
import {
  applyCanvasDraftOperations,
  coerceCanvasSnapshotDocument,
  getCanvasOperationConflict,
  type CanvasDraftOperation,
  type CanvasOperationV2,
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

type CommitProjectCanvasOperationBatchRpcRow = ProjectCanvasDraftRpcRow & {
  batch_id: string;
  acked_operation_ids: string[];
};

type ProjectCanvasDraftOperationRow = {
  operation_id: string;
  project_id: string;
  client_id: string;
  client_sequence: number;
  batch_id: string;
  base_revision: number;
  committed_revision: number;
  entity_key: string;
  operation_type: CanvasDraftOperation["type"];
  payload: CanvasDraftOperation;
  created_at: string;
};

type ProjectCanvasRecoveryRow = {
  id: string;
  project_id: string;
  created_by: string;
  client_id: string;
  base_revision: number;
  cloud_revision: number;
  document_hash: string;
  canvas_json: unknown;
  conflicting_entity_keys: string[];
  reason: string;
  created_at: string;
  resolved_at: string | null;
};

type DraftRpcClient = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{
    data: ProjectCanvasDraftRpcRow[] | FinalizeProjectCanvasDraftRpcRow[] | CommitProjectCanvasOperationBatchRpcRow[] | null;
    error: { message: string; code?: string; details?: string; hint?: string } | null;
  }>;
};

export class ProjectCanvasDraftConflictError extends Error {}
export class ProjectCanvasDraftProjectNotFoundError extends Error {}
export class ProjectCanvasDraftSchemaError extends Error {}
export class ProjectCanvasDraftPermissionError extends Error {}
export class ProjectCanvasDraftEntityConflictError extends Error {
  constructor(readonly entityKeys: string[]) {
    super("DRAFT_ENTITY_CONFLICT");
  }
}

export type ProjectCanvasDraftServiceErrorCode =
  | "PROJECT_NOT_FOUND"
  | "DRAFT_CONFLICT"
  | "DRAFT_SCHEMA_ERROR"
  | "DRAFT_PERMISSION_ERROR"
  | "DRAFT_ENTITY_CONFLICT"
  | "DRAFT_SAVE_FAILED"
  | "DRAFT_LOAD_FAILED"
  | "DRAFT_FINALIZE_FAILED";

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

function isDraftProjectNotFoundMessage(message: string) {
  return message.includes("PROJECT_NOT_FOUND");
}

function isDraftConflictMessage(message: string) {
  return message.includes("DRAFT_CONFLICT");
}

function isDraftSchemaMessage(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("function public.upsert_project_canvas_draft") ||
    normalized.includes("function public.finalize_project_canvas_draft") ||
    normalized.includes("function upsert_project_canvas_draft") ||
    normalized.includes("function finalize_project_canvas_draft") ||
    normalized.includes("could not find the function") ||
    normalized.includes("project_canvas_drafts") ||
    normalized.includes("schema cache") ||
    normalized.includes("does not exist")
  );
}

function isDraftPermissionMessage(message: string) {
  const normalized = message.toLowerCase();
  return (
    normalized.includes("permission denied") ||
    normalized.includes("row-level security") ||
    normalized.includes("violates row-level security")
  );
}

export function getProjectCanvasDraftErrorMessage(error: unknown, fallback: string) {
  // Database/RPC details belong in safe server logs, never in browser responses.
  return fallback;
}

export function getProjectCanvasDraftErrorCode(
  error: unknown,
  fallback: ProjectCanvasDraftServiceErrorCode,
): ProjectCanvasDraftServiceErrorCode {
  if (error instanceof ProjectCanvasDraftProjectNotFoundError) {
    return "PROJECT_NOT_FOUND";
  }

  if (error instanceof ProjectCanvasDraftConflictError) {
    return "DRAFT_CONFLICT";
  }

  if (error instanceof ProjectCanvasDraftEntityConflictError) {
    return "DRAFT_ENTITY_CONFLICT";
  }

  if (error instanceof ProjectCanvasDraftSchemaError) {
    return "DRAFT_SCHEMA_ERROR";
  }

  if (error instanceof ProjectCanvasDraftPermissionError) {
    return "DRAFT_PERMISSION_ERROR";
  }

  return fallback;
}

export function getProjectCanvasDraftErrorStatus(error: unknown) {
  if (error instanceof ProjectCanvasDraftProjectNotFoundError) {
    return 404;
  }

  if (error instanceof ProjectCanvasDraftConflictError) {
    return 409;
  }

  if (error instanceof ProjectCanvasDraftEntityConflictError) {
    return 409;
  }

  if (error instanceof ProjectCanvasDraftSchemaError || error instanceof ProjectCanvasDraftPermissionError) {
    return 500;
  }

  return 500;
}

function toOperationV2(row: ProjectCanvasDraftOperationRow): CanvasOperationV2 {
  return {
    operationId: row.operation_id,
    projectId: row.project_id,
    clientId: row.client_id,
    clientSequence: row.client_sequence,
    committedRevision: row.committed_revision,
    baseRevision: row.base_revision,
    entityKey: row.entity_key,
    type: row.operation_type,
    payload: row.payload,
    createdAt: row.created_at,
  };
}

export type ProjectCanvasRecovery = {
  id: string;
  projectId: string;
  clientId: string;
  baseRevision: number;
  cloudRevision: number;
  documentHash: string;
  document: CanvasSnapshotDocument;
  conflictingEntityKeys: string[];
  reason: string;
  createdAt: string;
  resolvedAt: string | null;
};

function toRecovery(row: ProjectCanvasRecoveryRow): ProjectCanvasRecovery {
  return {
    id: row.id,
    projectId: row.project_id,
    clientId: row.client_id,
    baseRevision: row.base_revision,
    cloudRevision: row.cloud_revision,
    documentHash: row.document_hash,
    document: coerceCanvasSnapshotDocument(row.canvas_json),
    conflictingEntityKeys: row.conflicting_entity_keys ?? [],
    reason: row.reason,
    createdAt: row.created_at,
    resolvedAt: row.resolved_at,
  };
}

function createDocumentHash(document: CanvasSnapshotDocument) {
  const serialized = JSON.stringify(document);
  let hash = 2166136261;
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function throwIfConflict(message: string): never {
  if (isDraftProjectNotFoundMessage(message)) {
    throw new ProjectCanvasDraftProjectNotFoundError("PROJECT_NOT_FOUND");
  }

  if (isDraftConflictMessage(message)) {
    throw new ProjectCanvasDraftConflictError("DRAFT_CONFLICT");
  }

  if (isDraftSchemaMessage(message)) {
    throw new ProjectCanvasDraftSchemaError(message);
  }

  if (isDraftPermissionMessage(message)) {
    throw new ProjectCanvasDraftPermissionError(message);
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
    if (isDraftSchemaMessage(error.message)) {
      throw new ProjectCanvasDraftSchemaError(error.message);
    }

    if (isDraftPermissionMessage(error.message)) {
      throw new ProjectCanvasDraftPermissionError(error.message);
    }

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
    actorUserId: string;
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
    actor_user_id: params.actorUserId,
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

export async function listProjectCanvasDraftOperations(
  supabase: SupabaseClient<Database>,
  params: { projectId: string; afterRevision: number },
) {
  const { data, error } = await supabase
    .from("project_canvas_draft_operations" as never)
    .select("operation_id, project_id, client_id, client_sequence, batch_id, base_revision, committed_revision, entity_key, operation_type, payload, created_at")
    .eq("project_id" as never, params.projectId)
    .gt("committed_revision" as never, params.afterRevision)
    .order("committed_revision" as never, { ascending: true })
    .order("created_at" as never, { ascending: true });

  if (error) {
    if (isDraftSchemaMessage(error.message)) {
      throw new ProjectCanvasDraftSchemaError(error.message);
    }
    throw new Error(error.message);
  }

  return ((data ?? []) as ProjectCanvasDraftOperationRow[]).map(toOperationV2);
}

export async function commitProjectCanvasOperationBatch(
  supabase: SupabaseClient<Database>,
  params: {
    actorUserId: string;
    projectId: string;
    expectedRevision: number;
    batchId: string;
    clientId: string;
    baseSnapshotId: string | null;
    operations: CanvasOperationV2[];
    cloudDocument: CanvasSnapshotDocument;
    documentHash: string;
  },
) {
  const latest = await loadProjectCanvasDraft(supabase, params.projectId);
  const actualRevision = latest.draft?.revision ?? 0;
  const operations = params.operations;
  let rebased = false;

  if (actualRevision !== params.expectedRevision) {
    const remoteOperations = await listProjectCanvasDraftOperations(supabase, {
      projectId: params.projectId,
      afterRevision: params.expectedRevision,
    });
    const conflict = getCanvasOperationConflict(operations, remoteOperations);
    if (conflict.hasConflict) {
      throw new ProjectCanvasDraftEntityConflictError(conflict.entityKeys);
    }
    rebased = true;
  }

  const resultingDocument = applyCanvasDraftOperations(
    // A project may not have a mutable draft yet. In that first batch the
    // client branch is rooted in the immutable snapshot, so use its validated
    // materialized document as the base instead of accidentally starting empty.
    latest.document ?? params.cloudDocument,
    operations.map((operation) => operation.payload),
  );
  const resultingDocumentHash = createDocumentHash(resultingDocument);
  const rpcClient = supabase as unknown as DraftRpcClient;
  const { data, error } = await rpcClient.rpc("commit_project_canvas_operation_batch", {
    actor_user_id: params.actorUserId,
    target_project_id: params.projectId,
    expected_revision: actualRevision,
    target_batch_id: params.batchId,
    target_client_id: params.clientId,
    batch_operations: operations,
    resulting_canvas_json: resultingDocument,
    resulting_document_hash: resultingDocumentHash,
    draft_base_snapshot_id: params.baseSnapshotId,
  });
  if (error) {
    throwIfConflict(error.message);
  }

  const savedDraft = (data as CommitProjectCanvasOperationBatchRpcRow[] | null)?.[0];
  if (!savedDraft) {
    throw new Error("Draft operation batch RPC returned no draft row.");
  }

  return {
    draft: toDraftMeta(savedDraft),
    batchId: savedDraft.batch_id,
    ackedOperationIds: savedDraft.acked_operation_ids ?? operations.map((operation) => operation.operationId),
    document: resultingDocument,
    rebased,
  };
}

export async function createProjectCanvasRecovery(
  supabase: SupabaseClient<Database>,
  params: {
    projectId: string;
    actorUserId: string;
    clientId: string;
    baseRevision: number;
    cloudRevision: number;
    documentHash: string;
    document: CanvasSnapshotDocument;
    conflictingEntityKeys: string[];
    reason: string;
  },
) {
  const { data, error } = await supabase
    .from("project_canvas_recoveries" as never)
    .insert({
      project_id: params.projectId,
      created_by: params.actorUserId,
      client_id: params.clientId,
      base_revision: params.baseRevision,
      cloud_revision: params.cloudRevision,
      document_hash: params.documentHash,
      canvas_json: params.document,
      conflicting_entity_keys: params.conflictingEntityKeys,
      reason: params.reason,
    } as never)
    .select("id, project_id, created_by, client_id, base_revision, cloud_revision, document_hash, canvas_json, conflicting_entity_keys, reason, created_at, resolved_at")
    .single();

  if (error || !data) {
    throw new Error(error?.message ?? "Recovery save returned no row.");
  }
  return toRecovery(data as ProjectCanvasRecoveryRow);
}

export async function listProjectCanvasRecoveries(
  supabase: SupabaseClient<Database>,
  projectId: string,
) {
  const { data, error } = await supabase
    .from("project_canvas_recoveries" as never)
    .select("id, project_id, created_by, client_id, base_revision, cloud_revision, document_hash, canvas_json, conflicting_entity_keys, reason, created_at, resolved_at")
    .eq("project_id" as never, projectId)
    .is("resolved_at" as never, null)
    .order("created_at" as never, { ascending: false });
  if (error) {
    throw new Error(error.message);
  }
  return ((data ?? []) as ProjectCanvasRecoveryRow[]).map(toRecovery);
}

export async function resolveProjectCanvasRecovery(
  supabase: SupabaseClient<Database>,
  params: { projectId: string; recoveryId: string },
) {
  const { error } = await supabase
    .from("project_canvas_recoveries" as never)
    .update({ resolved_at: new Date().toISOString() } as never)
    .eq("id" as never, params.recoveryId)
    .eq("project_id" as never, params.projectId);
  if (error) {
    throw new Error(error.message);
  }
}

export async function finalizeProjectCanvasDraft(
  supabase: SupabaseClient<Database>,
  params: {
    actorUserId: string;
    projectId: string;
    expectedRevision: number;
    reason: "manual" | "close" | "job_checkpoint";
  },
) {
  const rpcClient = supabase as unknown as DraftRpcClient;
  const { data, error } = await rpcClient.rpc("finalize_project_canvas_draft", {
    actor_user_id: params.actorUserId,
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
