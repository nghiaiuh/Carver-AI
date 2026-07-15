/*
 * Flow: Defines shared AI job contracts.
 * 1. Serialize user intent, snapshot context, and execution metadata.
 * 2. Keep queue payloads aligned with database records.
 * 3. Let web and worker speak the same job language.
 */

import type { CanvasReferenceRole, CanvasSnapshotDocument } from "./snapshot";
import type {
  ExecutionDecision,
  ExecutionRevalidationContract,
  GenerationPromptResultV2,
  PromptExecutionMode,
  PromptPlanV2,
  PromptRiskAssessment,
  PromptWarning,
  ReviewReason,
  TrustedTarget,
  ValidatedReference,
} from "./prompt-engine";

export type CarverJobKind =
  | "generate_concept"
  | "refine_concept"
  | "analyze_reference"
  | "export";

export type CarverImageExecutionMode = PromptExecutionMode;

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
  assetId?: string;
  role: string;
  prompt: string | null;
};

export type CanvasGenerationImageReference = {
  nodeId: string;
  title: string;
  imageUrl: string;
  assetId?: string;
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
  assetId?: string;
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

export type PersistedGeneratedImage = {
  id: string;
  title: string;
  imageUrl: "";
  width: number | null;
  height: number | null;
  prompt: string;
  assetId?: string;
  mimeType?: string;
  provider?: string;
};

export type RuntimeGeneratedImage = Omit<PersistedGeneratedImage, "imageUrl"> & {
  imageUrl: string;
  expiresAt?: string;
};

// Compatibility alias: DB/job_result should persist `PersistedGeneratedImage`,
// while API responses may hydrate the same image with runtime delivery URLs.
export type GeneratedCanvasImage = PersistedGeneratedImage | RuntimeGeneratedImage;

export type CreateAiJobMaskInput = {
  assetId?: string;
  dataUrl?: string;
  width?: number;
  height?: number;
  selectionRatio?: number;
};

export type CarverAiJobSimulationScenario =
  | "success"
  | "slow_success"
  | "transient_provider_fail_then_success"
  | "permanent_fail";

export type CarverAiJobSimulationConfig = {
  scenario: CarverAiJobSimulationScenario;
  delayMs?: number;
  failUntilAttempt?: number;
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
  engineVersion?: "2";
  engineRunId?: string;
  parentEngineRunId?: string;
  planHash?: string;
  contextRevision?: number;
  snapshotId?: string | null;
  decision?: ExecutionDecision;
  warnings?: PromptWarning[];
  risk?: PromptRiskAssessment;
  reviewReasons?: ReviewReason[];
  validatedReferences?: ValidatedReference[];
  executionTarget?: TrustedTarget | null;
  revalidation?: ExecutionRevalidationContract;
  degraded?: boolean;
  providerPrompt?: string | null;
  plan?: PromptPlanV2;
};

export type CarverAiJobResultStage = "brief_ready" | "prompt_compiled" | "generated";

export type CarverAiJobResult = {
  stage: CarverAiJobResultStage;
  provider: string | null;
  editBrief: CarverEditBrief;
  compiledPromptMeta: CarverCompiledPromptMeta | null;
  compiledPromptV2?: GenerationPromptResultV2 | null;
  generatedImages: GeneratedCanvasImage[];
  assistantMessage: CanvasGenerationAssistantMessage | null;
  outputAssetIds: string[];
  outputSnapshotId: string | null;
};

export type CarverAiJobRecord = {
  id: string;
  projectId: string;
  threadId: string | null;
  status: "queued" | "running" | "succeeded" | "failed" | "cancelled" | "enqueue_failed";
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
  executionMode?: CarverImageExecutionMode;
  idempotencyKey?: string;
  inputSnapshotId?: string;
  threadId?: string;
  promptMode?: "auto" | "review" | "expert";
  referenceAssetIds?: string[];
  selection?: Partial<CanvasSnapshotDocument["selection"]>;
  snapshot?: CanvasSnapshotDocument;
  targetNodeId?: string;
  mask?: CreateAiJobMaskInput;
  canvasGraphContext?: CanvasGenerationContext;
  simulation?: CarverAiJobSimulationConfig;
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
  executionMode: CarverImageExecutionMode;
  prompt: string;
  inputSnapshotId: string | null;
  threadId?: string | null;
  promptMode: "auto" | "review" | "expert";
  snapshot: CanvasSnapshotDocument;
  referenceAssetIds: string[];
  inputAssetIds: string[];
  targetNodeId?: string;
  maskAssetId?: string;
  canvasGraphContext?: CanvasGenerationContext;
  simulation?: CarverAiJobSimulationConfig;
  promptEngine?: {
    contextRevision: number;
    snapshotId?: string | null;
    parentEngineRunId?: string | null;
  };
};
