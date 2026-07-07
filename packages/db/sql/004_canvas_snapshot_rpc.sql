create or replace function public.save_project_canvas_snapshot(
  target_project_id uuid,
  snapshot_canvas_json jsonb
)
returns table (
  snapshot_id uuid,
  version integer,
  created_at timestamptz
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  next_version integer;
  inserted_snapshot public.canvas_snapshots%rowtype;
begin
  perform 1
  from public.projects
  where id = target_project_id
    and owner_id = auth.uid()
  for update;

  if not found then
    raise exception 'Project not found' using errcode = 'P0001';
  end if;

  select coalesce(max(canvas_snapshots.version), 0) + 1
  into next_version
  from public.canvas_snapshots
  where project_id = target_project_id;

  insert into public.canvas_snapshots (
    project_id,
    version,
    canvas_json,
    created_by
  )
  values (
    target_project_id,
    next_version,
    snapshot_canvas_json,
    auth.uid()
  )
  returning *
  into inserted_snapshot;

  update public.projects
  set current_canvas_snapshot_id = inserted_snapshot.id
  where id = target_project_id
    and owner_id = auth.uid();

  return query
  select
    inserted_snapshot.id,
    inserted_snapshot.version,
    inserted_snapshot.created_at;
end;
$$;

grant execute on function public.save_project_canvas_snapshot(uuid, jsonb) to authenticated;
