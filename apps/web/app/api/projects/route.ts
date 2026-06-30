/*
 * Route: API tao project moi.
 * Thuoc: module project / canvas workspace.
 * Vai tro: khoi tao du an moi cung snapshot, brief va chat thread mac dinh.
 * Chuc nang:
 * - `POST`: tao project, tao canvas snapshot version dau tien va cac ban ghi lien quan.
 */

import { NextResponse } from "next/server";
import { createEmptyCanvasSnapshotDocument } from "@carver/shared";
import { getRequestContext } from "../_lib/auth";
import { readJsonObject, serverError, stringValue } from "../_lib/http";

export async function POST(request: Request) {
  const context = await getRequestContext(request);
  if ("error" in context) {
    return context.error;
  }

  const body = await readJsonObject(request);
  const name = stringValue(body, "name") ?? "Untitled landscape";
  const description = stringValue(body, "description") ?? null;
  const landscapeGoal = stringValue(body, "landscape_goal") ?? null;

  const { supabase, user } = context;

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .insert({
      owner_id: user.id,
      name,
      description,
      landscape_goal: landscapeGoal,
    })
    .select()
    .single();

  if (projectError) {
    return serverError();
  }

  const { data: snapshot, error: snapshotError } = await supabase
    .from("canvas_snapshots")
    .insert({
      project_id: project.id,
      version: 1,
      canvas_json: createEmptyCanvasSnapshotDocument(),
      created_by: user.id,
    })
    .select()
    .single();

  if (snapshotError) {
    return serverError();
  }

  const [{ error: projectUpdateError }, { data: brief }, { data: thread }] =
    await Promise.all([
      supabase
        .from("projects")
        .update({ current_canvas_snapshot_id: snapshot.id })
        .eq("id", project.id),
      supabase
        .from("landscape_briefs")
        .insert({ project_id: project.id })
        .select()
        .single(),
      supabase
        .from("chat_threads")
        .insert({ project_id: project.id })
        .select()
        .single(),
    ]);

  if (projectUpdateError) {
    return serverError();
  }

  return NextResponse.json(
    {
      project: { ...project, current_canvas_snapshot_id: snapshot.id },
      current_snapshot: snapshot,
      landscape_brief: brief,
      chat_thread: thread,
    },
    { status: 201 }
  );
}
