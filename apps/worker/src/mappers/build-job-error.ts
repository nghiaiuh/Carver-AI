/*
 * Flow: Maps worker/provider failures into stable ai_jobs error codes.
 * 1. Inspect the thrown error message.
 * 2. Return a normalized internal error code.
 * 3. Keep UI-facing failure handling predictable.
 */

import { getGenerationStageError, type GenerationFailureStage } from "../errors/generation-stage-error";
import { GenerationDecisionGateError } from "../errors/generation-decision-gate";
import { ShotInvocationBusyError, ShotInvocationOutcomeUnknownError } from "../services/shot-invocation-service";

export type WorkerJobError = {
  errorCode: string;
  errorMessage: string;
  permanent: boolean;
  failureStage: GenerationFailureStage | null;
  providerStatus: number | null;
  providerCode: string | null;
};

export const toWorkerError = (error: unknown) =>
  error instanceof Error ? error : new Error(typeof error === "string" ? error : "Unknown worker failure");

export const buildJobError = (error: unknown): WorkerJobError => {
  if (error instanceof ShotInvocationOutcomeUnknownError) {
    return {
      errorCode: "generation_outcome_unknown",
      errorMessage: "The result of one camera view could not be confirmed, so no duplicate generation was started.",
      permanent: true,
      failureStage: null,
      providerStatus: null,
      providerCode: null,
    };
  }

  if (error instanceof ShotInvocationBusyError) {
    return {
      errorCode: "generation_shot_in_progress",
      errorMessage: "Another worker is safely completing this camera view. Please retry shortly.",
      permanent: false,
      failureStage: null,
      providerStatus: null,
      providerCode: null,
    };
  }

  if (error instanceof GenerationDecisionGateError) {
    return {
      errorCode:
        error.decision === "require_review"
          ? "generation_review_required"
          : "generation_rejected",
      errorMessage:
        error.decision === "require_review"
          ? "Generation requires review before it can run."
          : "Generation was rejected before provider execution.",
      permanent: true,
      failureStage: null,
      providerStatus: null,
      providerCode: null,
    };
  }

  const stageError = getGenerationStageError(error);
  if (stageError) {
    if (stageError.stage === "provider_configuration") {
      return {
        errorCode: "provider_configuration_error",
        errorMessage: "Image generation is temporarily unavailable. Please contact support if this continues.",
        permanent: true,
        failureStage: stageError.stage,
        providerStatus: stageError.providerStatus,
        providerCode: stageError.providerCode,
      };
    }

    if (stageError.stage === "provider_request") {
      const statusDetails =
        stageError.providerStatus === 400
          ? {
              errorCode: "provider_bad_request",
              errorMessage: "The image provider rejected this generation request. Review the prompt and settings, then retry.",
              permanent: true,
            }
          : stageError.providerStatus === 401
            ? {
                errorCode: "provider_authentication_failed",
                errorMessage: "Image generation is temporarily unavailable. Please contact support if this continues.",
                permanent: true,
              }
            : stageError.providerStatus === 403
              ? {
                  errorCode: "provider_access_denied",
                  errorMessage: "The configured image provider cannot run this generation request.",
                  permanent: true,
                }
              : stageError.providerStatus === 404
                ? {
                    errorCode: "provider_model_unavailable",
                    errorMessage: "The configured image model is unavailable. Please contact support if this continues.",
                    permanent: true,
                  }
                : stageError.providerStatus === 422
                  ? {
                      errorCode: "provider_rejected_request",
                      errorMessage: "The image provider could not process this generation request.",
                      permanent: true,
                    }
                  : null;
      return {
        errorCode:
          stageError.providerStatus === 429
            ? "provider_rate_limited"
            : statusDetails
              ? statusDetails.errorCode
              : "provider_request_failed",
        errorMessage:
          stageError.providerStatus === 429
            ? "The image provider is temporarily busy. Please retry shortly."
            : statusDetails
              ? statusDetails.errorMessage
              : "The image provider is temporarily unavailable. Please retry shortly.",
        permanent: statusDetails?.permanent ?? false,
        failureStage: stageError.stage,
        providerStatus: stageError.providerStatus,
        providerCode: stageError.providerCode,
      };
    }

    const stageDetails: Record<Exclude<GenerationFailureStage, "provider_configuration" | "provider_request">, Omit<WorkerJobError, "failureStage" | "providerStatus" | "providerCode">> = {
      prompt_compile: {
        errorCode: "prompt_compile_failed",
        errorMessage: "The generation prompt could not be prepared. Please retry shortly.",
        permanent: false,
      },
      input_resolution: {
        errorCode: "generation_input_unavailable",
        errorMessage: "A required generation image is unavailable. Refresh the canvas image and retry.",
        permanent: false,
      },
      input_metadata: {
        errorCode: "generation_input_invalid",
        errorMessage: "A generation image could not be processed. Refresh the image and retry.",
        permanent: false,
      },
      conditioning_assembly: {
        errorCode: "generation_conditioning_failed",
        errorMessage: "The controlled camera inputs could not be assembled. Refresh the canvas image and retry.",
        permanent: false,
      },
      shot_invocation: {
        errorCode: "generation_shot_state_failed",
        errorMessage: "The controlled camera generation state could not be recorded. Please retry shortly.",
        permanent: false,
      },
      output_normalization: {
        errorCode: "generation_output_processing_failed",
        errorMessage: "The generated image could not be processed. Please retry shortly.",
        permanent: false,
      },
      candidate_evaluation: {
        errorCode: "generation_candidate_evaluation_failed",
        errorMessage: "The generated camera candidates could not be evaluated. Please retry shortly.",
        permanent: false,
      },
      asset_persistence: {
        errorCode: "storage_upload_failed",
        errorMessage: "The generated image could not be stored. Please retry shortly.",
        permanent: false,
      },
      job_completion: {
        errorCode: "generation_completion_failed",
        errorMessage: "The generated image is ready but could not be finalized. Please retry shortly.",
        permanent: false,
      },
    };

    return {
      ...stageDetails[stageError.stage],
      failureStage: stageError.stage,
      providerStatus: stageError.providerStatus,
      providerCode: stageError.providerCode,
    };
  }

  const normalizedError = toWorkerError(error);
  const message = normalizedError.message;
  const normalized = message.toLowerCase();

  if (normalized.includes("rate limit")) {
    return {
      errorCode: "provider_rate_limited",
      errorMessage: "The image provider is temporarily busy. Please retry shortly.",
      permanent: false,
      failureStage: null,
      providerStatus: null,
      providerCode: null,
    };
  }

  if (
    normalized.includes("timed out") ||
    normalized.includes("timeout") ||
    normalized.includes("network") ||
    normalized.includes("econn") ||
    normalized.includes("socket") ||
    normalized.includes("fetch failed") ||
    normalized.includes("temporary")
  ) {
    return {
      errorCode: "provider_temporary_failure",
      errorMessage: "The generation service is temporarily unavailable. Please retry shortly.",
      permanent: false,
      failureStage: null,
      providerStatus: null,
      providerCode: null,
    };
  }

  if (normalized.includes("openai") || normalized.includes("image generation")) {
    return {
      errorCode: "provider_invalid_request",
      errorMessage: "The image provider could not process this generation request.",
      permanent: true,
      failureStage: null,
      providerStatus: null,
      providerCode: null,
    };
  }

  if (normalized.includes("upload") || normalized.includes("storage")) {
    return {
      errorCode: "storage_upload_failed",
      errorMessage: "The generated image could not be stored. Please retry shortly.",
      permanent: false,
      failureStage: null,
      providerStatus: null,
      providerCode: null,
    };
  }

  if (
    normalized.includes("unsupported ai job type") ||
    normalized.includes("not supported yet") ||
    normalized.includes("missing") ||
    normalized.includes("invalid") ||
    normalized.includes("require") ||
    normalized.includes("conflict")
  ) {
    return {
      errorCode: "unsupported_job_type",
      errorMessage: "The generation request is invalid or no longer available.",
      permanent: true,
      failureStage: null,
      providerStatus: null,
      providerCode: null,
    };
  }

  return {
    errorCode: "worker_processing_failed",
    errorMessage: "The generation worker could not complete this request. Please retry shortly.",
    permanent: false,
    failureStage: null,
    providerStatus: null,
    providerCode: null,
  };
};
