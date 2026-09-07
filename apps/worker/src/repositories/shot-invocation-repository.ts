import { randomUUID } from "node:crypto";
import { getSupabaseAdmin } from "@carver/db/server";
import type { AiJobShotInvocationIdentity } from "@carver/shared";
import type { ShotInvocationClaim, ShotInvocationStore } from "../services/shot-invocation-service";

const CLAIM_LEASE_SECONDS = 5 * 60;

type ClaimRpcRow = {
  state_status?: string;
  invocation_id?: string;
  candidate_id?: string;
  output_asset_id?: string | null;
};

const assertInvocationIdentity = (params: {
  identity: AiJobShotInvocationIdentity;
  row: ClaimRpcRow;
}) => {
  if (params.row.invocation_id !== params.identity.invocationId || params.row.candidate_id !== params.identity.candidateId) {
    throw new Error("Shot invocation claim returned a mismatched durable identity.");
  }
};

const requireRpcSuccess = (value: unknown, operation: string) => {
  if (value !== true) {
    throw new Error(`Shot invocation ${operation} lost its compare-and-swap claim.`);
  }
};

const claim = async (params: {
  jobId: string;
  projectId: string;
  ownerId: string;
  identity: AiJobShotInvocationIdentity;
}): Promise<ShotInvocationClaim> => {
  const claimToken = randomUUID();
  const supabase = getSupabaseAdmin();
  const { data, error } = await (supabase as any).rpc("claim_ai_job_shot_invocation", {
    target_ai_job_id: params.jobId,
    target_project_id: params.projectId,
    target_owner_id: params.ownerId,
    target_shot_set_node_id: params.identity.shotSetNodeId,
    target_shot_id: params.identity.shotId,
    target_shot_order: params.identity.shotOrder,
    target_candidate_index: params.identity.candidateIndex,
    target_invocation_id: params.identity.invocationId,
    target_candidate_id: params.identity.candidateId,
    target_claim_token: claimToken,
    target_lease_seconds: CLAIM_LEASE_SECONDS,
  });
  if (error) throw error;

  const row = Array.isArray(data) ? (data[0] as ClaimRpcRow | undefined) : undefined;
  if (!row?.state_status) {
    throw new Error("Shot invocation claim returned no durable state.");
  }
  assertInvocationIdentity({ identity: params.identity, row });

  switch (row.state_status) {
    case "claimed":
      return { kind: "claimed", identity: params.identity, claimToken };
    case "persisted":
      if (!row.output_asset_id) {
        throw new Error("Persisted shot invocation is missing its output asset.");
      }
      return { kind: "persisted", identity: params.identity, outputAssetId: row.output_asset_id };
    case "outcome_unknown":
      return { kind: "outcome_unknown", identity: params.identity };
    case "busy":
      return { kind: "busy", identity: params.identity };
    default:
      throw new Error("Shot invocation claim returned an unsupported durable state.");
  }
};

const markOutcomeUnknown: ShotInvocationStore["markOutcomeUnknown"] = async (params) => {
  const supabase = getSupabaseAdmin();
  const { data, error } = await (supabase as any).rpc("mark_ai_job_shot_invocation_outcome_unknown", {
    target_ai_job_id: params.jobId,
    target_project_id: params.projectId,
    target_owner_id: params.ownerId,
    target_invocation_id: params.identity.invocationId,
    target_claim_token: params.claimToken,
    target_conditioning_hash: params.conditioningHash,
    target_requested_model: params.requestedModel,
  });
  if (error) throw error;
  requireRpcSuccess(data, "outcome reservation");
};

const markPersisted: ShotInvocationStore["markPersisted"] = async (params) => {
  const supabase = getSupabaseAdmin();
  const { data, error } = await (supabase as any).rpc("mark_ai_job_shot_invocation_persisted", {
    target_ai_job_id: params.jobId,
    target_project_id: params.projectId,
    target_owner_id: params.ownerId,
    target_shot_set_node_id: params.identity.shotSetNodeId,
    target_shot_id: params.identity.shotId,
    target_shot_order: params.identity.shotOrder,
    target_candidate_index: params.identity.candidateIndex,
    target_invocation_id: params.identity.invocationId,
    target_candidate_id: params.identity.candidateId,
    target_output_asset_id: params.outputAssetId,
    target_claim_token: params.claimToken ?? null,
    target_conditioning_hash: params.conditioningHash,
    target_provider_model: params.providerModel,
  });
  if (error) throw error;
  requireRpcSuccess(data, "persistence completion");
};

export const shotInvocationRepository: ShotInvocationStore = {
  claim,
  markOutcomeUnknown,
  markPersisted,
};
