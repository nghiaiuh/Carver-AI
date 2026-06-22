/*
 * Flow: Defines shared AI job contracts.
 * 1. Serialize user intent, snapshot context, and execution metadata.
 * 2. Keep queue payloads aligned with database records.
 * 3. Let web and worker speak the same job language.
 */

import type { CanvasSnapshotDocument } from "./snapshot";

export type CarverJobKind =
  | "generate_concept"
  | "refine_concept"
  | "analyze_reference"
  | "export";

export type CarverEditIntent =
  | "generate"
  | "refine"
  | "replace"
  | "remove"
  | "beautify"
  | "analyze";

export type CarverEditBrief = {
  goal: string;
  intent: CarverEditIntent;
  preserveExactly: string[];
  changeOnly: string[];
  styleRequirements: string[];
  avoid: string[];
  selectedObjectIds: string[];
  selectedRegionIds: string[];
  lockSummaries: string[];
};

export type CreateAiJobRequest = {
  projectId: string;
  jobType: CarverJobKind;
  prompt: string;
  inputSnapshotId?: string;
  threadId?: string;
  promptMode?: "auto" | "review" | "expert";
  referenceAssetIds?: string[];
  selection?: Partial<CanvasSnapshotDocument["selection"]>;
};

export type CarverAiJobPayload = {
  jobId: string;
  projectId: string;
  userId: string;
  jobType: CarverJobKind;
  prompt: string;
  inputSnapshotId: string;
  threadId?: string | null;
  promptMode: "auto" | "review" | "expert";
  snapshot: CanvasSnapshotDocument;
  referenceAssetIds: string[];
};
