/*
 * Flow: Maps worker/provider failures into stable ai_jobs error codes.
 * 1. Inspect the thrown error message.
 * 2. Return a normalized internal error code.
 * 3. Keep UI-facing failure handling predictable.
 */

export const buildJobError = (error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown worker failure";
  const normalized = message.toLowerCase();

  if (normalized.includes("rate limit")) {
    return {
      errorCode: "provider_rate_limited",
      errorMessage: message,
    };
  }

  if (normalized.includes("openai") || normalized.includes("image generation")) {
    return {
      errorCode: "provider_invalid_request",
      errorMessage: message,
    };
  }

  if (normalized.includes("upload") || normalized.includes("storage")) {
    return {
      errorCode: "storage_upload_failed",
      errorMessage: message,
    };
  }

  return {
    errorCode: "worker_processing_failed",
    errorMessage: message,
  };
};
