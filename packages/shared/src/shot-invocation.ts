/**
 * Durable execution state for one multi-angle candidate.
 *
 * `outcome_unknown` is intentional: a worker can crash after an external
 * provider receives a request but before Carver obtains a durable receipt.
 * Retrying that invocation would risk another paid call, so it must be
 * surfaced explicitly instead of being treated as pending work.
 */

export const AI_JOB_SHOT_INVOCATION_SCHEMA_VERSION = 1 as const;

export type AiJobShotInvocationStatus = "pending" | "outcome_unknown" | "persisted";

export type AiJobShotInvocationIdentity = {
  readonly invocationId: string;
  readonly candidateId: string;
  readonly shotSetNodeId: string;
  readonly shotId: string;
  readonly shotOrder: number;
  readonly candidateIndex: number;
};

export type AiJobShotInvocation = AiJobShotInvocationIdentity & {
  readonly schemaVersion: typeof AI_JOB_SHOT_INVOCATION_SCHEMA_VERSION;
  readonly aiJobId: string;
  readonly projectId: string;
  readonly ownerId: string;
  readonly status: AiJobShotInvocationStatus;
  readonly attemptCount: number;
  readonly conditioningHash: string | null;
  readonly requestedModel: string | null;
  readonly providerModel: string | null;
  readonly outputAssetId: string | null;
};
