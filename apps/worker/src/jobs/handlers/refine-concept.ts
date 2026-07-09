/*
 * Flow: Handles refine jobs that now share the same image execution pipeline as generate jobs.
 * 1. Mark the job as running.
 * 2. Build the canonical prompt/brief state.
 * 3. Execute the provider pipeline and persist the result.
 */

import type { CarverAiJobPayload } from "@carver/shared";
import type { PreparedGenerationJobResult } from "../../services/generation-service";
import { executeGeneratedImageJob, prepareGenerationState } from "../../services/generation-service";

export const handleRefineConceptJob = async (
  job: CarverAiJobPayload,
): Promise<PreparedGenerationJobResult> => {
  const preparedState = prepareGenerationState(job);

  return executeGeneratedImageJob(job, preparedState);
};
