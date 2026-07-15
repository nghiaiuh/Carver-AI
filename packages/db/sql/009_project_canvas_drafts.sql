create table if not exists public.project_canvas_drafts (
  project_id uuid primary key references public.projects(id) on delete cascade,
  owner_id uuid not null,
  base_snapshot_id uuid references public.canvas_snapshots(id) on delete set null,
  revision integer not null default 0 check (revision >= 0),
  document_hash text,
  canvas_json jsonb not null default '{}'::jsonb,
  last_mutation_id text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists project_canvas_drafts_owner_updated_at_desc_idx
  on public.project_canvas_drafts (owner_id, updated_at desc);

alter table public.project_canvas_drafts enable row level security;

drop policy if exists "project_canvas_drafts_project_owner_all" on public.project_canvas_drafts;
create policy "project_canvas_drafts_project_owner_all"
on public.project_canvas_drafts for all
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

create or replace function public.upsert_project_canvas_draft(
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
security invoker
set search_path = public
as $$
declare
  locked_project public.projects%rowtype;
  existing_draft public.project_canvas_drafts%rowtype;
  saved_draft public.project_canvas_drafts%rowtype;
  normalized_expected_revision integer;
begin
  normalized_expected_revision := coalesce(expected_revision, 0);

  select *
  into locked_project
  from public.projects
  where id = target_project_id
    and owner_id = auth.uid()
  for update;

  if not found then
    raise exception 'PROJECT_NOT_FOUND' using errcode = 'P0001';
  end if;

  select *
  into existing_draft
  from public.project_canvas_drafts
  where project_id = target_project_id
  for update;

  if found then
    if draft_last_mutation_id is not null
      and existing_draft.last_mutation_id = draft_last_mutation_id
    then
      saved_draft := existing_draft;
    elsif existing_draft.revision <> normalized_expected_revision then
      raise exception 'DRAFT_CONFLICT' using errcode = 'P0001';
    else
      update public.project_canvas_drafts
      set
        base_snapshot_id = coalesce(draft_base_snapshot_id, existing_draft.base_snapshot_id, locked_project.current_canvas_snapshot_id),
        revision = existing_draft.revision + 1,
        document_hash = draft_document_hash,
        canvas_json = draft_canvas_json,
        last_mutation_id = draft_last_mutation_id,
        updated_at = timezone('utc', now())
      where project_id = target_project_id
      returning *
      into saved_draft;
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
      auth.uid(),
      coalesce(draft_base_snapshot_id, locked_project.current_canvas_snapshot_id),
      1,
      draft_document_hash,
      draft_canvas_json,
      draft_last_mutation_id
    )
    returning *
    into saved_draft;
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

grant execute on function public.upsert_project_canvas_draft(uuid, integer, jsonb, text, text, uuid) to authenticated;

create or replace function public.finalize_project_canvas_draft(
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
security invoker
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
  normalized_reason := lower(coalesce(snapshot_reason, 'manual'));

  if normalized_reason not in ('manual', 'close', 'job_checkpoint') then
    raise exception 'INVALID_SNAPSHOT_REASON' using errcode = 'P0001';
  end if;

  select *
  into locked_project
  from public.projects
  where id = target_project_id
    and owner_id = auth.uid()
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
    auth.uid(),
    normalized_reason,
    user_visible,
    draft_row.document_hash
  )
  returning *
  into inserted_snapshot;

  if normalized_reason in ('manual', 'close') then
    update public.projects
    set current_canvas_snapshot_id = inserted_snapshot.id
    where id = target_project_id
      and owner_id = auth.uid();
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

grant execute on function public.finalize_project_canvas_draft(uuid, integer, text) to authenticated;
