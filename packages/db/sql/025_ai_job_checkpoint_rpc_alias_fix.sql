-- Repair ambiguous PL/pgSQL identifiers in the atomic AI job creation RPC.
-- The RETURNS TABLE field `id` is also a PL/pgSQL variable, so every table
-- reference inside the function must be qualified explicitly.

create or replace function public.create_ai_job_with_checkpoint(
  target_project_id uuid,
  target_created_by uuid,
  target_thread_id uuid,
  target_job_type public.ai_job_type,
  target_prompt text,
  target_input_asset_ids uuid[],
  target_idempotency_key text,
  target_target_node_id text,
  target_job_payload jsonb,
  checkpoint_snapshot_json jsonb default null,
  checkpoint_document_hash text default null,
  target_credit_amount integer default 0,
  target_credit_idempotency_key text default null
)
returns table (
  id uuid,
  project_id uuid,
  thread_id uuid,
  status public.ai_job_status,
  job_type public.ai_job_type,
  prompt text,
  input_snapshot_id uuid,
  output_snapshot_id uuid,
  output_asset_ids uuid[],
  provider text,
  error_code text,
  error_message text,
  created_at timestamptz,
  updated_at timestamptz,
  created boolean,
  credit_applied boolean,
  credits_remaining integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  locked_project public.projects%rowtype;
  next_version integer;
  checkpoint_snapshot public.canvas_snapshots%rowtype;
  created_job public.ai_jobs%rowtype;
  current_profile public.profiles%rowtype;
  existing_credit public.credit_ledger%rowtype;
  next_credits integer;
begin
  if auth.role() <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = 'P0001';
  end if;

  if target_created_by is null
    or target_idempotency_key is null
    or char_length(trim(target_idempotency_key)) not between 8 and 128
    or char_length(coalesce(target_prompt, '')) > 12000 then
    raise exception 'INVALID_AI_JOB_INPUT' using errcode = 'P0001';
  end if;

  if target_credit_amount is null
    or target_credit_amount < 0
    or target_credit_amount > 100
    or (target_credit_amount > 0 and (
      target_credit_idempotency_key is null
      or char_length(trim(target_credit_idempotency_key)) not between 8 and 128
    )) then
    raise exception 'INVALID_CREDIT_INPUT' using errcode = 'P0001';
  end if;

  if target_job_type not in ('generate_concept', 'refine_concept') then
    raise exception 'UNSUPPORTED_AI_JOB_TYPE' using errcode = 'P0001';
  end if;

  select *
  into locked_project
  from public.projects as projects
  where projects.id = target_project_id
    and projects.owner_id = target_created_by
  for update;

  if not found then
    raise exception 'PROJECT_NOT_FOUND' using errcode = 'P0001';
  end if;

  -- The project row lock serializes duplicate creates for this project. This
  -- makes job idempotency and credit debit one database transaction.
  select *
  into created_job
  from public.ai_jobs as jobs
  where jobs.project_id = target_project_id
    and jobs.created_by = target_created_by
    and jobs.idempotency_key = trim(target_idempotency_key)
  limit 1;

  if found then
    select credits_amount
    into next_credits
    from public.profiles as profiles
    where profiles.id = target_created_by;

    return query
    select
      created_job.id,
      created_job.project_id,
      created_job.thread_id,
      created_job.status,
      created_job.job_type,
      created_job.prompt,
      created_job.input_snapshot_id,
      created_job.output_snapshot_id,
      created_job.output_asset_ids,
      created_job.provider,
      created_job.error_code,
      created_job.error_message,
      created_job.created_at,
      created_job.updated_at,
      false,
      false,
      next_credits;
    return;
  end if;

  if target_credit_amount > 0 then
    select *
    into existing_credit
    from public.credit_ledger
    where profile_id = target_created_by
      and idempotency_key = trim(target_credit_idempotency_key);

    if found then
      raise exception 'CREDIT_IDEMPOTENCY_INCONSISTENT' using errcode = 'P0001';
    end if;

    select *
    into current_profile
    from public.profiles as profiles
    where profiles.id = target_created_by
    for update;

    if not found then
      raise exception 'PROFILE_NOT_FOUND' using errcode = 'P0001';
    end if;

    if current_profile.credits_amount < target_credit_amount then
      raise exception 'INSUFFICIENT_CREDITS' using errcode = 'P0001';
    end if;

    next_credits := current_profile.credits_amount - target_credit_amount;
    update public.profiles as profiles
    set credits_amount = next_credits
    where profiles.id = target_created_by;

    insert into public.credit_ledger (
      profile_id,
      amount,
      balance_after,
      reason,
      idempotency_key
    )
    values (
      target_created_by,
      -target_credit_amount,
      next_credits,
      'generation',
      trim(target_credit_idempotency_key)
    );
  end if;

  if target_thread_id is not null and not exists (
    select 1
    from public.chat_threads as threads
    where threads.id = target_thread_id
      and threads.project_id = target_project_id
  ) then
    raise exception 'CHAT_THREAD_NOT_FOUND' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from unnest(coalesce(target_input_asset_ids, '{}'::uuid[])) as requested_asset(id)
    where not exists (
      select 1
      from public.assets as assets
      where assets.id = requested_asset.id
        and assets.owner_id = target_created_by
        and assets.project_id = target_project_id
    )
    and not exists (
      select 1
      from public.library_assets as library_assets
      where library_assets.id = requested_asset.id
        and library_assets.owner_id = target_created_by
    )
  ) then
    raise exception 'INPUT_ASSET_NOT_FOUND' using errcode = 'P0001';
  end if;

  if checkpoint_snapshot_json is not null then
    select coalesce(max(canvas_snapshots.version), 0) + 1
    into next_version
    from public.canvas_snapshots
    where canvas_snapshots.project_id = target_project_id;

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
      checkpoint_snapshot_json,
      target_created_by,
      'job_checkpoint',
      false,
      checkpoint_document_hash
    )
    returning * into checkpoint_snapshot;
  elsif locked_project.current_canvas_snapshot_id is not null then
    select *
    into checkpoint_snapshot
    from public.canvas_snapshots as snapshots
    where snapshots.id = locked_project.current_canvas_snapshot_id
      and snapshots.project_id = target_project_id;
  end if;

  if checkpoint_snapshot.id is null then
    raise exception 'SNAPSHOT_NOT_FOUND' using errcode = 'P0001';
  end if;

  insert into public.ai_jobs (
    project_id,
    thread_id,
    created_by,
    status,
    job_type,
    prompt,
    input_snapshot_id,
    input_asset_ids,
    idempotency_key,
    target_node_id,
    job_payload
  )
  values (
    target_project_id,
    target_thread_id,
    target_created_by,
    'queued',
    target_job_type,
    target_prompt,
    checkpoint_snapshot.id,
    coalesce(target_input_asset_ids, '{}'::uuid[]),
    trim(target_idempotency_key),
    target_target_node_id,
    coalesce(target_job_payload, '{}'::jsonb)
  )
  returning * into created_job;

  delete from public.canvas_snapshots as snapshots
  where snapshots.project_id = target_project_id
    and snapshots.snapshot_kind = 'job_checkpoint'
    and snapshots.id in (
      select stale_snapshots.id
      from public.canvas_snapshots as stale_snapshots
      where stale_snapshots.project_id = target_project_id
        and stale_snapshots.snapshot_kind = 'job_checkpoint'
      order by stale_snapshots.created_at desc, stale_snapshots.id desc
      offset 20
    );

  return query
  select
    created_job.id,
    created_job.project_id,
    created_job.thread_id,
    created_job.status,
    created_job.job_type,
    created_job.prompt,
    created_job.input_snapshot_id,
    created_job.output_snapshot_id,
    created_job.output_asset_ids,
    created_job.provider,
    created_job.error_code,
    created_job.error_message,
    created_job.created_at,
    created_job.updated_at,
    true,
    target_credit_amount > 0,
    next_credits;
end;
$$;

revoke all on function public.create_ai_job_with_checkpoint(
  uuid, uuid, uuid, public.ai_job_type, text, uuid[], text, text, jsonb, jsonb, text, integer, text
) from public, anon, authenticated;
grant execute on function public.create_ai_job_with_checkpoint(
  uuid, uuid, uuid, public.ai_job_type, text, uuid[], text, text, jsonb, jsonb, text, integer, text
) to service_role;
