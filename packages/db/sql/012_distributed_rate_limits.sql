-- Distributed, per-user API rate limits. This replaces process-local Maps so
-- limits remain effective across Vercel instances and worker restarts.

create table if not exists public.api_rate_limits (
  subject_id uuid not null references auth.users(id) on delete cascade,
  scope text not null check (scope ~ '^[a-z0-9:_-]{1,96}$'),
  window_started_at timestamptz not null,
  request_count integer not null check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (subject_id, scope)
);

alter table public.api_rate_limits enable row level security;
revoke all on table public.api_rate_limits from anon, authenticated;

create or replace function public.consume_api_rate_limit(
  p_scope text,
  p_limit integer,
  p_window_seconds integer
)
returns table (allowed boolean, reset_at timestamptz, remaining integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  rate_row public.api_rate_limits%rowtype;
  window_start timestamptz;
begin
  if auth.uid() is null then
    raise exception 'AUTH_REQUIRED' using errcode = 'P0001';
  end if;

  if p_scope is null or p_scope !~ '^[a-z0-9:_-]{1,96}$'
    or p_limit is null or p_limit < 1 or p_limit > 1000
    or p_window_seconds is null or p_window_seconds < 1 or p_window_seconds > 86400 then
    raise exception 'INVALID_RATE_LIMIT_INPUT' using errcode = 'P0001';
  end if;

  window_start := now() - make_interval(secs => p_window_seconds);

  insert into public.api_rate_limits as limits (
    subject_id,
    scope,
    window_started_at,
    request_count,
    updated_at
  )
  values (auth.uid(), p_scope, now(), 1, now())
  on conflict (subject_id, scope) do update
  set
    window_started_at = case
      when limits.window_started_at <= window_start then now()
      else limits.window_started_at
    end,
    request_count = case
      when limits.window_started_at <= window_start then 1
      else limits.request_count + 1
    end,
    updated_at = now()
  returning * into rate_row;

  return query
  select
    rate_row.request_count <= p_limit,
    rate_row.window_started_at + make_interval(secs => p_window_seconds),
    greatest(p_limit - rate_row.request_count, 0);
end;
$$;

revoke all on function public.consume_api_rate_limit(text, integer, integer) from public, anon;
grant execute on function public.consume_api_rate_limit(text, integer, integer) to authenticated;
