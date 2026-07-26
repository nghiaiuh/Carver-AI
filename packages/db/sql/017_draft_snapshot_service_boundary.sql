-- Draft and snapshot writes must cross the web BFF boundary. Browser clients
-- cannot call these RPCs directly; the API verifies the authenticated actor,
-- payload limits, asset ownership, and rate limits before using service_role.

drop function if exists public.save_project_canvas_snapshot(uuid, jsonb);
drop function if exists public.save_project_canvas_snapshot(uuid, jsonb, text, text);

create function public.save_project_canvas_snapshot(
  actor_user_id uuid,
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
security definer
set search_path = public
as $$
declare
  next_version integer;
  inserted_snapshot public.canvas_snapshots%rowtype;
  normalized_reason text;
  should_update_project_pointer boolean;
  user_visible boolean;
begin
  if auth.role() <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = 'P0001';
  end if;

  if actor_user_id is null then
    raise exception 'ACTOR_REQUIRED' using errcode = 'P0001';
  end if;

  normalized_reason := lower(coalesce(snapshot_reason, 'manual'));
  if normalized_reason not in ('initial', 'manual', 'close', 'job_checkpoint') then
    raise exception 'INVALID_SNAPSHOT_REASON' using errcode = 'P0001';
  end if;

  should_update_project_pointer := normalized_reason in ('initial', 'manual', 'close');
  user_visible := normalized_reason in ('manual', 'close');

  perform 1
  from public.projects
  where id = target_project_id
    and owner_id = actor_user_id
  for update;

  if not found then
    raise exception 'PROJECT_NOT_FOUND' using errcode = 'P0001';
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
    actor_user_id,
    normalized_reason,
    user_visible,
    snapshot_document_hash
  )
  returning * into inserted_snapshot;

  if should_update_project_pointer then
    update public.projects
    set current_canvas_snapshot_id = inserted_snapshot.id
    where id = target_project_id
      and owner_id = actor_user_id;
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

drop function if exists public.upsert_project_canvas_draft(uuid, integer, jsonb, text, text, uuid);

create function public.upsert_project_canvas_draft(
  actor_user_id uuid,
  target_project_id uuid,
  expected_revision integer,
  draft_canvas_json jsonb,
  draft_document_hash text default null,
  draft_last_mutation_id text default null,
  draft_base_snapshot_id uuid default null
)
returns table (
  project_id uuid,
  owner_id uuid,
  base_snapshot_id uuid,
  revision integer,
  document_hash text,
  last_mutation_id text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_project public.projects%rowtype;
  existing_draft public.project_canvas_drafts%rowtype;
  saved_draft public.project_canvas_drafts%rowtype;
  normalized_expected_revision integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = 'P0001';
  end if;

  if actor_user_id is null then
    raise exception 'ACTOR_REQUIRED' using errcode = 'P0001';
  end if;

  normalized_expected_revision := coalesce(expected_revision, 0);

  select p.*
  into locked_project
  from public.projects as p
  where p.id = target_project_id
    and p.owner_id = actor_user_id
  for update;

  if not found then
    raise exception 'PROJECT_NOT_FOUND' using errcode = 'P0001';
  end if;

  select d.*
  into existing_draft
  from public.project_canvas_drafts as d
  where d.project_id = target_project_id
  for update;

  if found then
    if draft_last_mutation_id is not null
      and existing_draft.last_mutation_id = draft_last_mutation_id
    then
      saved_draft := existing_draft;
    elsif existing_draft.revision <> normalized_expected_revision then
      raise exception 'DRAFT_CONFLICT' using errcode = 'P0001';
    else
      update public.project_canvas_drafts as d
      set
        base_snapshot_id = coalesce(
          draft_base_snapshot_id,
          existing_draft.base_snapshot_id,
          locked_project.current_canvas_snapshot_id
        ),
        revision = existing_draft.revision + 1,
        document_hash = draft_document_hash,
        canvas_json = draft_canvas_json,
        last_mutation_id = draft_last_mutation_id,
        updated_at = timezone('utc', now())
      where d.project_id = target_project_id
      returning * into saved_draft;
    end if;
  else
    if normalized_expected_revision <> 0 then
      raise exception 'DRAFT_CONFLICT' using errcode = 'P0001';
    end if;

    insert into public.project_canvas_drafts (
      project_id,
      owner_id,
      base_snapshot_id,
      revision,
      document_hash,
      canvas_json,
      last_mutation_id
    )
    values (
      target_project_id,
      actor_user_id,
      coalesce(draft_base_snapshot_id, locked_project.current_canvas_snapshot_id),
      1,
      draft_document_hash,
      draft_canvas_json,
      draft_last_mutation_id
    )
    returning * into saved_draft;
  end if;

  return query
  select
    saved_draft.project_id,
    saved_draft.owner_id,
    saved_draft.base_snapshot_id,
    saved_draft.revision,
    saved_draft.document_hash,
    saved_draft.last_mutation_id,
    saved_draft.updated_at;
end;
$$;

drop function if exists public.finalize_project_canvas_draft(uuid, integer, text);

create function public.finalize_project_canvas_draft(
  actor_user_id uuid,
  target_project_id uuid,
  expected_revision integer,
  snapshot_reason text default 'manual'
)
returns table (
  snapshot_id uuid,
  version integer,
  created_at timestamptz,
  snapshot_kind text,
  is_user_visible boolean,
  document_hash text,
  base_snapshot_id uuid,
  draft_revision integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_project public.projects%rowtype;
  draft_row public.project_canvas_drafts%rowtype;
  inserted_snapshot public.canvas_snapshots%rowtype;
  next_version integer;
  normalized_reason text;
  user_visible boolean;
begin
  if auth.role() <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = 'P0001';
  end if;

  if actor_user_id is null then
    raise exception 'ACTOR_REQUIRED' using errcode = 'P0001';
  end if;

  normalized_reason := lower(coalesce(snapshot_reason, 'manual'));
  if normalized_reason not in ('manual', 'close', 'job_checkpoint') then
    raise exception 'INVALID_SNAPSHOT_REASON' using errcode = 'P0001';
  end if;

  select *
  into locked_project
  from public.projects
  where id = target_project_id
    and owner_id = actor_user_id
  for update;

  if not found then
    raise exception 'PROJECT_NOT_FOUND' using errcode = 'P0001';
  end if;

  select *
  into draft_row
  from public.project_canvas_drafts
  where project_id = target_project_id
  for update;

  if not found then
    raise exception 'DRAFT_NOT_FOUND' using errcode = 'P0001';
  end if;

  if draft_row.revision <> coalesce(expected_revision, 0) then
    raise exception 'DRAFT_CONFLICT' using errcode = 'P0001';
  end if;

  user_visible := normalized_reason in ('manual', 'close');

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
    draft_row.canvas_json,
    actor_user_id,
    normalized_reason,
    user_visible,
    draft_row.document_hash
  )
  returning * into inserted_snapshot;

  if normalized_reason in ('manual', 'close') then
    update public.projects
    set current_canvas_snapshot_id = inserted_snapshot.id
    where id = target_project_id
      and owner_id = actor_user_id;
  end if;

  update public.project_canvas_drafts
  set
    base_snapshot_id = inserted_snapshot.id,
    updated_at = timezone('utc', now())
  where project_id = target_project_id;

  return query
  select
    inserted_snapshot.id,
    inserted_snapshot.version,
    inserted_snapshot.created_at,
    inserted_snapshot.snapshot_kind,
    inserted_snapshot.is_user_visible,
    inserted_snapshot.document_hash,
    inserted_snapshot.id,
    draft_row.revision;
end;
$$;

-- The original trigger relies on auth.uid(), which is intentionally absent for
-- service-role RPC calls. Preserve the tenant invariant by checking the draft
-- owner against the actual project owner in that server-only path.
create or replace function public.enforce_project_canvas_draft_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_id is null then
    raise exception 'DRAFT_OWNERSHIP_INVALID' using errcode = 'P0001';
  end if;

  if auth.role() = 'service_role' then
    if not exists (
      select 1
      from public.projects
      where id = new.project_id
        and owner_id = new.owner_id
    ) then
      raise exception 'DRAFT_OWNERSHIP_INVALID' using errcode = 'P0001';
    end if;
  elsif auth.uid() is null
    or new.owner_id <> auth.uid()
    or not public.is_project_owner(new.project_id) then
    raise exception 'DRAFT_OWNERSHIP_INVALID' using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE' and new.owner_id <> old.owner_id then
    raise exception 'DRAFT_OWNER_IMMUTABLE' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function public.save_project_canvas_snapshot(uuid, uuid, jsonb, text, text) from public, anon, authenticated;
grant execute on function public.save_project_canvas_snapshot(uuid, uuid, jsonb, text, text) to service_role;

revoke all on function public.upsert_project_canvas_draft(uuid, uuid, integer, jsonb, text, text, uuid) from public, anon, authenticated;
grant execute on function public.upsert_project_canvas_draft(uuid, uuid, integer, jsonb, text, text, uuid) to service_role;

revoke all on function public.finalize_project_canvas_draft(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.finalize_project_canvas_draft(uuid, uuid, integer, text) to service_role;
