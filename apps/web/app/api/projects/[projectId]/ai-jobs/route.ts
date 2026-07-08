/*
 * Route: API tao AI job theo project.
 * Thuoc: module background jobs / generation workflow.
 * Vai tro: dong goi yeu cau AI thanh job co snapshot + graph context de worker xu ly bat dong bo.
 * Chuc nang:
 * - `POST`: kiem tra quyen project, resolve snapshot, tao ai_job va enqueue vao queue.
 */

import { apiSuccess, readJsonObject } from "../../../_lib/http";
import { createProjectAiJob } from "../../../_lib/createProjectAiJob";
import { requireRequestContext } from "../../../_lib/authz";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const context = await requireRequestContext(request);
  if ("error" in context) {
    return context.error;
  }

  const { projectId } = await params;
  const body = await readJsonObject(request);
  const result = await createProjectAiJob({
    request,
    context,
    projectId,
    body,
  });

  if (!result.ok) {
    return result.response;
  }

  return apiSuccess(
    {
      job: result.data.job,
      idempotent: result.data.idempotent,
      creditsRemaining: result.data.creditsRemaining,
    },
    { status: result.data.created ? 201 : 200 },
  );
}
