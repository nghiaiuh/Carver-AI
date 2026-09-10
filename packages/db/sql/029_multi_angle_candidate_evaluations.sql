-- Deterministic evaluator receipts for every durable multi-angle candidate.
-- Candidate bytes remain in private R2 assets; this table stores only safe
-- score metadata needed to reproduce a winner or diagnose a hard gate.

create table if not exists public.ai_job_shot_candidate_evaluations (
  id uuid primary key default gen_random_uuid(),
  ai_job_id uuid not null references public.ai_jobs(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  shot_id text not null check (char_length(shot_id) between 1 and 200),
  shot_order integer not null check (shot_order >= 0),
  candidate_id text not null check (char_length(candidate_id) between 1 and 200),
  candidate_index integer not null check (candidate_index between 0 and 3),
  asset_id uuid not null references public.assets(id) on delete cascade,
  evaluator_version text not null check (char_length(evaluator_version) between 1 and 200),
  decision text not null check (decision in ('accept', 'reject', 'needs_review')),
  composite_score double precision check (composite_score is null or (composite_score >= 0 and composite_score <= 1)),
  hard_gate_failures jsonb not null default '[]'::jsonb check (jsonb_typeof(hard_gate_failures) = 'array'),
  metrics jsonb not null default '[]'::jsonb check (jsonb_typeof(metrics) = 'array'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ai_job_id, candidate_id),
  unique (ai_job_id, shot_id, candidate_index)
);

create index if not exists ai_job_shot_candidate_evaluations_job_shot_idx
  on public.ai_job_shot_candidate_evaluations (ai_job_id, shot_order, candidate_index);

alter table public.ai_job_shot_candidate_evaluations enable row level security;
revoke all on table public.ai_job_shot_candidate_evaluations from public, anon;
revoke insert, update, delete on table public.ai_job_shot_candidate_evaluations from authenticated;
grant select on table public.ai_job_shot_candidate_evaluations to authenticated;
grant select, insert, update, delete on table public.ai_job_shot_candidate_evaluations to service_role;

drop policy if exists "ai_job_shot_candidate_evaluations_project_owner_select" on public.ai_job_shot_candidate_evaluations;
create policy "ai_job_shot_candidate_evaluations_project_owner_select"
  on public.ai_job_shot_candidate_evaluations
  for select
  using (owner_id = auth.uid() and public.is_project_owner(project_id));

drop trigger if exists ai_job_shot_candidate_evaluations_set_updated_at on public.ai_job_shot_candidate_evaluations;
create trigger ai_job_shot_candidate_evaluations_set_updated_at
before update on public.ai_job_shot_candidate_evaluations
for each row
execute function public.set_updated_at();
