-- Project deletion is a destructive, user-triggered operation. Keep its
-- distributed per-user limiter in the same allowlist as other BFF routes.

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

  if p_scope not in (
    'ai-job',
    'chat',
    'library-upload',
    'project-create',
    'project-delete',
    'project-draft-finalize',
    'project-draft-save',
    'prompt-enhance',
    'snapshot-asset-upload'
  )
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
