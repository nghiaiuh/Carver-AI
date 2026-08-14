export const GENERATION_FAILURE_STAGES = [
  "prompt_compile",
  "input_resolution",
  "input_metadata",
  "provider_configuration",
  "provider_request",
  "output_normalization",
  "asset_persistence",
  "job_completion",
] as const;

export type GenerationFailureStage = (typeof GENERATION_FAILURE_STAGES)[number];

export class GenerationStageError extends Error {
  readonly cause: unknown;
  readonly providerStatus: number | null;
  readonly providerCode: string | null;

  constructor(
    readonly stage: GenerationFailureStage,
    message: string,
    params: {
      cause?: unknown;
      providerStatus?: number | null;
      providerCode?: string | null;
    } = {},
  ) {
    super(message);
    this.name = "GenerationStageError";
    this.cause = params.cause;
    this.providerStatus = params.providerStatus ?? null;
    this.providerCode = params.providerCode ?? null;
  }
}

export async function runGenerationStage<T>(
  stage: GenerationFailureStage,
  operation: () => Promise<T>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof GenerationStageError) {
      throw error;
    }

    throw new GenerationStageError(stage, `Generation failed during ${stage}.`, { cause: error });
  }
}

export const getGenerationStageError = (error: unknown) =>
  error instanceof GenerationStageError ? error : null;
