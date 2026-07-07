/*
 * Route: Deprecated direct canvas generate entrypoint.
 * Thuoc: generation compatibility layer.
 * Vai tro: ngan UI moi tiep tuc goi sync generate path va huong ve ai_jobs workflow.
 * Chuc nang:
 * - `POST`: tra ve thong bao deprecation ro rang.
 */

import { apiFailure, createRequestId } from "../_lib/http";

export async function POST(request: Request) {
  return apiFailure(
    "LEGACY_GENERATE_DISABLED",
    "Direct /api/generate is disabled. Create an ai_job via /api/projects/[projectId]/ai-jobs and poll the job result instead.",
    410,
    createRequestId(request),
  );
}
