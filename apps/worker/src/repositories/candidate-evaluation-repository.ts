import type { EvaluationScore, GenerationCandidate } from "@carver/shared";
import { getSupabaseAdmin } from "@carver/db/server";

export const persistCandidateEvaluation = async (params: {
  jobId: string;
  projectId: string;
  ownerId: string;
  candidate: GenerationCandidate;
  assetId: string;
  score: EvaluationScore;
}) => {
  const supabase = getSupabaseAdmin();
  const { error } = await (supabase as any)
    .from("ai_job_shot_candidate_evaluations")
    .upsert({
      ai_job_id: params.jobId,
      project_id: params.projectId,
      owner_id: params.ownerId,
      shot_id: params.candidate.shotId,
      shot_order: params.candidate.shotOrder,
      candidate_id: params.candidate.candidateId,
      candidate_index: params.candidate.candidateIndex,
      asset_id: params.assetId,
      evaluator_version: params.score.evaluatorVersion,
      decision: params.score.decision,
      composite_score: params.score.compositeScore,
      hard_gate_failures: params.score.hardGateFailures,
      metrics: params.score.metrics,
    }, { onConflict: "ai_job_id,candidate_id" });
  if (error) throw error;
};
