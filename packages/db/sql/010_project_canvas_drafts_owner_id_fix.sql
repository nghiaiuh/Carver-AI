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

  select p.*
  into locked_project
  from public.projects as p
  where p.id = target_project_id
    and p.owner_id = auth.uid()
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
