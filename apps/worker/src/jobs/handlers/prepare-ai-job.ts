/*
 * Flow: Handles non-image-execution jobs during the transition period.
 * 1. Mark the job as running.
 * 2. Build the canonical preparation result only.
 * 3. Persist prompt/brief metadata without calling the image provider.
 */

import type { CarverAiJobPayload } from "@carver/shared";
import type { PreparedGenerationJobResult } from "../../services/generation-service";
import { prepareGenerationJobResult, prepareGenerationState } from "../../services/generation-service";

export const handlePrepareAiJob = async (
  job: CarverAiJobPayload,
): Promise<PreparedGenerationJobResult> => {
  const preparedState = await prepareGenerationState(job, job.cameraShotSetContext?.shots[0] ?? null);
  return prepareGenerationJobResult(preparedState);
};
