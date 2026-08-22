/*
 * Flow: Handles image generation jobs.
 * 1. Mark the job as running.
 * 2. Build the canonical prompt/brief state.
 * 3. Execute the provider pipeline and persist the result.
 */

import type { CarverAiJobPayload } from "@carver/shared";
import type { PreparedGenerationJobResult } from "../../services/generation-service";
import { executeGeneratedImageJob, prepareGenerationState } from "../../services/generation-service";

export const handleGenerateConceptJob = async (
  job: CarverAiJobPayload,
  options?: {
    currentAttempt?: number;
  },
): Promise<PreparedGenerationJobResult> => {
  const preparedState = await prepareGenerationState(job, job.cameraShotSetContext?.shots[0] ?? null);

  return executeGeneratedImageJob(job, preparedState, options);
};
