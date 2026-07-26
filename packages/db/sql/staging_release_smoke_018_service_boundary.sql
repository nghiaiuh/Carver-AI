-- Read-only smoke check for migrations 017 and 018.
-- Run in the Supabase STAGING SQL Editor after both migrations.

do $$
declare
  missing text[] := array[]::text[];
  function_signature text;
  draft_trigger_definition text;
begin
  foreach function_signature in array array[
    'public.save_project_canvas_snapshot(uuid,uuid,jsonb,text,text)',
    'public.upsert_project_canvas_draft(uuid,uuid,integer,jsonb,text,text,uuid)',
    'public.finalize_project_canvas_draft(uuid,uuid,integer,text)'
  ] loop
    if to_regprocedure(function_signature) is null then
      missing := array_append(missing, 'missing service-boundary RPC ' || function_signature);
    elsif not exists (
      select 1
      from pg_proc as functions
      where functions.oid = to_regprocedure(function_signature)
        and functions.prosecdef
    ) then
      missing := array_append(missing, 'RPC is not security definer: ' || function_signature);
    elsif has_function_privilege('authenticated', function_signature, 'execute')
      or has_function_privilege('anon', function_signature, 'execute') then
      missing := array_append(missing, 'browser role can execute: ' || function_signature);
    elsif not has_function_privilege('service_role', function_signature, 'execute') then
      missing := array_append(missing, 'service_role cannot execute: ' || function_signature);
    end if;
  end loop;

  if to_regprocedure('public.save_project_canvas_snapshot(uuid,jsonb)') is not null
    or to_regprocedure('public.save_project_canvas_snapshot(uuid,jsonb,text,text)') is not null
    or to_regprocedure('public.upsert_project_canvas_draft(uuid,integer,jsonb,text,text,uuid)') is not null
    or to_regprocedure('public.finalize_project_canvas_draft(uuid,integer,text)') is not null then
    missing := array_append(missing, 'legacy user-callable draft/snapshot RPC signature still exists');
  end if;

  select pg_get_functiondef('public.enforce_project_canvas_draft_integrity()'::regprocedure)
  into draft_trigger_definition;
  if position('auth.role() = ''service_role''' in draft_trigger_definition) = 0
    or position('owner_id = new.owner_id' in draft_trigger_definition) = 0 then
    missing := array_append(missing, 'draft integrity trigger does not validate service-role writes against the project owner');
  end if;

  if array_length(missing, 1) is not null then
    raise exception 'Release smoke check for migrations 017-018 failed: %', array_to_string(missing, '; ');
  end if;
end;
$$;

select
  true as passed,
  now() as checked_at,
  'Draft and snapshot RPCs are service-role-only and service-role draft writes preserve project ownership.' as summary;
