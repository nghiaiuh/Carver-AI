import { NextResponse } from "next/server";
import { getRequestContext } from "../_lib/auth";
import { readJsonObject, serverError, stringValue } from "../_lib/http";

const emptyCanvas = {
  schema: "carver-canvas-v1",
  shapes: [],
  assets: [],
};

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
      canvas_json: emptyCanvas,
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
