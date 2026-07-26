/*
 * Route: API tao project moi.
 * Thuoc: module project / canvas workspace.
 * Vai tro: khoi tao du an moi cung snapshot, brief va chat thread mac dinh.
 * Chuc nang:
 * - `POST`: tao project, tao canvas snapshot version dau tien va cac ban ghi lien quan.
 */

import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createEmptyCanvasSnapshotDocument } from "@carver/shared";
import { createSafeLogger } from "@carver/shared";
import { getRequestContext } from "../_lib/auth";
import { apiFailure, readJsonObject, serverErrorResponse, stringValue } from "../_lib/http";
import { enforceRateLimit } from "../_lib/rateLimit";

const MAX_PROJECT_NAME_LENGTH = 160;
const MAX_PROJECT_TEXT_LENGTH = 4_000;
const logger = createSafeLogger("web.projects");

export async function GET(request: Request) {
  const context = await getRequestContext(request);
  if ("error" in context) {
    return context.error;
  }

  const { supabase, user } = context;
  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, name, description, status, current_canvas_snapshot_id, landscape_goal, created_at, updated_at")
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    logger.error("project list failed", {
      requestId: context.requestId,
      userId: user.id,
      error,
    });
    return serverErrorResponse(context.requestId);
  }

  return NextResponse.json({
    projects: projects ?? [],
  });
}

export async function POST(request: Request) {
  const context = await getRequestContext(request);
  if ("error" in context) {
    return context.error;
  }

  const body = await readJsonObject(request);
  const name = stringValue(body, "name") ?? "Untitled landscape";
  const description = stringValue(body, "description") ?? null;
  const landscapeGoal = stringValue(body, "landscape_goal") ?? null;

  if (
    name.length > MAX_PROJECT_NAME_LENGTH ||
    (description?.length ?? 0) > MAX_PROJECT_TEXT_LENGTH ||
    (landscapeGoal?.length ?? 0) > MAX_PROJECT_TEXT_LENGTH
  ) {
    return apiFailure("BAD_REQUEST", "Project details are too long.", 400, context.requestId);
  }

  const rateLimit = await enforceRateLimit(context, {
    scope: "project-create",
    limit: 10,
    windowMs: 60 * 60 * 1000,
  });
  if (!rateLimit.ok) {
    return rateLimit.response;
  }

  const { supabase } = context;
  const initialSnapshot = createEmptyCanvasSnapshotDocument();
  const initialSnapshotHash = createHash("sha256")
    .update(JSON.stringify(initialSnapshot))
    .digest("hex");

  const rpcClient = supabase as typeof supabase & {
    rpc: (
      functionName: "create_project_workspace",
      params: Record<string, unknown>,
    ) => Promise<{ data: Record<string, unknown> | null; error: { message?: string } | null }>;
  };
  const { data, error } = await rpcClient.rpc("create_project_workspace", {
    p_name: name,
    p_description: description,
    p_landscape_goal: landscapeGoal,
    p_initial_snapshot: initialSnapshot,
    p_initial_snapshot_hash: initialSnapshotHash,
  });

  if (error || !data) {
    logger.error("project workspace creation failed", {
      requestId: context.requestId,
      userId: context.user.id,
      error,
    });
    return apiFailure("PROJECT_CREATE_FAILED", "Unable to create the project.", 500, context.requestId);
  }

  return NextResponse.json(
    data,
    { status: 201 },
  );
}
