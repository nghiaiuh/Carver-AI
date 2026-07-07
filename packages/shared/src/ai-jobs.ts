/*
 * Flow: Defines shared AI job contracts.
 * 1. Serialize user intent, snapshot context, and execution metadata.
 * 2. Keep queue payloads aligned with database records.
 * 3. Let web and worker speak the same job language.
 */

import type { CanvasReferenceRole, CanvasSnapshotDocument } from "./snapshot";

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

export type CanvasGenerationTarget = {
  nodeId: string;
  title: string;
  imageUrl: string;
  role: string;
  prompt: string | null;
};

export type CanvasGenerationImageReference = {
  nodeId: string;
  title: string;
  imageUrl: string;
  role: CanvasReferenceRole | string;
  sourcePresetChildId?: string | null;
};

export type CanvasGenerationPresetReference = {
  nodeId: string;
  category: string;
  childId?: string | null;
  slot?: string | null;
  label: string;
  imageSrc: string;
  role: CanvasReferenceRole | string;
};

export type CanvasGenerationContext = {
  target: CanvasGenerationTarget;
  imageReferences: CanvasGenerationImageReference[];
  presetReferences: CanvasGenerationPresetReference[];
  preserveRules: string[];
  referenceSummary: string;
  connectionSummary: string;
};

export type GeneratedCanvasImage = {
  id: string;
  title: string;
  imageUrl: string;
  width: number | null;
  height: number | null;
  prompt: string;
  assetId?: string;
  mimeType?: string;
  provider?: string;
};

export type CanvasGenerationAssistantMessage = {
  id: string;
  role: "assistant";
  content: string;
  createdAt: string;
  generatedImages: GeneratedCanvasImage[];
};

export type CarverCompiledPromptMeta = {
  taskType: string;
  editScope: string;
  riskLevel: string;
  targetArea: string | null;
  targetObject: string | null;
  formulaUsed: string;
  shouldShowReview: boolean;
};

export type CarverAiJobResultStage = "brief_ready" | "prompt_compiled" | "generated";

export type CarverAiJobResult = {
  stage: CarverAiJobResultStage;
  provider: string | null;
  editBrief: CarverEditBrief;
  compiledPromptMeta: CarverCompiledPromptMeta | null;
  generatedImages: GeneratedCanvasImage[];
  assistantMessage: CanvasGenerationAssistantMessage | null;
  outputAssetIds: string[];
  outputSnapshotId: string | null;
};

export type CarverAiJobRecord = {
  id: string;
  projectId: string;
  threadId: string | null;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled";
  jobType: CarverJobKind;
  prompt: string | null;
  inputSnapshotId: string | null;
  outputSnapshotId: string | null;
  outputAssetIds: string[];
  provider: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  jobResult: CarverAiJobResult | null;
};

export type CreateAiJobRequest = {
  projectId: string;
  jobType: CarverJobKind;
  prompt: string;
  idempotencyKey?: string;
  inputSnapshotId?: string;
  threadId?: string;
  promptMode?: "auto" | "review" | "expert";
  referenceAssetIds?: string[];
  selection?: Partial<CanvasSnapshotDocument["selection"]>;
  snapshot?: CanvasSnapshotDocument;
  targetNodeId?: string;
  canvasGraphContext?: CanvasGenerationContext;
};

export type QueuedCarverAiJobPayload = {
  jobId: string;
  requestId?: string;
  idempotencyKey?: string;
};

export type CarverAiJobPayload = {
  jobId: string;
  projectId: string;
  userId: string;
  jobType: CarverJobKind;
  prompt: string;
  inputSnapshotId: string | null;
  threadId?: string | null;
  promptMode: "auto" | "review" | "expert";
  snapshot: CanvasSnapshotDocument;
  referenceAssetIds: string[];
  targetNodeId?: string;
  canvasGraphContext?: CanvasGenerationContext;
};
