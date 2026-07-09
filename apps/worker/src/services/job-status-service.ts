/*
 * Flow: Wraps AI job status transitions.
 * 1. Expose simple start/succeed/fail functions to handlers.
 * 2. Delegate persistence to the repository layer.
 * 3. Keep status-transition code consistent across job handlers.
 */

import { aiJobRepository } from "../repositories/ai-job-repository";
import type { PreparedGenerationJobResult } from "./generation-service";

export const startJob = async (jobId: string, bullJobId: string) => {
  return aiJobRepository.markRunning(jobId, bullJobId);
};

export const succeedJob = async (jobId: string, result: PreparedGenerationJobResult) => {
  await aiJobRepository.markSucceeded(jobId, result);
};

export const failJob = async (
  jobId: string,
  params: {
    bullJobId?: string | null;
    errorCode: string;
    errorMessage: string;
  },
) => {
  await aiJobRepository.markFailed(jobId, params);
};

export const recordRetryableFailure = async (
  jobId: string,
  bullJobId: string,
  params: {
    errorCode: string;
    errorMessage: string;
  },
) => {
  await aiJobRepository.recordRetryableFailure(jobId, bullJobId, params);
};

export const reconcileExhaustedFailure = async (
  jobId: string,
  bullJobId: string | null,
  params: {
    errorCode: string;
    errorMessage: string;
  },
) => {
  await aiJobRepository.reconcileExhaustedFailure(jobId, bullJobId, params);
};
