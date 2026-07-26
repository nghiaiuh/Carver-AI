import { notifyOperationalAlert } from "@carver/shared";
import { requireProjectOwner, requireRequestContext } from "../../_lib/authz";
import { apiFailure, apiSuccess } from "../../_lib/http";
import { enforceRateLimit } from "../../_lib/rateLimit";
import {
  deleteOwnedProject,
  ProjectDeleteNotFoundError,
  ProjectHasActiveJobsError,
} from "../../../../lib/server/projectLifecycleService";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const context = await requireRequestContext(request);
  if ("error" in context) {
    return context.error;
  }

  const { projectId } = await params;
  const projectResult = await requireProjectOwner(context, projectId ?? "");
  if ("error" in projectResult) {
    return projectResult.error;
  }

  const rateLimit = await enforceRateLimit(context, {
    scope: "project-delete",
    limit: 10,
    windowMs: 60 * 60 * 1000,
  });
  if (!rateLimit.ok) {
    return rateLimit.response;
  }

  try {
    const result = await deleteOwnedProject({
      supabase: context.supabase,
      projectId: projectResult.project.id,
      ownerId: context.user.id,
    });

    if (result.r2CleanupPending) {
      void notifyOperationalAlert({
        event: "project_r2_cleanup_pending",
        severity: "warning",
        cooldownKey: "project_r2_cleanup_pending",
        metadata: {
          requestId: context.requestId,
          userId: context.user.id,
          projectId: projectResult.project.id,
        },
      });
    }

    return apiSuccess({ deleted: true, r2CleanupPending: result.r2CleanupPending });
  } catch (error) {
    if (error instanceof ProjectHasActiveJobsError) {
      return apiFailure(
        "PROJECT_HAS_ACTIVE_JOBS",
        "Wait for active AI jobs before deleting this project.",
        409,
        context.requestId,
      );
    }
    if (error instanceof ProjectDeleteNotFoundError) {
      return apiFailure("PROJECT_NOT_FOUND", "Project not found.", 404, context.requestId);
    }
    return apiFailure("PROJECT_DELETE_FAILED", "Unable to delete the project.", 500, context.requestId);
  }
}
