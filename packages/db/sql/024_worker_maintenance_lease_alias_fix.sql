-- PostgreSQL requires the INSERT target alias inside ON CONFLICT ... DO UPDATE.
-- Migration 023 created the lease table correctly but used its qualified table
-- name in this predicate, making every lease claim fail with SQLSTATE 42P01.

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
  where leases.expires_at <= now()
    or leases.holder_id = excluded.holder_id;

  return found;
end;
$$;

revoke all on function public.claim_worker_maintenance_lease(text, text, integer) from public, anon, authenticated;
grant execute on function public.claim_worker_maintenance_lease(text, text, integer) to service_role;
