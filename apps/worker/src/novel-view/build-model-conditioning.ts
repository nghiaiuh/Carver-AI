/*
 * Flow: Assembles the immutable multimodal package for one camera shot.
 * 1. Require the canonical source asset and normalized camera from the job.
 * 2. Preserve graph reference roles and approved prompt-plan semantics.
 * 3. Hash only stable semantic values so a provider adapter can consume it later.
 */

import { createHash } from "node:crypto";
import type {
  CameraShotDirective,
  CarverAiJobPayload,
  ConditioningImageRole,
  GenerationPromptResultV2,
  ModelConditioning,
  PromptOperation,
  ReferenceInput,
  ReferenceInputRole,
  SceneEvidence,
  TaskMode,
} from "@carver/shared";
import {
  MODEL_CONDITIONING_SCHEMA_VERSION,
  PROMPT_SPEC_SCHEMA_VERSION,
  SCENE_EVIDENCE_SCHEMA_VERSION,
} from "@carver/shared";

export const MODEL_CONDITIONING_BUILDER_VERSION = "model-conditioning-v1" as const;
export const UNAVAILABLE_SCENE_EVIDENCE_BUILDER_VERSION = "scene-evidence-unavailable-v1" as const;

type CanonicalJson =
  | null
  | boolean
  | number
  | string
  | CanonicalJson[]
  | { [key: string]: CanonicalJson };

export class ModelConditioningAssemblyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelConditioningAssemblyError";
  }
}

export type ConditioningSource = {
  readonly assetId: string;
  readonly width: number;
  readonly height: number;
  readonly mimeType: string;
  /** SHA-256 of the resolved authoritative input bytes, never the bytes themselves. */
  readonly contentHash: string;
};

const nonEmpty = (value: string | null | undefined, field: string) => {
  const normalized = value?.trim() ?? "";
  if (!normalized) {
    throw new ModelConditioningAssemblyError(`${field} is required for model conditioning.`);
  }
  return normalized;
};

const compareStrings = (left: string, right: string) => (left === right ? 0 : left < right ? -1 : 1);

const uniqueSortedStrings = (values: readonly string[]) =>
  [...new Set(values.map((value) => value.trim()).filter(Boolean))].sort(compareStrings);

const toCanonicalJson = (value: unknown): CanonicalJson => {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new ModelConditioningAssemblyError("Conditioning hashes cannot contain non-finite numbers.");
    }
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) {
    return value.map(toCanonicalJson);
  }
  if (typeof value === "object") {
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      throw new ModelConditioningAssemblyError("Conditioning hashes must contain plain serializable objects.");
    }
    const source = value as Record<string, unknown>;
    const result: { [key: string]: CanonicalJson } = {};
    for (const key of Object.keys(source).sort(compareStrings)) {
      if (source[key] !== undefined) {
        result[key] = toCanonicalJson(source[key]);
      }
    }
    return result;
  }

  throw new ModelConditioningAssemblyError("Conditioning hashes must contain only serializable values.");
};

export const stableConditioningJson = (value: unknown) => JSON.stringify(toCanonicalJson(value));

export const hashConditioningValue = (value: unknown) =>
  createHash("sha256").update(stableConditioningJson(value)).digest("hex");

export const hashSourceImageContent = (buffer: Buffer) =>
  `sha256:${createHash("sha256").update(buffer).digest("hex")}`;

const taskModeForShot = (shot: CameraShotDirective): TaskMode =>
  shot.mode === "plan" ? "plan_to_perspective" : "view_only";

const referenceRoleForCanvasRole = (role: string): ReferenceInputRole => {
  switch (role) {
    case "layout_reference":
      return "layout";
    case "style_reference":
      return "style";
    case "material_reference":
      return "material";
    case "architecture_reference":
    case "plant_reference":
      return "object";
    default:
      return "composition";
  }
};

const operationDescription = (operation: PromptOperation) => {
  switch (operation.type) {
    case "add_object":
      return `Add ${operation.objectCategory} only within the approved target context.`;
    case "remove_object":
      return `Remove only the approved object ${operation.targetContextId}.`;
    case "replace_object":
      return `Replace only ${operation.targetContextId} with ${operation.replacementCategory}.`;
    case "replace_material":
      return `Change only the material of ${operation.targetContextId} to ${operation.material}.`;
    case "modify_attribute":
      return `Change only ${operation.attribute} of ${operation.targetContextId} to ${operation.value}.`;
    case "restyle":
      return `Restyle only the approved scope using ${operation.style}.`;
    case "relocate_object":
      return `Relocate only ${operation.targetContextId} to its approved destination.`;
  }
};

const toReferenceInputs = (job: CarverAiJobPayload): ReferenceInput[] => {
  const imageReferences = job.canvasGraphContext?.imageReferences ?? [];
  const presetReferences = job.canvasGraphContext?.presetReferences ?? [];
  const references: ReferenceInput[] = [];

  for (const reference of imageReferences) {
    const assetId = nonEmpty(reference.assetId, `image reference ${reference.nodeId} assetId`);
    const contextId = reference.sourcePresetChildId
      ? `${reference.nodeId}:${reference.sourcePresetChildId}`
      : reference.nodeId;
    references.push({
      contextId,
      image: { assetId },
      role: referenceRoleForCanvasRole(String(reference.role)),
      sourceNodeId: reference.nodeId,
      required: true,
      provenance: {
        origin: "unknown",
        inputAssetIds: [assetId],
        method: "canvas_graph_image_reference",
        version: MODEL_CONDITIONING_BUILDER_VERSION,
        assumptions: ["The persisted graph context does not yet include an edge ID for this reference."],
      },
    });
  }

  for (const reference of presetReferences) {
    const assetId = nonEmpty(reference.assetId, `preset reference ${reference.nodeId} assetId`);
    const contextId = reference.childId ? `${reference.nodeId}:${reference.childId}` : reference.nodeId;
    references.push({
      contextId,
      image: { assetId },
      role: referenceRoleForCanvasRole(String(reference.role)),
      sourceNodeId: reference.nodeId,
      required: true,
      provenance: {
        origin: "unknown",
        inputAssetIds: [assetId],
        method: "canvas_graph_preset_reference",
        version: MODEL_CONDITIONING_BUILDER_VERSION,
        assumptions: ["The persisted graph context does not yet include an edge ID for this reference."],
      },
    });
  }

  const deduplicated = new Map<string, ReferenceInput>();
  for (const reference of references) {
    const key = [reference.contextId, reference.image.assetId, reference.role].join(":");
    if (!deduplicated.has(key)) {
      deduplicated.set(key, reference);
    }
  }

  return [...deduplicated.values()].sort((left, right) => {
    const leftKey = [left.sourceNodeId, left.contextId, left.image.assetId, left.role].join("\u0000");
    const rightKey = [right.sourceNodeId, right.contextId, right.image.assetId, right.role].join("\u0000");
    return compareStrings(leftKey, rightKey);
  });
};

const buildCameraInstruction = (shot: CameraShotDirective) => {
  const camera = shot.cameraSpec;
  if (!camera) {
    throw new ModelConditioningAssemblyError(`Camera shot ${shot.shotId} is missing a normalized CameraSpec.`);
  }

  const position = camera.pose.position.join(", ");
  const target = camera.pose.target.join(", ");
  return [
    `Use the normalized ${camera.coordinateSpace} camera in ${camera.convention}.`,
    `Position (${position}); target (${target}); horizontal FOV ${camera.projection.horizontalFovDeg} degrees; aspect ratio ${camera.projection.aspectRatio}.`,
    `Framing mode is ${camera.framingMode}; virtual scale remains explicitly uncalibrated and relative.`,
  ].join(" ");
};

const buildUnavailableEvidence = (params: {
  sourceAssetId: string;
  sourceContentHash: string;
  targetCameraHash: string;
}): SceneEvidence => {
  const evidenceIdentity = {
    sourceAssetId: params.sourceAssetId,
    sourceContentHash: params.sourceContentHash,
    targetCameraHash: params.targetCameraHash,
    builderVersion: UNAVAILABLE_SCENE_EVIDENCE_BUILDER_VERSION,
  };
  const evidenceHash = hashConditioningValue(evidenceIdentity);

  return {
    schemaVersion: SCENE_EVIDENCE_SCHEMA_VERSION,
    evidenceId: `scene-evidence:${evidenceHash}`,
    sourceImage: { assetId: params.sourceAssetId },
    sourceContentHash: params.sourceContentHash,
    targetCameraHash: params.targetCameraHash,
    builderVersion: UNAVAILABLE_SCENE_EVIDENCE_BUILDER_VERSION,
    status: "unavailable",
    geometryConfidence: {
      value: null,
      basis: "unknown",
      method: "no_scene_evidence_builder",
      version: UNAVAILABLE_SCENE_EVIDENCE_BUILDER_VERSION,
    },
    degradationCodes: ["SCENE_EVIDENCE_NOT_BUILT"],
  };
};

const validateEvidence = (params: {
  evidence: SceneEvidence;
  sourceAssetId: string;
  sourceContentHash: string;
  targetCameraHash: string;
}) => {
  if (params.evidence.sourceImage.assetId !== params.sourceAssetId) {
    throw new ModelConditioningAssemblyError("Scene evidence source asset does not match the canonical source.");
  }
  if (params.evidence.sourceContentHash !== params.sourceContentHash) {
    throw new ModelConditioningAssemblyError("Scene evidence content hash does not match the canonical source.");
  }
  if (params.evidence.targetCameraHash !== params.targetCameraHash) {
    throw new ModelConditioningAssemblyError("Scene evidence target camera hash does not match the normalized camera.");
  }
};

const inferSourceKind = (job: CarverAiJobPayload, shot: CameraShotDirective) => {
  if (shot.mode === "plan") {
    return "plan" as const;
  }
  const sourceNode = job.snapshot.graph.nodes.find(
    (node) => node.id === job.cameraShotSetContext?.source.nodeId,
  );
  return sourceNode?.kind === "image-generator" || sourceNode?.kind === "image-output-gallery"
    ? "design_result"
    : "site_image" as const;
};

export function buildModelConditioning(params: {
  job: CarverAiJobPayload;
  cameraShot: CameraShotDirective;
  compiledPrompt: GenerationPromptResultV2;
  source: ConditioningSource;
  sceneEvidence?: SceneEvidence;
}): ModelConditioning {
  const sourceContext = params.job.cameraShotSetContext?.source;
  if (!sourceContext) {
    throw new ModelConditioningAssemblyError("Model conditioning requires a canonical multi-angle source.");
  }
  if (!params.job.cameraShotSetContext?.shots.some((shot) => shot.shotId === params.cameraShot.shotId)) {
    throw new ModelConditioningAssemblyError("Camera shot is not part of the canonical multi-angle request.");
  }

  const sourceAssetId = nonEmpty(sourceContext.assetId, "canonical source assetId");
  if (sourceAssetId !== nonEmpty(params.source.assetId, "resolved source assetId")) {
    throw new ModelConditioningAssemblyError("Resolved source asset does not match the canonical multi-angle source.");
  }
  if (!Number.isInteger(params.source.width) || params.source.width <= 0 || !Number.isInteger(params.source.height) || params.source.height <= 0) {
    throw new ModelConditioningAssemblyError("Resolved source dimensions must be positive integers.");
  }
  const mimeType = nonEmpty(params.source.mimeType, "resolved source mimeType");
  const sourceContentHash = nonEmpty(params.source.contentHash, "resolved source contentHash");
  const targetCamera = params.cameraShot.cameraSpec;
  if (!targetCamera) {
    throw new ModelConditioningAssemblyError(`Camera shot ${params.cameraShot.shotId} is missing a normalized CameraSpec.`);
  }
  const targetCameraHash = hashConditioningValue(targetCamera);
  const sceneEvidence = params.sceneEvidence ?? buildUnavailableEvidence({
    sourceAssetId,
    sourceContentHash,
    targetCameraHash,
  });
  validateEvidence({ evidence: sceneEvidence, sourceAssetId, sourceContentHash, targetCameraHash });

  const plan = params.compiledPrompt.plan;
  const taskMode = taskModeForShot(params.cameraShot);
  const preserveExactly = uniqueSortedStrings([
    ...(params.job.canvasGraphContext?.preserveRules ?? []),
    ...plan.constraints
      .filter((constraint) => constraint.type.startsWith("preserve_"))
      .map((constraint) => constraint.description),
  ]);
  const changeOnly = uniqueSortedStrings([
    plan.rawGoal,
    ...plan.operations.map(operationDescription),
  ]);
  const forbiddenChanges = uniqueSortedStrings([
    ...plan.constraints
      .filter((constraint) => constraint.type === "forbid_addition" || constraint.type === "forbid_removal")
      .map((constraint) => constraint.description),
    ...(taskMode === "view_only"
      ? ["Do not redesign, restyle, relocate, mirror, or replace the physical site."]
      : []),
  ]);
  const protectedRegionIds = uniqueSortedStrings([
    ...params.job.snapshot.selection.regionIds,
    ...plan.constraints.map((constraint) => constraint.regionId ?? ""),
  ]);
  const references = toReferenceInputs(params.job);
  const constraints = {
    preserveExactly,
    changeOnly,
    forbiddenChanges,
    protectedRegionIds,
    newlyRevealedPolicy: "conservative_continuation" as const,
  };
  const instructions = {
    schemaVersion: PROMPT_SPEC_SCHEMA_VERSION,
    taskType: taskMode,
    authoritativeSourceDescription: "Treat the canonical source asset as the authoritative identity and layout evidence.",
    targetCameraInstruction: buildCameraInstruction(params.cameraShot),
    preserveExactly,
    changeOnly,
    newlyRevealedAreas: taskMode === "view_only"
      ? ["Continue newly revealed areas conservatively from observed source evidence; do not invent decorative features."]
      : ["Retain the observed footprint and mark unobserved geometry as uncertain."],
    forbiddenChanges,
    outputValidation: [
      "Keep the authoritative source identity, footprint, object relationships, and protected regions consistent.",
      "Treat the normalized target camera as a viewpoint/framing instruction, not authorization to redesign the site.",
    ],
    planHash: nonEmpty(params.compiledPrompt.planHash, "compiled prompt planHash"),
  } as const;
  const conditioningWithoutIdentity = {
    schemaVersion: MODEL_CONDITIONING_SCHEMA_VERSION,
    taskMode,
    authoritativeSource: {
      image: {
        assetId: sourceAssetId,
        width: params.source.width,
        height: params.source.height,
        mimeType,
      },
      nodeId: sourceContext.nodeId,
      kind: inferSourceKind(params.job, params.cameraShot),
      provenance: {
        origin: "unknown" as const,
        inputAssetIds: [sourceAssetId],
        method: "canonical_multi_angle_source",
        version: MODEL_CONDITIONING_BUILDER_VERSION,
        assumptions: ["Source lineage kind is inferred from the canonical canvas node until asset lineage is persisted."],
      },
    },
    targetCamera,
    sceneEvidence,
    referenceImages: references,
    constraints,
    instructions,
    metadata: {
      promptCompilerVersion: `prompt-engine-v${params.compiledPrompt.engineVersion}`,
      cameraNormalizationVersion: targetCamera.normalizationVersion,
    },
  } as const;
  const conditioningHash = hashConditioningValue(conditioningWithoutIdentity);

  return {
    ...conditioningWithoutIdentity,
    conditioningId: `model-conditioning:${conditioningHash}`,
    conditioningHash,
  };
}

/** Kept here for MA-007 adapter work; these are semantic, not multipart roles. */
export const conditioningImageRoles: readonly ConditioningImageRole[] = [
  "authoritative_source",
  "camera_guide",
  "uncertainty_guide",
  "protected_region",
  "reference",
];
