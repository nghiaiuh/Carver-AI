-- Create a project and its required baseline records atomically. The web route
-- supplies only user-facing fields; ownership always comes from auth.uid().

create or replace function public.create_project_workspace(
  p_name text,
  p_description text,
  p_landscape_goal text,
  p_initial_snapshot jsonb,
  p_initial_snapshot_hash text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  created_project public.projects%rowtype;
  created_snapshot public.canvas_snapshots%rowtype;
  created_brief public.landscape_briefs%rowtype;
  created_thread public.chat_threads%rowtype;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  if p_name is null or char_length(trim(p_name)) not between 1 and 160
    or char_length(coalesce(p_description, '')) > 4000
    or char_length(coalesce(p_landscape_goal, '')) > 4000
    or p_initial_snapshot is null
    or octet_length(p_initial_snapshot::text) > 1048576
    or p_initial_snapshot_hash is null
    or char_length(trim(p_initial_snapshot_hash)) not between 32 and 128 then
    raise exception 'INVALID_PROJECT_INPUT' using errcode = 'P0001';
  end if;

  insert into public.projects (owner_id, name, description, landscape_goal)
  values (
    auth.uid(),
    trim(p_name),
    nullif(trim(coalesce(p_description, '')), ''),
    nullif(trim(coalesce(p_landscape_goal, '')), '')
  )
  returning * into created_project;

  insert into public.canvas_snapshots (
    project_id,
    version,
    canvas_json,
    created_by,
    snapshot_kind,
    is_user_visible,
    document_hash
  )
  values (
    created_project.id,
    1,
    p_initial_snapshot,
    auth.uid(),
    'initial',
    false,
    trim(p_initial_snapshot_hash)
  )
  returning * into created_snapshot;

  update public.projects
  set current_canvas_snapshot_id = created_snapshot.id
  where id = created_project.id
  returning * into created_project;

  insert into public.landscape_briefs (project_id)
  values (created_project.id)
  returning * into created_brief;

  insert into public.chat_threads (project_id)
  values (created_project.id)
  returning * into created_thread;

  return jsonb_build_object(
    'project', to_jsonb(created_project),
    'current_snapshot', to_jsonb(created_snapshot),
    'landscape_brief', to_jsonb(created_brief),
    'chat_thread', to_jsonb(created_thread)
  );
end;
$$;

revoke all on function public.create_project_workspace(text, text, text, jsonb, text) from public, anon;
grant execute on function public.create_project_workspace(text, text, text, jsonb, text) to authenticated;
