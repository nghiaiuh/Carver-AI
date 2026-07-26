/*
 * Flow: Maps worker/provider failures into stable ai_jobs error codes.
 * 1. Inspect the thrown error message.
 * 2. Return a normalized internal error code.
 * 3. Keep UI-facing failure handling predictable.
 */

export type WorkerJobError = {
  errorCode: string;
  errorMessage: string;
  permanent: boolean;
};

export const toWorkerError = (error: unknown) =>
  error instanceof Error ? error : new Error(typeof error === "string" ? error : "Unknown worker failure");

export const buildJobError = (error: unknown): WorkerJobError => {
  const normalizedError = toWorkerError(error);
  const message = normalizedError.message;
  const normalized = message.toLowerCase();

  if (normalized.includes("rate limit")) {
    return {
      errorCode: "provider_rate_limited",
      errorMessage: "The image provider is temporarily busy. Please retry shortly.",
      permanent: false,
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
    };
  }

  if (normalized.includes("openai") || normalized.includes("image generation")) {
    return {
      errorCode: "provider_invalid_request",
      errorMessage: "The image provider could not process this generation request.",
      permanent: true,
    };
  }

  if (normalized.includes("upload") || normalized.includes("storage")) {
    return {
      errorCode: "storage_upload_failed",
      errorMessage: "The generated image could not be stored. Please retry shortly.",
      permanent: false,
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
    };
  }

  return {
    errorCode: "worker_processing_failed",
    errorMessage: "The generation worker could not complete this request. Please retry shortly.",
    permanent: false,
  };
};
