/*
 * Flow: Persists AI job state transitions.
 * 1. Update ai_jobs status as work progresses.
 * 2. Store job results when preparation succeeds.
 * 3. Persist failure metadata when processing breaks.
 */

import { getSupabaseAdmin } from "@carver/db/server";
import type { PreparedGenerationJobResult } from "../services/generation-service";

const markRunning = async (jobId: string) => {
  const supabase = getSupabaseAdmin();

  await supabase
    .from("ai_jobs")
    .update({
      status: "running",
      error_code: null,
      error_message: null,
    })
    .eq("id", jobId);
};

const markSucceeded = async (jobId: string, result: PreparedGenerationJobResult) => {
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("ai_jobs")
    .update({
      status: "succeeded",
      provider: result.provider,
      job_result: result.jobResult,
    })
    .eq("id", jobId);

  if (error) {
    throw error;
  }
};

const markFailed = async (
  jobId: string,
  params: {
    errorCode: string;
    errorMessage: string;
  },
) => {
  const supabase = getSupabaseAdmin();

  await supabase
    .from("ai_jobs")
    .update({
      status: "failed",
      error_code: params.errorCode,
      error_message: params.errorMessage,
    })
    .eq("id", jobId);
};

export const aiJobRepository = {
  markRunning,
  markSucceeded,
  markFailed,
};
