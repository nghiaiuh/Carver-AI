import { apiSuccess, readJsonObject } from "../_lib/http";
import { requireRequestContext } from "../_lib/authz";
import { runAssistantCard } from "../../../lib/server/assistantService";

export async function POST(request: Request) {
  const context = await requireRequestContext(request);
  if ("error" in context) {
    return context.error;
  }

  const body = await readJsonObject(request);
  const projectId = typeof body.projectId === "string" ? body.projectId.trim() : "";
  const result = await runAssistantCard({
    request,
    context,
    projectId,
    body,
  });

  if (!result.ok) {
    return result.response;
  }

  return apiSuccess(result.data);
}
