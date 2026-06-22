alter table public.ai_jobs
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists input_snapshot_id uuid references public.canvas_snapshots(id) on delete set null,
  add column if not exists output_snapshot_id uuid references public.canvas_snapshots(id) on delete set null,
  add column if not exists job_payload jsonb not null default '{}'::jsonb,
  add column if not exists job_result jsonb not null default '{}'::jsonb;

create index if not exists ai_jobs_project_id_snapshot_idx
  on public.ai_jobs(project_id, input_snapshot_id);

drop policy if exists "ai_jobs_project_owner_update" on public.ai_jobs;
create policy "ai_jobs_project_owner_update"
on public.ai_jobs for update
using (public.is_project_owner(project_id))
with check (public.is_project_owner(project_id));
