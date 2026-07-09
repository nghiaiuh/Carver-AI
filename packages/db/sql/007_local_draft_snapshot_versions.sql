alter type public.ai_job_status add value if not exists 'enqueue_failed';

alter table public.canvas_snapshots
  add column if not exists snapshot_kind text not null default 'manual',
  add column if not exists is_user_visible boolean not null default true,
  add column if not exists document_hash text;

create index if not exists canvas_snapshots_project_kind_created_at_desc_idx
  on public.canvas_snapshots (project_id, snapshot_kind, created_at desc);

create or replace function public.save_project_canvas_snapshot(
  target_project_id uuid,
  snapshot_canvas_json jsonb,
  snapshot_reason text default 'manual',
  snapshot_document_hash text default null
)
returns table (
  snapshot_id uuid,
  version integer,
  created_at timestamptz,
  snapshot_kind text,
  is_user_visible boolean,
  document_hash text
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  next_version integer;
  inserted_snapshot public.canvas_snapshots%rowtype;
  normalized_reason text;
  should_update_project_pointer boolean;
  user_visible boolean;
begin
  normalized_reason := lower(coalesce(snapshot_reason, 'manual'));

  if normalized_reason not in ('initial', 'manual', 'close', 'job_checkpoint') then
    raise exception 'Invalid snapshot reason' using errcode = 'P0001';
  end if;

  should_update_project_pointer := normalized_reason in ('initial', 'manual', 'close');
  user_visible := normalized_reason in ('manual', 'close');

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
    created_by,
    snapshot_kind,
    is_user_visible,
    document_hash
  )
  values (
    target_project_id,
    next_version,
    snapshot_canvas_json,
    auth.uid(),
    normalized_reason,
    user_visible,
    snapshot_document_hash
  )
  returning *
  into inserted_snapshot;

  if should_update_project_pointer then
    update public.projects
    set current_canvas_snapshot_id = inserted_snapshot.id
    where id = target_project_id
      and owner_id = auth.uid();
  end if;

  return query
  select
    inserted_snapshot.id,
    inserted_snapshot.version,
    inserted_snapshot.created_at,
    inserted_snapshot.snapshot_kind,
    inserted_snapshot.is_user_visible,
    inserted_snapshot.document_hash;
end;
$$;

grant execute on function public.save_project_canvas_snapshot(uuid, jsonb, text, text) to authenticated;

create or replace function public.create_ai_job_with_checkpoint(
  target_project_id uuid,
  target_thread_id uuid,
  target_job_type public.ai_job_type,
  target_prompt text,
  target_input_asset_ids uuid[],
  target_idempotency_key text,
  target_target_node_id text,
  target_job_payload jsonb,
  checkpoint_snapshot_json jsonb default null,
  checkpoint_document_hash text default null
)
returns table (
  id uuid,
  project_id uuid,
  thread_id uuid,
  status public.ai_job_status,
  job_type public.ai_job_type,
  prompt text,
  input_snapshot_id uuid,
  output_snapshot_id uuid,
  output_asset_ids uuid[],
  provider text,
  error_code text,
  error_message text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  locked_project public.projects%rowtype;
  next_version integer;
  checkpoint_snapshot public.canvas_snapshots%rowtype;
  created_job public.ai_jobs%rowtype;
begin
  select *
  into locked_project
  from public.projects
  where id = target_project_id
    and owner_id = auth.uid()
  for update;

  if not found then
    raise exception 'Project not found' using errcode = 'P0001';
  end if;

  if checkpoint_snapshot_json is not null then
    select coalesce(max(canvas_snapshots.version), 0) + 1
    into next_version
    from public.canvas_snapshots
    where project_id = target_project_id;

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
      target_project_id,
      next_version,
      checkpoint_snapshot_json,
      auth.uid(),
      'job_checkpoint',
      false,
      checkpoint_document_hash
    )
    returning *
    into checkpoint_snapshot;
  elsif locked_project.current_canvas_snapshot_id is not null then
    select *
    into checkpoint_snapshot
    from public.canvas_snapshots
    where id = locked_project.current_canvas_snapshot_id
      and project_id = target_project_id;
  end if;

  if checkpoint_snapshot.id is null then
    raise exception 'Snapshot not found' using errcode = 'P0001';
  end if;

  insert into public.ai_jobs (
    project_id,
    thread_id,
    created_by,
    status,
    job_type,
    prompt,
    input_snapshot_id,
    input_asset_ids,
    idempotency_key,
    target_node_id,
    job_payload
  )
  values (
    target_project_id,
    target_thread_id,
    auth.uid(),
    'queued',
    target_job_type,
    target_prompt,
    checkpoint_snapshot.id,
    coalesce(target_input_asset_ids, '{}'::uuid[]),
    target_idempotency_key,
    target_target_node_id,
    coalesce(target_job_payload, '{}'::jsonb)
  )
  returning *
  into created_job;

  delete from public.canvas_snapshots
  where project_id = target_project_id
    and snapshot_kind = 'job_checkpoint'
    and id in (
      select stale_snapshots.id
      from public.canvas_snapshots as stale_snapshots
      where stale_snapshots.project_id = target_project_id
        and stale_snapshots.snapshot_kind = 'job_checkpoint'
      order by stale_snapshots.created_at desc, stale_snapshots.id desc
      offset 20
    );

  return query
  select
    created_job.id,
    created_job.project_id,
    created_job.thread_id,
    created_job.status,
    created_job.job_type,
    created_job.prompt,
    created_job.input_snapshot_id,
    created_job.output_snapshot_id,
    created_job.output_asset_ids,
    created_job.provider,
    created_job.error_code,
    created_job.error_message,
    created_job.created_at,
    created_job.updated_at;
end;
$$;

grant execute on function public.create_ai_job_with_checkpoint(
  uuid,
  uuid,
  public.ai_job_type,
  text,
  uuid[],
  text,
  text,
  jsonb,
  jsonb,
  text
) to authenticated;
