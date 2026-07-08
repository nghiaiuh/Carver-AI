/*
 * Flow: Wraps AI job status transitions.
 * 1. Expose simple start/succeed/fail functions to handlers.
 * 2. Delegate persistence to the repository layer.
 * 3. Keep status-transition code consistent across job handlers.
 */

import { aiJobRepository } from "../repositories/ai-job-repository";
import type { PreparedGenerationJobResult } from "./generation-service";

export const startJob = async (jobId: string) => {
  return aiJobRepository.markRunning(jobId);
};

export const succeedJob = async (jobId: string, result: PreparedGenerationJobResult) => {
  await aiJobRepository.markSucceeded(jobId, result);
};

export const failJob = async (
  jobId: string,
  params: {
    errorCode: string;
    errorMessage: string;
  },
) => {
  await aiJobRepository.markFailed(jobId, params);
};
