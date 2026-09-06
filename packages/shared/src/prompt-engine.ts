import type { CanvasReferenceRole, SpatialLock } from "./snapshot";
import type { CameraSpec } from "./novel-view";

export type PromptExecutionMode = "text_to_image" | "image_edit" | "region_edit";

/** A trusted, explicit camera override for one generated image. */
export type CameraShotDirective = {
  shotSetNodeId: string;
  shotId: string;
  shotName: string;
  order: number;
  mode: "plan" | "orbit";
  plan?: {
    u: number;
    v: number;
    targetU: number;
    targetV: number;
    height: number;
    targetHeight?: number;
    lens: number;
    pitch: number;
    roll?: number;
    viewDirection: "auto" | "look-at-target" | "manual";
  };
  orbit?: {
    rotate: number;
    tilt: number;
    distance: number;
    lens: number;
  };
  /** Normalized canonical camera state. Omitted only by legacy snapshots/jobs. */
  cameraSpec?: CameraSpec;
};

export type DecisionSource =
  | "system_policy"
  | "ownership_validation"
  | "trusted_context"
  | "user_explicit"
  | "model_interpretation"
  | "fallback";

export type RequestedReferenceRole =
  | "style"
  | "material"
  | "object"
  | "layout"
  | "composition"
  | "unspecified";

export type SpatialRelation = {
  relation:
    | "inside"
    | "around"
    | "near"
    | "left_of"
    | "right_of"
    | "above"
    | "below"
    | "replace_in_place";
  contextId?: string;
  description?: string;
};

export type PromptOperation =
  | {
      operationId: string;
      type: "add_object";
      objectCategory: string;
      targetContextId?: string;
      spatialRelation?: SpatialRelation;
      dependsOn?: string[];
      executionGroup?: number;
    }
  | {
      operationId: string;
      type: "remove_object";
      targetContextId: string;
      dependsOn?: string[];
      executionGroup?: number;
    }
  | {
      operationId: string;
      type: "replace_object";
      targetContextId: string;
      replacementCategory: string;
      referenceContextId?: string;
      dependsOn?: string[];
      executionGroup?: number;
    }
  | {
      operationId: string;
      type: "replace_material";
      targetContextId: string;
      material: string;
      dependsOn?: string[];
      executionGroup?: number;
    }
  | {
      operationId: string;
      type: "modify_attribute";
      targetContextId: string;
      attribute: string;
      value: string;
      dependsOn?: string[];
      executionGroup?: number;
    }
  | {
      operationId: string;
      type: "restyle";
      targetContextId?: string;
      style: string;
      dependsOn?: string[];
      executionGroup?: number;
    }
  | {
      operationId: string;
      type: "relocate_object";
      targetContextId: string;
      destination: SpatialRelation;
      dependsOn?: string[];
      executionGroup?: number;
    };

export type PlanConstraint = {
  id: string;
  type:
    | "preserve_object"
    | "preserve_region"
    | "preserve_camera"
    | "preserve_perspective"
    | "preserve_layout"
    | "apply_camera_view"
    | "forbid_addition"
    | "forbid_removal"
    | "restrict_edit_scope";
  source: DecisionSource;
  subjectId?: string;
  regionId?: string;
  severity: "hard" | "soft";
  description: string;
  evidence?: string[];
};

export type InterpretedReference = {
  contextId: string;
  requestedRole: RequestedReferenceRole;
};

export type ValidatedReference = {
  contextId: string;
  requestedRole: RequestedReferenceRole;
  effectiveRole: RequestedReferenceRole;
  graphRole?: CanvasReferenceRole | null;
  source: DecisionSource;
  validation: "trusted_graph_match" | "role_adjusted" | "rejected";
  evidence: string[];
};

export type ProvenancedDecision<T> = {
  value: T;
  source: DecisionSource;
  evidence: string[];
};

export type PromptWarningCode =
  | "UNKNOWN_REFERENCE_REMOVED"
  | "INVALID_REFERENCE_ROLE"
  | "AMBIGUOUS_TARGET"
  | "INTERPRETER_FALLBACK"
  | "INTERPRETER_REFUSAL"
  | "LOCKED_TARGET_CONFLICT"
  | "STALE_CONTEXT"
  | "CONTRADICTORY_INSTRUCTION"
  | "MISSING_REQUIRED_REFERENCE"
  | "INVALID_TARGET"
  | "EMPTY_OPERATION";

export type PromptWarning = {
  code: PromptWarningCode;
  message: string;
  contextId?: string;
};

export type RiskReason = {
  code:
    | "DESTRUCTIVE_OPERATION"
    | "GLOBAL_SCOPE"
    | "LOCKED_OBJECT_CONFLICT"
    | "AMBIGUOUS_DESTRUCTIVE_TARGET"
    | "MISSING_MASK"
    | "MISSING_REQUIRED_REFERENCE"
    | "DEGRADED_INTERPRETATION"
    | "STALE_EXECUTION_CONTEXT";
  source: DecisionSource;
  contextId?: string;
};

export type ReviewReason = {
  code:
    | "TARGET_CONFIRMATION_REQUIRED"
    | "REFERENCE_ROLE_CONFIRMATION_REQUIRED"
    | "CONTRADICTORY_REQUEST"
    | "DEGRADED_DESTRUCTIVE_EDIT"
    | "HIGH_RISK_SCOPE";
  source: DecisionSource;
  contextId?: string;
};

export type ExecutionDecision = "continue" | "require_review" | "reject";

export type TrustedTarget = {
  contextId: string;
  title: string;
  assetId?: string;
  role?: string;
  prompt?: string | null;
  source: "canvas_target" | "job_payload" | "project_context";
  locked?: boolean;
};

export type TrustedReferenceContext = {
  contextId: string;
  title: string;
  assetId?: string;
  graphRole?: CanvasReferenceRole | null;
  allowedRoles: RequestedReferenceRole[];
  source: "image_reference" | "preset_reference" | "project_context";
};

export type PromptEngineTrustedContext = {
  projectId?: string;
  contextRevision: number;
  snapshotId?: string;
  executionMode: PromptExecutionMode;
  target: TrustedTarget | null;
  availableTargets: TrustedTarget[];
  availableReferences: TrustedReferenceContext[];
  selectedObjectIds: string[];
  selectedRegionIds: string[];
  lockedObjectIds: string[];
  locks: SpatialLock[];
  mask:
    | {
        regionId?: string;
        assetId?: string;
        required: boolean;
      }
    | null;
  explicitConstraints?: {
    preserve?: string[];
    avoid?: string[];
    changeOnly?: string[];
  };
  /** Present only for an authorized multi-angle shot generation. */
  cameraShot?: CameraShotDirective | null;
};

export type PromptInterpreterOperationDraft = {
  type: string;
  objectCategory?: string;
  targetContextId?: string;
  replacementCategory?: string;
  referenceContextId?: string;
  material?: string;
  attribute?: string;
  value?: string;
  style?: string;
  spatialRelation?: SpatialRelation;
  destination?: SpatialRelation;
  dependsOn?: string[];
  executionGroup?: number;
};

export type PromptInterpreterResult = {
  executionMode?: PromptExecutionMode | "unknown";
  targetHint?: string | null;
  operations: PromptInterpreterOperationDraft[];
  references: InterpretedReference[];
  preserveRequests: string[];
  avoidRequests: string[];
  notes: string[];
};

export type PromptRiskAssessment = {
  level: "low" | "medium" | "high" | "blocked";
  reasons: RiskReason[];
};

export type PromptPlanV2 = {
  schemaVersion: 2;
  purpose: "enhance" | "generation";
  executionMode: PromptExecutionMode;
  rawGoal: string;
  cameraShot?: CameraShotDirective | null;
  operations: PromptOperation[];
  target: ProvenancedDecision<TrustedTarget | null>;
  references: ValidatedReference[];
  constraints: PlanConstraint[];
  decision: ExecutionDecision;
  risk: PromptRiskAssessment;
  reviewReasons: ReviewReason[];
  degraded: boolean;
};

export type PromptInterpreterMeta = {
  model: string | null;
  latencyMs: number | null;
  attemptCount: number;
  fallbackReason: string | null;
};

export type CompiledPromptV2 = {
  engineVersion: "2";
  engineRunId: string;
  parentEngineRunId?: string;
  planHash: string;
  contextRevision: number;
  snapshotId?: string;
  providerPrompt: string;
  plan: PromptPlanV2;
  warnings: PromptWarning[];
  interpreter: PromptInterpreterMeta;
};

export type ExecutionRevalidationContract = {
  projectScoped: true;
  snapshotScoped: boolean;
  expectedContextRevision: number;
  snapshotId?: string;
  targetContextId?: string;
  referenceContextIds: string[];
  requiredAssetIds: string[];
  requiresMask: boolean;
  requiresTarget: boolean;
};

export type EnhancedPromptResultV2 = {
  engineRunId: string;
  parentEngineRunId?: string;
  planHash: string;
  contextRevision: number;
  enhancedPrompt: string;
  planPreview: PromptPlanV2;
  warnings: PromptWarning[];
  decision: ExecutionDecision;
  risk: PromptRiskAssessment;
  reviewReasons: ReviewReason[];
  degraded: boolean;
  interpreter: PromptInterpreterMeta;
};

export type GenerationPromptResultV2 = CompiledPromptV2 & {
  executionTarget: TrustedTarget | null;
  validatedReferences: ValidatedReference[];
  revalidation: ExecutionRevalidationContract;
};
