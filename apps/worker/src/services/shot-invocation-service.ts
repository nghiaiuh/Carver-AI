import { createHash } from "node:crypto";
import type { AiJobShotInvocationIdentity } from "@carver/shared";

export type ShotInvocationClaim =
  | {
      readonly kind: "claimed";
      readonly identity: AiJobShotInvocationIdentity;
      readonly claimToken: string;
    }
  | {
      readonly kind: "persisted";
      readonly identity: AiJobShotInvocationIdentity;
      readonly outputAssetId: string;
    }
  | {
      readonly kind: "outcome_unknown";
      readonly identity: AiJobShotInvocationIdentity;
    }
  | {
      readonly kind: "busy";
      readonly identity: AiJobShotInvocationIdentity;
    };

export type ShotInvocationStore = {
  claim(params: {
    jobId: string;
    projectId: string;
    ownerId: string;
    identity: AiJobShotInvocationIdentity;
  }): Promise<ShotInvocationClaim>;
  markOutcomeUnknown(params: {
    jobId: string;
    projectId: string;
    ownerId: string;
    identity: AiJobShotInvocationIdentity;
    claimToken: string;
    conditioningHash: string | null;
    requestedModel: string | null;
  }): Promise<void>;
  markPersisted(params: {
    jobId: string;
    projectId: string;
    ownerId: string;
    identity: AiJobShotInvocationIdentity;
    outputAssetId: string;
    claimToken?: string;
    conditioningHash: string | null;
    providerModel: string | null;
  }): Promise<void>;
};

const identityHash = (value: string) => createHash("sha256").update(value).digest("hex");

export const buildShotInvocationIdentity = (params: {
  jobId: string;
  shotSetNodeId: string;
  shotId: string;
  shotOrder: number;
  candidateIndex?: number;
}): AiJobShotInvocationIdentity => {
  const candidateIndex = params.candidateIndex ?? 0;
  const material = [params.jobId, params.shotSetNodeId, params.shotId, candidateIndex].join("\u0000");
  const digest = identityHash(material);

  return {
    invocationId: `shot-invocation:${digest}`,
    candidateId: `shot-candidate:${digest}`,
    shotSetNodeId: params.shotSetNodeId,
    shotId: params.shotId,
    shotOrder: params.shotOrder,
    candidateIndex,
  };
};

export class ShotInvocationOutcomeUnknownError extends Error {
  constructor(invocationId: string) {
    super(`Shot invocation ${invocationId} has an unknown provider outcome.`);
    this.name = "ShotInvocationOutcomeUnknownError";
  }
}

export class ShotInvocationBusyError extends Error {
  constructor(invocationId: string) {
    super(`Shot invocation ${invocationId} is currently claimed by another worker.`);
    this.name = "ShotInvocationBusyError";
  }
}
