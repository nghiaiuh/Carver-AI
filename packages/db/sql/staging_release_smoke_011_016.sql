-- Read-only release smoke check for migrations 011 through 016.
--
-- Run this in the Supabase SQL Editor for STAGING only, after applying the
-- migration order documented in README.md. It queries PostgreSQL catalogs and
-- raises one error listing every missing or weakened security artifact.
-- It does not create, update, or delete application data.

do $$
declare
  missing text[] := array[]::text[];
  table_name text;
  constraint_name text;
  trigger_name text;
  policy_name text;
  function_signature text;
  rate_limit_function_definition text;
begin
  foreach table_name in array array[
    'projects',
    'canvas_snapshots',
    'assets',
    'chat_threads',
    'chat_messages',
    'ai_jobs',
    'library_folders',
    'library_assets',
    'project_canvas_drafts',
    'credit_ledger',
    'api_rate_limits'
  ] loop
    if to_regclass('public.' || table_name) is null then
      missing := array_append(missing, 'missing table public.' || table_name);
    elsif not exists (
      select 1
      from pg_class as tables
      join pg_namespace as schemas on schemas.oid = tables.relnamespace
      where schemas.nspname = 'public'
        and tables.relname = table_name
        and tables.relrowsecurity
    ) then
      missing := array_append(missing, 'RLS is disabled on public.' || table_name);
    end if;
  end loop;

  foreach constraint_name in array array[
    'ai_jobs_created_by_required',
    'assets_owner_id_required',
    'canvas_snapshots_created_by_required'
  ] loop
    if not exists (
      select 1
      from pg_constraint as constraints
      where constraints.conname = constraint_name
        and constraints.convalidated
    ) then
      missing := array_append(missing, 'missing or unvalidated constraint ' || constraint_name);
    end if;
  end loop;

  if not exists (
    select 1
    from pg_trigger as triggers
    where triggers.tgname = 'create_profile_for_auth_user'
      and triggers.tgrelid = 'auth.users'::regclass
      and not triggers.tgisinternal
      and triggers.tgenabled <> 'D'
  ) then
    missing := array_append(missing, 'missing or disabled auth.users create_profile_for_auth_user trigger');
  end if;

  foreach trigger_name in array array[
    'assets_enforce_integrity',
    'library_assets_enforce_integrity',
    'project_canvas_drafts_enforce_integrity'
  ] loop
    if not exists (
      select 1
      from pg_trigger as triggers
      where triggers.tgname = trigger_name
        and triggers.tgrelid = case trigger_name
          when 'assets_enforce_integrity' then 'public.assets'::regclass
          when 'library_assets_enforce_integrity' then 'public.library_assets'::regclass
          else 'public.project_canvas_drafts'::regclass
        end
        and not triggers.tgisinternal
        and triggers.tgenabled <> 'D'
    ) then
      missing := array_append(missing, 'missing or disabled trigger ' || trigger_name);
    end if;
  end loop;

  foreach policy_name in array array[
    'projects_owner_all',
    'canvas_snapshots_project_owner_all',
    'assets_project_owner_all',
    'chat_threads_project_owner_all',
    'chat_messages_project_owner_all',
    'ai_jobs_project_owner_select',
    'library_folders_owner_all',
    'library_assets_owner_all',
    'project_canvas_drafts_project_owner_all',
    'credit_ledger_select_own'
  ] loop
    if not exists (
      select 1
      from pg_policies as policies
      where policies.schemaname = 'public'
        and policies.policyname = policy_name
        and policies.tablename = case policy_name
          when 'projects_owner_all' then 'projects'
          when 'canvas_snapshots_project_owner_all' then 'canvas_snapshots'
          when 'assets_project_owner_all' then 'assets'
          when 'chat_threads_project_owner_all' then 'chat_threads'
          when 'chat_messages_project_owner_all' then 'chat_messages'
          when 'ai_jobs_project_owner_select' then 'ai_jobs'
          when 'library_folders_owner_all' then 'library_folders'
          when 'library_assets_owner_all' then 'library_assets'
          when 'project_canvas_drafts_project_owner_all' then 'project_canvas_drafts'
          else 'credit_ledger'
        end
    ) then
      missing := array_append(missing, 'missing RLS policy ' || policy_name);
    end if;
  end loop;

  foreach function_signature in array array[
    'public.create_profile_for_auth_user()',
    'public.consume_profile_credits(integer,text,text)',
    'public.restore_profile_credits(uuid,integer,text,text)',
    'public.consume_api_rate_limit(text,integer,integer)',
    'public.enforce_project_asset_integrity()',
    'public.enforce_library_asset_integrity()',
    'public.create_project_workspace(text,text,text,jsonb,text)',
    'public.enforce_project_canvas_draft_integrity()',
    'public.is_project_owner(uuid)',
    'public.is_library_folder_owner(uuid)'
  ] loop
    if to_regprocedure(function_signature) is null then
      missing := array_append(missing, 'missing function ' || function_signature);
    end if;
  end loop;

  if not exists (
    select 1
    from pg_proc as functions
    join pg_namespace as schemas on schemas.oid = functions.pronamespace
    where schemas.nspname = 'public'
      and functions.proname = 'create_ai_job_with_checkpoint'
      and functions.pronargs = 13
      and functions.prosecdef
  ) then
    missing := array_append(missing, 'missing security-definer create_ai_job_with_checkpoint RPC');
  end if;

  if has_table_privilege('authenticated', 'public.ai_jobs', 'insert')
    or has_table_privilege('authenticated', 'public.ai_jobs', 'update')
    or has_table_privilege('authenticated', 'public.ai_jobs', 'delete') then
    missing := array_append(missing, 'authenticated still has direct ai_jobs write privilege');
  end if;

  if has_table_privilege('authenticated', 'public.credit_ledger', 'insert')
    or has_table_privilege('authenticated', 'public.credit_ledger', 'update')
    or has_table_privilege('authenticated', 'public.credit_ledger', 'delete') then
    missing := array_append(missing, 'authenticated still has direct credit_ledger write privilege');
  end if;

  if has_table_privilege('authenticated', 'public.api_rate_limits', 'select')
    or has_table_privilege('authenticated', 'public.api_rate_limits', 'insert')
    or has_table_privilege('authenticated', 'public.api_rate_limits', 'update')
    or has_table_privilege('authenticated', 'public.api_rate_limits', 'delete') then
    missing := array_append(missing, 'authenticated still has direct api_rate_limits table privilege');
  end if;

  select pg_get_functiondef('public.consume_api_rate_limit(text,integer,integer)'::regprocedure)
  into rate_limit_function_definition;

  foreach table_name in array array[
    'ai-job',
    'chat',
    'library-upload',
    'project-create',
    'project-draft-finalize',
    'project-draft-save',
    'prompt-enhance',
    'snapshot-asset-upload'
  ] loop
    if position(quote_literal(table_name) in rate_limit_function_definition) = 0 then
      missing := array_append(missing, 'rate-limit allowlist is missing scope ' || table_name);
    end if;
  end loop;

  if array_length(missing, 1) is not null then
    raise exception 'Release smoke check for migrations 011-016 failed: %', array_to_string(missing, '; ');
  end if;
end;
$$;

select
  true as passed,
  now() as checked_at,
  'Migrations 011-016 schema, RLS, grants, triggers, constraints, RPCs, and rate-limit scopes are present.' as summary;
