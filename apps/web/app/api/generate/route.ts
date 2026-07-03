/*
 * Route: Deprecated direct canvas generate entrypoint.
 * Thuoc: generation compatibility layer.
 * Vai tro: ngan UI moi tiep tuc goi sync generate path va huong ve ai_jobs workflow.
 * Chuc nang:
 * - `POST`: tra ve thong bao deprecation ro rang.
 */

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Direct /api/generate is deprecated. Create an ai_job via /api/projects/[projectId]/ai-jobs and poll the job result instead.",
      deprecated: true,
    },
    { status: 410 },
  );
}
