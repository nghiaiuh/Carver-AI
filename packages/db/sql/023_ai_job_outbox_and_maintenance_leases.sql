-- Durable queue dispatch and maintenance-worker coordination.
--
-- Creating an AI job, its checkpoint, credit debit, and an outbox record must
-- commit together. Redis is intentionally outside this transaction: a worker
-- dispatches the outbox record later and retries without losing the DB command.

create table if not exists public.ai_job_outbox (
  id uuid primary key default gen_random_uuid(),
  ai_job_id uuid not null unique references public.ai_jobs(id) on delete cascade,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'dispatching', 'dispatched')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_by text,
  locked_at timestamptz,
  dispatched_at timestamptz,
  bull_job_id text,
  last_error_code text,
  last_error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_job_outbox_dispatchable_idx
  on public.ai_job_outbox (available_at asc, created_at asc)
  where status in ('pending', 'dispatching');

alter table public.ai_job_outbox enable row level security;
revoke all on table public.ai_job_outbox from public, anon, authenticated;
grant select, insert, update, delete on table public.ai_job_outbox to service_role;

create or replace function public.enqueue_ai_job_outbox()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'queued' then
    insert into public.ai_job_outbox (ai_job_id, payload)
    values (
      new.id,
      jsonb_build_object('jobId', new.id::text)
    )
    on conflict (ai_job_id) do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists ai_jobs_enqueue_outbox on public.ai_jobs;
create trigger ai_jobs_enqueue_outbox
after insert on public.ai_jobs
for each row
execute function public.enqueue_ai_job_outbox();

-- Backfill queued jobs created before this migration. This is safe because the
-- BullMQ job id is deterministic (`ai_jobs.id`) and duplicate adds are reused.
insert into public.ai_job_outbox (ai_job_id, payload)
select jobs.id, jsonb_build_object('jobId', jobs.id::text)
from public.ai_jobs as jobs
where jobs.status = 'queued'
on conflict (ai_job_id) do nothing;

create or replace function public.claim_ai_job_outbox(
  target_dispatcher_id text,
  target_batch_size integer default 20,
  target_lease_seconds integer default 60
)
returns table (
  id uuid,
  ai_job_id uuid,
  payload jsonb,
  attempts integer
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = 'P0001';
  end if;

  if char_length(trim(coalesce(target_dispatcher_id, ''))) not between 8 and 200
    or target_batch_size not between 1 and 100
    or target_lease_seconds not between 10 and 600 then
    raise exception 'INVALID_OUTBOX_CLAIM_INPUT' using errcode = 'P0001';
  end if;

  return query
  with candidates as (
    select outbox.id
    from public.ai_job_outbox as outbox
    where outbox.available_at <= now()
      and (
        outbox.status = 'pending'
        or (outbox.status = 'dispatching' and outbox.locked_at <= now() - make_interval(secs => target_lease_seconds))
      )
    order by outbox.available_at asc, outbox.created_at asc
    limit target_batch_size
    for update skip locked
  ), claimed as (
    update public.ai_job_outbox as outbox
    set
      status = 'dispatching',
      locked_by = trim(target_dispatcher_id),
      locked_at = now(),
      updated_at = now()
    from candidates
    where outbox.id = candidates.id
    returning outbox.id, outbox.ai_job_id, outbox.payload, outbox.attempts
  )
  select claimed.id, claimed.ai_job_id, claimed.payload, claimed.attempts
  from claimed;
end;
$$;

create or replace function public.mark_ai_job_outbox_dispatched(
  target_outbox_id uuid,
  target_dispatcher_id text,
  target_bull_job_id text
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

  if target_outbox_id is null
    or char_length(trim(coalesce(target_dispatcher_id, ''))) not between 8 and 200
    or char_length(trim(coalesce(target_bull_job_id, ''))) not between 1 and 200 then
    raise exception 'INVALID_OUTBOX_DISPATCH_INPUT' using errcode = 'P0001';
  end if;

  update public.ai_job_outbox
  set
    status = 'dispatched',
    locked_by = null,
    locked_at = null,
    dispatched_at = now(),
    bull_job_id = trim(target_bull_job_id),
    last_error_code = null,
    last_error_message = null,
    updated_at = now()
  where id = target_outbox_id
    and status = 'dispatching'
    and locked_by = trim(target_dispatcher_id);

  return found;
end;
$$;

create or replace function public.release_ai_job_outbox_for_retry(
  target_outbox_id uuid,
  target_dispatcher_id text,
  target_error_code text,
  target_error_message text,
  target_retry_after_seconds integer
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

  if target_outbox_id is null
    or char_length(trim(coalesce(target_dispatcher_id, ''))) not between 8 and 200
    or char_length(trim(coalesce(target_error_code, ''))) not between 1 and 100
    or char_length(trim(coalesce(target_error_message, ''))) not between 1 and 1000
    or target_retry_after_seconds not between 1 and 3600 then
    raise exception 'INVALID_OUTBOX_RETRY_INPUT' using errcode = 'P0001';
  end if;

  update public.ai_job_outbox
  set
    status = 'pending',
    attempts = attempts + 1,
    available_at = now() + make_interval(secs => target_retry_after_seconds),
    locked_by = null,
    locked_at = null,
    last_error_code = trim(target_error_code),
    last_error_message = trim(target_error_message),
    updated_at = now()
  where id = target_outbox_id
    and status = 'dispatching'
    and locked_by = trim(target_dispatcher_id);

  return found;
end;
$$;

revoke all on function public.claim_ai_job_outbox(text, integer, integer) from public, anon, authenticated;
revoke all on function public.mark_ai_job_outbox_dispatched(uuid, text, text) from public, anon, authenticated;
revoke all on function public.release_ai_job_outbox_for_retry(uuid, text, text, text, integer) from public, anon, authenticated;
grant execute on function public.claim_ai_job_outbox(text, integer, integer) to service_role;
grant execute on function public.mark_ai_job_outbox_dispatched(uuid, text, text) to service_role;
grant execute on function public.release_ai_job_outbox_for_retry(uuid, text, text, text, integer) to service_role;

-- A dedicated maintenance deployment is preferred in production. The lease
-- keeps scheduled cleanup/reconciliation single-writer even if a deployment
-- overlaps or an operator accidentally runs multiple maintenance replicas.
create table if not exists public.worker_maintenance_leases (
  task_name text primary key check (char_length(task_name) between 1 and 100),
  holder_id text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.worker_maintenance_leases enable row level security;
revoke all on table public.worker_maintenance_leases from public, anon, authenticated;
grant select, insert, update, delete on table public.worker_maintenance_leases to service_role;

create or replace function public.claim_worker_maintenance_lease(
  target_task_name text,
  target_holder_id text,
  target_lease_seconds integer default 120
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

  if char_length(trim(coalesce(target_task_name, ''))) not between 1 and 100
    or char_length(trim(coalesce(target_holder_id, ''))) not between 8 and 200
    or target_lease_seconds not between 15 and 3600 then
    raise exception 'INVALID_MAINTENANCE_LEASE_INPUT' using errcode = 'P0001';
  end if;

  insert into public.worker_maintenance_leases as leases (
    task_name,
    holder_id,
    expires_at,
    updated_at
  )
  values (
    trim(target_task_name),
    trim(target_holder_id),
    now() + make_interval(secs => target_lease_seconds),
    now()
  )
  on conflict (task_name) do update
  set
    holder_id = excluded.holder_id,
    expires_at = excluded.expires_at,
    updated_at = now()
  where public.worker_maintenance_leases.expires_at <= now()
    or public.worker_maintenance_leases.holder_id = excluded.holder_id;

  return found;
end;
$$;

create or replace function public.release_worker_maintenance_lease(
  target_task_name text,
  target_holder_id text
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

  delete from public.worker_maintenance_leases
  where task_name = trim(coalesce(target_task_name, ''))
    and holder_id = trim(coalesce(target_holder_id, ''));

  return found;
end;
$$;

revoke all on function public.claim_worker_maintenance_lease(text, text, integer) from public, anon, authenticated;
revoke all on function public.release_worker_maintenance_lease(text, text) from public, anon, authenticated;
grant execute on function public.claim_worker_maintenance_lease(text, text, integer) to service_role;
grant execute on function public.release_worker_maintenance_lease(text, text) to service_role;
