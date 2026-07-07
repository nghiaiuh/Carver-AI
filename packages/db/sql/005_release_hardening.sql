-- Release hardening for tenant isolation, idempotent AI jobs, and production query paths.
-- Apply after 004_canvas_snapshot_rpc.sql.

-- Some deployed databases may have 001/002 applied without the later ai_jobs v2
-- shape. Create every column this migration depends on before building indexes
-- or policies that reference those columns.
alter table public.ai_jobs
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists input_snapshot_id uuid references public.canvas_snapshots(id) on delete set null,
  add column if not exists output_snapshot_id uuid references public.canvas_snapshots(id) on delete set null,
  add column if not exists job_payload jsonb not null default '{}'::jsonb,
  add column if not exists job_result jsonb not null default '{}'::jsonb,
  add column if not exists idempotency_key text,
  add column if not exists target_node_id text;

-- Query-performance and tenant-isolation indexes.
create index if not exists projects_owner_id_id_idx
  on public.projects (owner_id, id);

create index if not exists assets_owner_id_project_id_id_idx
  on public.assets (owner_id, project_id, id);

create index if not exists canvas_snapshots_project_id_version_desc_idx
  on public.canvas_snapshots (project_id, version desc);

create index if not exists ai_jobs_project_created_by_status_created_at_desc_idx
  on public.ai_jobs (project_id, created_by, status, created_at desc);

create index if not exists chat_messages_project_thread_created_at_idx
  on public.chat_messages (project_id, thread_id, created_at);

create index if not exists library_assets_owner_folder_created_at_desc_idx
  on public.library_assets (owner_id, folder_id, created_at desc);

create unique index if not exists ai_jobs_created_by_project_id_idempotency_key_idx
  on public.ai_jobs (created_by, project_id, idempotency_key)
  where idempotency_key is not null;

-- Enforce release-path ownership for new rows without rewriting legacy data.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'ai_jobs_created_by_required'
      and conrelid = 'public.ai_jobs'::regclass
  ) then
    alter table public.ai_jobs
      add constraint ai_jobs_created_by_required
      check (created_by is not null) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'assets_owner_id_required'
      and conrelid = 'public.assets'::regclass
  ) then
    alter table public.assets
      add constraint assets_owner_id_required
      check (owner_id is not null) not valid;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'canvas_snapshots_created_by_required'
      and conrelid = 'public.canvas_snapshots'::regclass
  ) then
    alter table public.canvas_snapshots
      add constraint canvas_snapshots_created_by_required
      check (created_by is not null) not valid;
  end if;
end $$;

-- Tighten ai_jobs RLS insert policy: a user can only insert jobs for owned projects
-- and must stamp created_by as auth.uid().
drop policy if exists "ai_jobs_insert_project_owner" on public.ai_jobs;

create policy "ai_jobs_insert_project_owner"
  on public.ai_jobs
  for insert
  with check (
    created_by = auth.uid()
    and public.is_project_owner(project_id)
  );
