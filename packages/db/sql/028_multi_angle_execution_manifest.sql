-- Durable per-shot state for multi-angle image execution.
--
-- A provider request is externally observable but cannot be made transactional
-- with Postgres. Before dispatching it, the worker records `outcome_unknown`.
-- A replay may recover a verified asset, but must never issue a second request
-- for an invocation whose first outcome is ambiguous.

create table if not exists public.ai_job_shot_invocations (
  id uuid primary key default gen_random_uuid(),
  ai_job_id uuid not null references public.ai_jobs(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  shot_set_node_id text not null check (char_length(shot_set_node_id) between 1 and 200),
  shot_id text not null check (char_length(shot_id) between 1 and 200),
  shot_order integer not null check (shot_order >= 0),
  candidate_index integer not null default 0 check (candidate_index between 0 and 3),
  invocation_id text not null check (char_length(invocation_id) between 1 and 200),
  candidate_id text not null check (char_length(candidate_id) between 1 and 200),
  status text not null default 'pending' check (status in ('pending', 'outcome_unknown', 'persisted')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  conditioning_hash text,
  requested_model text,
  provider_model text,
  output_asset_id uuid references public.assets(id) on delete set null,
  claim_token uuid,
  claim_expires_at timestamptz,
  provider_started_at timestamptz,
  persisted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ai_job_id, shot_id, candidate_index),
  unique (invocation_id)
);

create index if not exists ai_job_shot_invocations_job_status_order_idx
  on public.ai_job_shot_invocations (ai_job_id, status, shot_order, candidate_index);

create index if not exists ai_job_shot_invocations_project_owner_idx
  on public.ai_job_shot_invocations (project_id, owner_id, created_at desc);

drop trigger if exists ai_job_shot_invocations_set_updated_at on public.ai_job_shot_invocations;
create trigger ai_job_shot_invocations_set_updated_at
before update on public.ai_job_shot_invocations
for each row
execute function public.set_updated_at();

alter table public.ai_job_shot_invocations enable row level security;
revoke all on table public.ai_job_shot_invocations from public, anon;
revoke insert, update, delete on table public.ai_job_shot_invocations from authenticated;
grant select on table public.ai_job_shot_invocations to authenticated;
grant select, insert, update, delete on table public.ai_job_shot_invocations to service_role;

drop policy if exists "ai_job_shot_invocations_project_owner_select" on public.ai_job_shot_invocations;
create policy "ai_job_shot_invocations_project_owner_select"
  on public.ai_job_shot_invocations
  for select
  using (owner_id = auth.uid() and public.is_project_owner(project_id));

create or replace function public.claim_ai_job_shot_invocation(
  target_ai_job_id uuid,
  target_project_id uuid,
  target_owner_id uuid,
  target_shot_set_node_id text,
  target_shot_id text,
  target_shot_order integer,
  target_candidate_index integer,
  target_invocation_id text,
  target_candidate_id text,
  target_claim_token uuid,
  target_lease_seconds integer default 300
)
returns table (
  state_status text,
  invocation_id text,
  candidate_id text,
  output_asset_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  invocation public.ai_job_shot_invocations%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = 'P0001';
  end if;

  if target_ai_job_id is null
    or target_project_id is null
    or target_owner_id is null
    or target_claim_token is null
    or char_length(trim(coalesce(target_shot_set_node_id, ''))) not between 1 and 200
    or char_length(trim(coalesce(target_shot_id, ''))) not between 1 and 200
    or target_shot_order < 0
    or target_candidate_index not between 0 and 3
    or char_length(trim(coalesce(target_invocation_id, ''))) not between 1 and 200
    or char_length(trim(coalesce(target_candidate_id, ''))) not between 1 and 200
    or target_lease_seconds not between 30 and 900 then
    raise exception 'INVALID_SHOT_INVOCATION_INPUT' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.ai_jobs as jobs
    where jobs.id = target_ai_job_id
      and jobs.project_id = target_project_id
      and jobs.created_by = target_owner_id
  ) then
    raise exception 'AI_JOB_NOT_FOUND' using errcode = 'P0001';
  end if;

  insert into public.ai_job_shot_invocations (
    ai_job_id, project_id, owner_id, shot_set_node_id, shot_id, shot_order,
    candidate_index, invocation_id, candidate_id
  )
  values (
    target_ai_job_id, target_project_id, target_owner_id,
    trim(target_shot_set_node_id), trim(target_shot_id), target_shot_order,
    target_candidate_index, trim(target_invocation_id), trim(target_candidate_id)
  )
  on conflict (ai_job_id, shot_id, candidate_index) do nothing;

  select * into invocation
  from public.ai_job_shot_invocations as invocations
  where invocations.ai_job_id = target_ai_job_id
    and invocations.shot_id = trim(target_shot_id)
    and invocations.candidate_index = target_candidate_index
  for update;

  if invocation.id is null
    or invocation.project_id <> target_project_id
    or invocation.owner_id <> target_owner_id
    or invocation.shot_set_node_id <> trim(target_shot_set_node_id)
    or invocation.shot_order <> target_shot_order
    or invocation.invocation_id <> trim(target_invocation_id)
    or invocation.candidate_id <> trim(target_candidate_id) then
    raise exception 'SHOT_INVOCATION_IDENTITY_CONFLICT' using errcode = 'P0001';
  end if;

  if invocation.status = 'persisted' then
    return query select 'persisted', invocation.invocation_id, invocation.candidate_id, invocation.output_asset_id;
    return;
  end if;

  if invocation.status = 'outcome_unknown' then
    return query select 'outcome_unknown', invocation.invocation_id, invocation.candidate_id, invocation.output_asset_id;
    return;
  end if;

  if invocation.claim_expires_at is not null and invocation.claim_expires_at > now() then
    return query select 'busy', invocation.invocation_id, invocation.candidate_id, invocation.output_asset_id;
    return;
  end if;

  update public.ai_job_shot_invocations as invocations
  set
    claim_token = target_claim_token,
    claim_expires_at = now() + make_interval(secs => target_lease_seconds),
    attempt_count = invocations.attempt_count + 1
  where invocations.id = invocation.id;

  return query select 'claimed', invocation.invocation_id, invocation.candidate_id, invocation.output_asset_id;
end;
$$;

create or replace function public.mark_ai_job_shot_invocation_outcome_unknown(
  target_ai_job_id uuid,
  target_project_id uuid,
  target_owner_id uuid,
  target_invocation_id text,
  target_claim_token uuid,
  target_conditioning_hash text,
  target_requested_model text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = 'P0001';
  end if;

  if target_ai_job_id is null
    or target_project_id is null
    or target_owner_id is null
    or target_claim_token is null
    or char_length(trim(coalesce(target_invocation_id, ''))) not between 1 and 200 then
    raise exception 'INVALID_SHOT_INVOCATION_INPUT' using errcode = 'P0001';
  end if;

  update public.ai_job_shot_invocations as invocations
  set
    status = 'outcome_unknown',
    conditioning_hash = nullif(trim(coalesce(target_conditioning_hash, '')), ''),
    requested_model = nullif(trim(coalesce(target_requested_model, '')), ''),
    provider_started_at = now(),
    claim_expires_at = null
  where invocations.ai_job_id = target_ai_job_id
    and invocations.project_id = target_project_id
    and invocations.owner_id = target_owner_id
    and invocations.invocation_id = trim(target_invocation_id)
    and invocations.claim_token = target_claim_token
    and invocations.status = 'pending';

  return found;
end;
$$;

create or replace function public.mark_ai_job_shot_invocation_persisted(
  target_ai_job_id uuid,
  target_project_id uuid,
  target_owner_id uuid,
  target_shot_set_node_id text,
  target_shot_id text,
  target_shot_order integer,
  target_candidate_index integer,
  target_invocation_id text,
  target_candidate_id text,
  target_output_asset_id uuid,
  target_claim_token uuid default null,
  target_conditioning_hash text default null,
  target_provider_model text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  invocation public.ai_job_shot_invocations%rowtype;
begin
  if auth.role() <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = 'P0001';
  end if;

  if target_ai_job_id is null
    or target_project_id is null
    or target_owner_id is null
    or target_output_asset_id is null
    or char_length(trim(coalesce(target_shot_set_node_id, ''))) not between 1 and 200
    or char_length(trim(coalesce(target_shot_id, ''))) not between 1 and 200
    or target_shot_order < 0
    or target_candidate_index not between 0 and 3
    or char_length(trim(coalesce(target_invocation_id, ''))) not between 1 and 200
    or char_length(trim(coalesce(target_candidate_id, ''))) not between 1 and 200 then
    raise exception 'INVALID_SHOT_INVOCATION_INPUT' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.assets as assets
    where assets.id = target_output_asset_id
      and assets.source_job_id = target_ai_job_id
      and assets.project_id = target_project_id
      and assets.owner_id = target_owner_id
      and (
        coalesce(assets.metadata, '{}'::jsonb) ->> 'invocationId' = trim(target_invocation_id)
        or (
          not (coalesce(assets.metadata, '{}'::jsonb) ? 'invocationId')
          and coalesce(assets.metadata, '{}'::jsonb) -> 'cameraShot' ->> 'shotId' = trim(target_shot_id)
        )
      )
  ) then
    raise exception 'SHOT_INVOCATION_OUTPUT_ASSET_MISMATCH' using errcode = 'P0001';
  end if;

  insert into public.ai_job_shot_invocations (
    ai_job_id, project_id, owner_id, shot_set_node_id, shot_id, shot_order,
    candidate_index, invocation_id, candidate_id, status, output_asset_id,
    conditioning_hash, provider_model, persisted_at
  )
  values (
    target_ai_job_id, target_project_id, target_owner_id,
    trim(target_shot_set_node_id), trim(target_shot_id), target_shot_order,
    target_candidate_index, trim(target_invocation_id), trim(target_candidate_id),
    'persisted', target_output_asset_id,
    nullif(trim(coalesce(target_conditioning_hash, '')), ''),
    nullif(trim(coalesce(target_provider_model, '')), ''), now()
  )
  on conflict (ai_job_id, shot_id, candidate_index) do nothing;

  select * into invocation
  from public.ai_job_shot_invocations as invocations
  where invocations.ai_job_id = target_ai_job_id
    and invocations.shot_id = trim(target_shot_id)
    and invocations.candidate_index = target_candidate_index
  for update;

  if invocation.id is null
    or invocation.project_id <> target_project_id
    or invocation.owner_id <> target_owner_id
    or invocation.shot_set_node_id <> trim(target_shot_set_node_id)
    or invocation.shot_order <> target_shot_order
    or invocation.invocation_id <> trim(target_invocation_id)
    or invocation.candidate_id <> trim(target_candidate_id)
    or (invocation.output_asset_id is not null and invocation.output_asset_id <> target_output_asset_id) then
    return false;
  end if;

  if invocation.status = 'persisted' then
    return invocation.output_asset_id = target_output_asset_id;
  end if;

  if target_claim_token is not null and (
    invocation.status <> 'outcome_unknown' or invocation.claim_token <> target_claim_token
  ) then
    return false;
  end if;

  if target_claim_token is null and invocation.status <> 'outcome_unknown' then
    return false;
  end if;

  update public.ai_job_shot_invocations as invocations
  set
    status = 'persisted',
    output_asset_id = target_output_asset_id,
    conditioning_hash = coalesce(nullif(trim(coalesce(target_conditioning_hash, '')), ''), invocations.conditioning_hash),
    provider_model = coalesce(nullif(trim(coalesce(target_provider_model, '')), ''), invocations.provider_model),
    claim_expires_at = null,
    persisted_at = now()
  where invocations.id = invocation.id;

  return true;
end;
$$;

revoke all on function public.claim_ai_job_shot_invocation(uuid, uuid, uuid, text, text, integer, integer, text, text, uuid, integer) from public, anon, authenticated;
revoke all on function public.mark_ai_job_shot_invocation_outcome_unknown(uuid, uuid, uuid, text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.mark_ai_job_shot_invocation_persisted(uuid, uuid, uuid, text, text, integer, integer, text, text, uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.claim_ai_job_shot_invocation(uuid, uuid, uuid, text, text, integer, integer, text, text, uuid, integer) to service_role;
grant execute on function public.mark_ai_job_shot_invocation_outcome_unknown(uuid, uuid, uuid, text, uuid, text, text) to service_role;
grant execute on function public.mark_ai_job_shot_invocation_persisted(uuid, uuid, uuid, text, text, integer, integer, text, text, uuid, uuid, text, text) to service_role;
