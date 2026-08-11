-- Operation-first canvas draft persistence. The materialized draft remains the
-- fast read model while this log gives the API an idempotent, conflict-aware
-- history for tabs and future collaborators.

create table if not exists public.project_canvas_draft_operations (
  operation_id uuid primary key,
  project_id uuid not null references public.projects(id) on delete cascade,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  client_sequence bigint not null,
  batch_id uuid not null,
  base_revision integer not null,
  committed_revision integer not null,
  entity_key text not null,
  operation_type text not null,
  payload jsonb not null,
  created_at timestamptz not null default now()
);

create unique index if not exists project_canvas_draft_operations_batch_operation_idx
  on public.project_canvas_draft_operations(batch_id, operation_id);
create index if not exists project_canvas_draft_operations_project_revision_idx
  on public.project_canvas_draft_operations(project_id, committed_revision, created_at);
create index if not exists project_canvas_draft_operations_project_entity_idx
  on public.project_canvas_draft_operations(project_id, entity_key, committed_revision);

create table if not exists public.project_canvas_recoveries (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  base_revision integer not null,
  cloud_revision integer not null,
  document_hash text not null,
  canvas_json jsonb not null,
  conflicting_entity_keys text[] not null default '{}',
  reason text not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists project_canvas_recoveries_project_created_idx
  on public.project_canvas_recoveries(project_id, created_at desc);

alter table public.project_canvas_draft_operations enable row level security;
alter table public.project_canvas_recoveries enable row level security;

-- Browser clients never call these tables/RPC directly. The Next.js BFF uses
-- the service role only after authenticating and checking project ownership.
revoke all on table public.project_canvas_draft_operations from anon, authenticated;
revoke all on table public.project_canvas_recoveries from anon, authenticated;
grant select, insert, update, delete on table public.project_canvas_draft_operations to service_role;
grant select, insert, update, delete on table public.project_canvas_recoveries to service_role;

create or replace function public.commit_project_canvas_operation_batch(
  actor_user_id uuid,
  target_project_id uuid,
  expected_revision integer,
  target_batch_id uuid,
  target_client_id text,
  batch_operations jsonb,
  resulting_canvas_json jsonb,
  resulting_document_hash text,
  draft_base_snapshot_id uuid default null
)
returns table (
  project_id uuid,
  owner_id uuid,
  base_snapshot_id uuid,
  revision integer,
  document_hash text,
  last_mutation_id text,
  updated_at timestamptz,
  batch_id uuid,
  acked_operation_ids uuid[]
)
language plpgsql
security definer
set search_path = public
as $$
declare
  project_owner_id uuid;
  current_draft public.project_canvas_drafts%rowtype;
  next_revision integer;
  operation jsonb;
  acknowledged_ids uuid[];
begin
  if jsonb_typeof(batch_operations) <> 'array' or jsonb_array_length(batch_operations) = 0 then
    raise exception 'DRAFT_OPERATION_BATCH_EMPTY';
  end if;

  select owner_id into project_owner_id
  from public.projects
  where id = target_project_id
  for update;

  if project_owner_id is null or project_owner_id <> actor_user_id then
    raise exception 'PROJECT_NOT_FOUND';
  end if;

  select array_agg((item ->> 'operationId')::uuid order by item ->> 'operationId')
  into acknowledged_ids
  from jsonb_array_elements(batch_operations) as item;

  -- Retrying exactly the same batch is idempotent. A partial duplicate is not
  -- accepted because it could hide a client bug with a different document.
  if exists (
    select 1 from public.project_canvas_draft_operations where batch_id = target_batch_id
  ) then
    select * into current_draft
    from public.project_canvas_drafts
    where project_id = target_project_id;

    if current_draft.project_id is null then
      raise exception 'DRAFT_BATCH_INCONSISTENT';
    end if;

    select array_agg(operation_id order by operation_id)
    into acknowledged_ids
    from public.project_canvas_draft_operations
    where batch_id = target_batch_id;

    return query select
      current_draft.project_id,
      current_draft.owner_id,
      current_draft.base_snapshot_id,
      current_draft.revision,
      current_draft.document_hash,
      current_draft.last_mutation_id,
      current_draft.updated_at,
      target_batch_id,
      acknowledged_ids;
    return;
  end if;

  select * into current_draft
  from public.project_canvas_drafts
  where project_id = target_project_id
  for update;

  if current_draft.project_id is null then
    if expected_revision <> 0 then
      raise exception 'DRAFT_CONFLICT';
    end if;
    next_revision := 1;
    insert into public.project_canvas_drafts (
      project_id, owner_id, base_snapshot_id, revision, document_hash,
      canvas_json, last_mutation_id, updated_at
    ) values (
      target_project_id, actor_user_id, draft_base_snapshot_id, next_revision,
      resulting_document_hash, resulting_canvas_json, target_batch_id::text, now()
    )
    returning * into current_draft;
  else
    if current_draft.owner_id <> actor_user_id or current_draft.revision <> expected_revision then
      raise exception 'DRAFT_CONFLICT';
    end if;
    next_revision := current_draft.revision + 1;
    update public.project_canvas_drafts
    set base_snapshot_id = coalesce(draft_base_snapshot_id, current_draft.base_snapshot_id),
        revision = next_revision,
        document_hash = resulting_document_hash,
        canvas_json = resulting_canvas_json,
        last_mutation_id = target_batch_id::text,
        updated_at = now()
    where project_id = target_project_id
    returning * into current_draft;
  end if;

  for operation in select value from jsonb_array_elements(batch_operations)
  loop
    insert into public.project_canvas_draft_operations (
      operation_id, project_id, actor_user_id, client_id, client_sequence,
      batch_id, base_revision, committed_revision, entity_key, operation_type,
      payload, created_at
    ) values (
      (operation ->> 'operationId')::uuid,
      target_project_id,
      actor_user_id,
      target_client_id,
      coalesce((operation ->> 'clientSequence')::bigint, 0),
      target_batch_id,
      expected_revision,
      current_draft.revision,
      operation ->> 'entityKey',
      operation ->> 'type',
      operation -> 'payload',
      coalesce((operation ->> 'createdAt')::timestamptz, now())
    );
  end loop;

  return query select
    current_draft.project_id,
    current_draft.owner_id,
    current_draft.base_snapshot_id,
    current_draft.revision,
    current_draft.document_hash,
    current_draft.last_mutation_id,
    current_draft.updated_at,
    target_batch_id,
    acknowledged_ids;
end;
$$;

revoke all on function public.commit_project_canvas_operation_batch(uuid, uuid, integer, uuid, text, jsonb, jsonb, text, uuid) from public, anon, authenticated;
grant execute on function public.commit_project_canvas_operation_batch(uuid, uuid, integer, uuid, text, jsonb, jsonb, text, uuid) to service_role;
