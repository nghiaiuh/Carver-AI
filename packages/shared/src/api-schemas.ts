import { z } from "zod";

const trimmedString = z.string().trim();
const optionalTrimmedString = trimmedString.min(1).optional();
const uuidLikeString = trimmedString.min(1);

export const CHAT_IMAGE_SOURCE_VALUES = [
  "attachment",
  "canvas-target",
  "canvas-reference",
  "preset-reference",
] as const;

export const CARVER_JOB_KIND_VALUES = [
  "generate_concept",
  "refine_concept",
  "analyze_reference",
  "export",
] as const;

export const CARVER_PROMPT_MODE_VALUES = ["auto", "review", "expert"] as const;
export const CARVER_EXECUTION_MODE_VALUES = ["text_to_image", "image_edit", "region_edit"] as const;
export const CARVER_SIMULATION_SCENARIO_VALUES = [
  "success",
  "slow_success",
  "transient_provider_fail_then_success",
  "permanent_fail",
] as const;

const chatInputImageSchema = z
  .object({
    imageUrl: trimmedString.min(1),
    label: optionalTrimmedString,
    source: z.enum(CHAT_IMAGE_SOURCE_VALUES).optional(),
  })
  .passthrough();

const selectionSchema = z
  .object({
    objectIds: z.array(trimmedString.min(1)).optional(),
    regionIds: z.array(trimmedString.min(1)).optional(),
    activeAssetIds: z.array(trimmedString.min(1)).optional(),
  })
  .partial()
  .passthrough();

const maskInputSchema = z
  .object({
    assetId: optionalTrimmedString,
    dataUrl: optionalTrimmedString,
    width: z.number().finite().optional(),
    height: z.number().finite().optional(),
    selectionRatio: z.number().finite().optional(),
  })
  .passthrough();

const generationTargetSchema = z
  .object({
    nodeId: trimmedString.min(1),
    title: trimmedString.min(1),
    imageUrl: trimmedString,
    assetId: optionalTrimmedString,
    role: trimmedString.min(1),
    prompt: trimmedString.min(1).nullable().optional(),
  })
  .passthrough();

const generationImageReferenceSchema = z
  .object({
    nodeId: trimmedString.min(1),
    title: trimmedString.min(1),
    imageUrl: trimmedString,
    assetId: optionalTrimmedString,
    role: trimmedString.min(1),
    sourcePresetChildId: trimmedString.min(1).nullable().optional(),
  })
  .passthrough();

const generationPresetReferenceSchema = z
  .object({
    nodeId: trimmedString.min(1),
    category: trimmedString.min(1),
    childId: trimmedString.min(1).nullable().optional(),
    slot: trimmedString.min(1).nullable().optional(),
    label: trimmedString.min(1),
    imageSrc: trimmedString,
    assetId: optionalTrimmedString,
    role: trimmedString.min(1),
  })
  .passthrough();

const canvasGenerationContextSchema = z
  .object({
    target: generationTargetSchema,
    imageReferences: z.array(generationImageReferenceSchema).default([]),
    presetReferences: z.array(generationPresetReferenceSchema).default([]),
    preserveRules: z.array(trimmedString).default([]),
    referenceSummary: trimmedString.default(""),
    connectionSummary: trimmedString.default(""),
  })
  .passthrough();

const simulationSchema = z
  .object({
    scenario: z.enum(CARVER_SIMULATION_SCENARIO_VALUES),
    delayMs: z.number().finite().optional(),
    failUntilAttempt: z.number().finite().optional(),
  })
  .passthrough();

export const createAiJobBodySchema = z
  .object({
    projectId: optionalTrimmedString,
    prompt: optionalTrimmedString,
    rawPrompt: optionalTrimmedString,
    executionMode: z.enum(CARVER_EXECUTION_MODE_VALUES).optional(),
    idempotencyKey: optionalTrimmedString,
    inputSnapshotId: optionalTrimmedString,
    threadId: optionalTrimmedString,
    promptMode: z.enum(CARVER_PROMPT_MODE_VALUES).optional(),
    referenceAssetIds: z.array(uuidLikeString).optional(),
    selection: selectionSchema.optional(),
    snapshot: z.unknown().optional(),
    canvasSnapshot: z.unknown().optional(),
    targetNodeId: optionalTrimmedString,
    mask: maskInputSchema.optional(),
    canvasGraphContext: canvasGenerationContextSchema.optional(),
    simulation: simulationSchema.optional(),
    jobType: z.enum(CARVER_JOB_KIND_VALUES).optional(),
    canvasId: optionalTrimmedString,
  })
  .passthrough()
  .superRefine((value, context) => {
    if (!value.prompt && !value.rawPrompt) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "prompt or rawPrompt is required",
        path: ["prompt"],
      });
    }
  });

export const chatRequestBodySchema = z
  .object({
    projectId: optionalTrimmedString,
    canvasId: optionalTrimmedString,
    content: optionalTrimmedString,
    rawPrompt: optionalTrimmedString,
    model: optionalTrimmedString,
    images: z.array(chatInputImageSchema).optional(),
    canvasGraphContext: canvasGenerationContextSchema.optional(),
    prompt: optionalTrimmedString,
    executionMode: z.enum(CARVER_EXECUTION_MODE_VALUES).optional(),
    idempotencyKey: optionalTrimmedString,
    inputSnapshotId: optionalTrimmedString,
    threadId: optionalTrimmedString,
    promptMode: z.enum(CARVER_PROMPT_MODE_VALUES).optional(),
    referenceAssetIds: z.array(uuidLikeString).optional(),
    selection: selectionSchema.optional(),
    snapshot: z.unknown().optional(),
    canvasSnapshot: z.unknown().optional(),
    targetNodeId: optionalTrimmedString,
    mask: maskInputSchema.optional(),
    simulation: simulationSchema.optional(),
    jobType: z.enum(CARVER_JOB_KIND_VALUES).optional(),
  })
  .passthrough()
  .superRefine((value, context) => {
    const hasImages = (value.images?.length ?? 0) > 0;
    if (!value.content && !value.rawPrompt && !hasImages) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "content, rawPrompt, or images is required",
        path: ["content"],
      });
    }
  });

export type ChatRequestBody = z.infer<typeof chatRequestBodySchema>;
export type CreateAiJobBody = z.infer<typeof createAiJobBodySchema>;

export function formatZodError(error: z.ZodError) {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
      return `${path}${issue.message}`;
    })
    .join("; ");
}
