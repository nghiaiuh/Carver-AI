alter table public.ai_jobs
  add column if not exists bull_job_id text,
  add column if not exists last_error_code text,
  add column if not exists last_error_message text,
  add column if not exists last_attempt_at timestamptz;

create index if not exists ai_jobs_status_bull_job_id_idx
  on public.ai_jobs (status, bull_job_id);
