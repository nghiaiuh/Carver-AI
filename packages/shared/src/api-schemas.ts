import { z } from "zod";

const MAX_PROMPT_LENGTH = 12_000;
const MAX_LABEL_LENGTH = 240;
const MAX_INLINE_IMAGE_URL_LENGTH = 4 * 1024 * 1024 * 1.4;
const trimmedString = z.string().trim();
const optionalTrimmedString = trimmedString.min(1).max(MAX_LABEL_LENGTH).optional();
const uuidLikeString = trimmedString.uuid();

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
  "timeout_then_success",
  "fail_after_asset_persisted_once",
  "permanent_fail",
] as const;

const chatInputImageSchema = z
  .object({
    imageUrl: trimmedString.min(1).max(MAX_INLINE_IMAGE_URL_LENGTH).optional(),
    assetId: uuidLikeString.optional(),
    label: optionalTrimmedString,
    source: z.enum(CHAT_IMAGE_SOURCE_VALUES).optional(),
  })
  .strict()
  .refine((value) => Boolean(value.imageUrl || value.assetId), "imageUrl or assetId is required");

const selectionSchema = z
  .object({
    objectIds: z.array(trimmedString.min(1).max(MAX_LABEL_LENGTH)).max(200).optional(),
    regionIds: z.array(trimmedString.min(1).max(MAX_LABEL_LENGTH)).max(200).optional(),
    activeAssetIds: z.array(uuidLikeString).max(100).optional(),
  })
  .partial()
  .strict();

const maskInputSchema = z
  .object({
    assetId: uuidLikeString.optional(),
    dataUrl: trimmedString.min(1).max(MAX_INLINE_IMAGE_URL_LENGTH).optional(),
    width: z.number().finite().optional(),
    height: z.number().finite().optional(),
    selectionRatio: z.number().finite().optional(),
  })
  .strict();

const generationTargetSchema = z
  .object({
    nodeId: trimmedString.min(1).max(MAX_LABEL_LENGTH),
    title: trimmedString.min(1).max(MAX_LABEL_LENGTH),
    imageUrl: trimmedString.max(MAX_INLINE_IMAGE_URL_LENGTH),
    assetId: uuidLikeString.optional(),
    role: trimmedString.min(1).max(64),
    prompt: trimmedString.min(1).max(MAX_PROMPT_LENGTH).nullable().optional(),
  })
  .strict();

const generationImageReferenceSchema = z
  .object({
    nodeId: trimmedString.min(1).max(MAX_LABEL_LENGTH),
    title: trimmedString.min(1).max(MAX_LABEL_LENGTH),
    imageUrl: trimmedString.max(MAX_INLINE_IMAGE_URL_LENGTH),
    assetId: uuidLikeString.optional(),
    role: trimmedString.min(1).max(64),
    sourcePresetChildId: trimmedString.min(1).max(MAX_LABEL_LENGTH).nullable().optional(),
  })
  .strict();

const generationPresetReferenceSchema = z
  .object({
    nodeId: trimmedString.min(1).max(MAX_LABEL_LENGTH),
    category: trimmedString.min(1).max(MAX_LABEL_LENGTH),
    childId: trimmedString.min(1).max(MAX_LABEL_LENGTH).nullable().optional(),
    slot: trimmedString.min(1).max(MAX_LABEL_LENGTH).nullable().optional(),
    label: trimmedString.min(1).max(MAX_LABEL_LENGTH),
    imageSrc: trimmedString.max(MAX_INLINE_IMAGE_URL_LENGTH),
    assetId: uuidLikeString.optional(),
    role: trimmedString.min(1).max(64),
  })
  .strict();

const assistantTextReferenceSchema = z
  .object({
    nodeId: trimmedString.min(1).max(MAX_LABEL_LENGTH),
    title: trimmedString.min(1).max(MAX_LABEL_LENGTH),
    content: trimmedString.min(1).max(MAX_PROMPT_LENGTH),
    sourceKind: z.enum(["text", "assistant"]),
  })
  .strict();

const assistantImageReferenceSchema = z
  .object({
    nodeId: trimmedString.min(1).max(MAX_LABEL_LENGTH),
    title: trimmedString.min(1).max(MAX_LABEL_LENGTH),
    imageUrl: trimmedString.max(MAX_INLINE_IMAGE_URL_LENGTH),
    assetId: uuidLikeString.optional(),
    role: trimmedString.min(1).max(64),
    sourceKind: z.enum(["image", "preset"]),
    childId: trimmedString.min(1).max(MAX_LABEL_LENGTH).nullable().optional(),
    childLabel: trimmedString.min(1).max(MAX_LABEL_LENGTH).nullable().optional(),
  })
  .strict();

const assistantCardContextSchema = z
  .object({
    nodeId: trimmedString.min(1).max(MAX_LABEL_LENGTH),
    nodeTitle: trimmedString.min(1).max(MAX_LABEL_LENGTH),
    textReferences: z.array(assistantTextReferenceSchema).max(16).default([]),
    imageReferences: z.array(assistantImageReferenceSchema).max(16).default([]),
    connectionSummary: trimmedString.max(4_000).default(""),
  })
  .strict();

const canvasGenerationContextSchema = z
  .object({
    target: generationTargetSchema,
    imageReferences: z.array(generationImageReferenceSchema).max(16).default([]),
    presetReferences: z.array(generationPresetReferenceSchema).max(32).default([]),
    preserveRules: z.array(trimmedString.max(MAX_LABEL_LENGTH)).max(64).default([]),
    referenceSummary: trimmedString.max(4_000).default(""),
    connectionSummary: trimmedString.max(4_000).default(""),
  })
  .strict();

const simulationSchema = z
  .object({
    scenario: z.enum(CARVER_SIMULATION_SCENARIO_VALUES),
    delayMs: z.number().finite().min(0).max(120_000).optional(),
    failUntilAttempt: z.number().finite().int().min(1).max(10).optional(),
  })
  .strict();

export const createAiJobBodySchema = z
  .object({
    projectId: uuidLikeString.optional(),
    prompt: trimmedString.min(1).max(MAX_PROMPT_LENGTH).optional(),
    rawPrompt: trimmedString.min(1).max(MAX_PROMPT_LENGTH).optional(),
    executionMode: z.enum(CARVER_EXECUTION_MODE_VALUES).optional(),
    idempotencyKey: trimmedString.min(8).max(128).optional(),
    inputSnapshotId: uuidLikeString.optional(),
    threadId: uuidLikeString.optional(),
    promptMode: z.enum(CARVER_PROMPT_MODE_VALUES).optional(),
    referenceAssetIds: z.array(uuidLikeString).max(32).optional(),
    selection: selectionSchema.optional(),
    snapshot: z.unknown().optional(),
    canvasSnapshot: z.unknown().optional(),
    targetNodeId: trimmedString.min(1).max(MAX_LABEL_LENGTH).optional(),
    mask: maskInputSchema.optional(),
    canvasGraphContext: canvasGenerationContextSchema.optional(),
    simulation: simulationSchema.optional(),
    jobType: z.enum(CARVER_JOB_KIND_VALUES).optional(),
    canvasId: trimmedString.min(1).max(MAX_LABEL_LENGTH).optional(),
  })
  .strip()
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
    projectId: uuidLikeString.optional(),
    canvasId: trimmedString.min(1).max(MAX_LABEL_LENGTH).optional(),
    content: trimmedString.min(1).max(MAX_PROMPT_LENGTH).optional(),
    rawPrompt: trimmedString.min(1).max(MAX_PROMPT_LENGTH).optional(),
    model: trimmedString.min(1).max(120).optional(),
    images: z.array(chatInputImageSchema).max(4).optional(),
    canvasGraphContext: canvasGenerationContextSchema.optional(),
    prompt: trimmedString.min(1).max(MAX_PROMPT_LENGTH).optional(),
    executionMode: z.enum(CARVER_EXECUTION_MODE_VALUES).optional(),
    idempotencyKey: trimmedString.min(8).max(128).optional(),
    inputSnapshotId: uuidLikeString.optional(),
    threadId: uuidLikeString.optional(),
    promptMode: z.enum(CARVER_PROMPT_MODE_VALUES).optional(),
    referenceAssetIds: z.array(uuidLikeString).max(32).optional(),
    selection: selectionSchema.optional(),
    snapshot: z.unknown().optional(),
    canvasSnapshot: z.unknown().optional(),
    targetNodeId: trimmedString.min(1).max(MAX_LABEL_LENGTH).optional(),
    mask: maskInputSchema.optional(),
    simulation: simulationSchema.optional(),
    jobType: z.enum(CARVER_JOB_KIND_VALUES).optional(),
  })
  .strip()
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

export const assistantCardRequestBodySchema = z
  .object({
    projectId: uuidLikeString.optional(),
    canvasId: trimmedString.min(1).max(MAX_LABEL_LENGTH).optional(),
    nodeId: trimmedString.min(1).max(MAX_LABEL_LENGTH),
    prompt: trimmedString.min(1).max(MAX_PROMPT_LENGTH),
    model: trimmedString.min(1).max(120).optional(),
    outputFormat: z.enum(["list", "text"]).optional(),
    context: assistantCardContextSchema,
  })
  .strict();

export type ChatRequestBody = z.infer<typeof chatRequestBodySchema>;
export type CreateAiJobBody = z.infer<typeof createAiJobBodySchema>;
export type AssistantCardRequestBody = z.infer<typeof assistantCardRequestBodySchema>;
export type AssistantCardContext = z.infer<typeof assistantCardContextSchema>;

export function formatZodError(error: z.ZodError) {
  return error.issues
    .map((issue) => {
      const path = issue.path.length > 0 ? `${issue.path.join(".")}: ` : "";
      return `${path}${issue.message}`;
    })
    .join("; ");
}
