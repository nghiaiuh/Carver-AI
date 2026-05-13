create extension if not exists "pgcrypto";

do $$
begin
  create type public.plan_type as enum ('free', 'premium');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.project_status as enum ('active', 'archived', 'deleted');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.asset_kind as enum ('upload', 'generated', 'reference', 'export');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.chat_role as enum ('user', 'assistant', 'system', 'tool');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.ai_job_status as enum ('queued', 'running', 'succeeded', 'failed', 'cancelled');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.ai_job_type as enum ('generate_concept', 'refine_concept', 'analyze_reference', 'export');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.export_format as enum ('png', 'jpg', 'pdf');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.export_status as enum ('queued', 'running', 'succeeded', 'failed');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  plan_type public.plan_type not null default 'free',
  credits_amount integer not null default 30 check (credits_amount >= 0),
  onboarding jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  status public.project_status not null default 'active',
  current_canvas_snapshot_id uuid,
  landscape_goal text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.landscape_briefs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  property_type text,
  location_text text,
  climate_zone text,
  yard_dimensions text,
  sun_shade text,
  soil_drainage text,
  budget_range text,
  style_preferences text[],
  must_keep_items text[],
  avoid_items text[],
  notes jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.canvas_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  version integer not null check (version > 0),
  canvas_json jsonb not null default '{}'::jsonb,
  thumbnail_asset_id uuid,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (project_id, version)
);

alter table public.projects
  drop constraint if exists projects_current_canvas_snapshot_id_fkey;

alter table public.projects
  add constraint projects_current_canvas_snapshot_id_fkey
  foreign key (current_canvas_snapshot_id)
  references public.canvas_snapshots(id)
  on delete set null;

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind public.asset_kind not null,
  storage_bucket text not null,
  storage_path text not null,
  mime_type text,
  width integer,
  height integer,
  size_bytes bigint,
  source_job_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (storage_bucket, storage_path)
);

alter table public.canvas_snapshots
  drop constraint if exists canvas_snapshots_thumbnail_asset_id_fkey;

alter table public.canvas_snapshots
  add constraint canvas_snapshots_thumbnail_asset_id_fkey
  foreign key (thumbnail_asset_id)
  references public.assets(id)
  on delete set null;

create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null default 'Landscape design chat',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  role public.chat_role not null,
  content text not null,
  referenced_asset_ids uuid[],
  referenced_canvas_object_ids jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  thread_id uuid references public.chat_threads(id) on delete set null,
  status public.ai_job_status not null default 'queued',
  job_type public.ai_job_type not null,
  prompt text,
  input_asset_ids uuid[],
  output_asset_ids uuid[],
  provider text,
  provider_job_id text,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.assets
  drop constraint if exists assets_source_job_id_fkey;

alter table public.assets
  add constraint assets_source_job_id_fkey
  foreign key (source_job_id)
  references public.ai_jobs(id)
  on delete set null;

create table if not exists public.design_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  source_snapshot_id uuid references public.canvas_snapshots(id) on delete set null,
  output_snapshot_id uuid references public.canvas_snapshots(id) on delete set null,
  source_job_id uuid references public.ai_jobs(id) on delete set null,
  label text,
  notes text,
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.exports (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  asset_id uuid references public.assets(id) on delete set null,
  format public.export_format not null,
  resolution text,
  status public.export_status not null default 'queued',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists projects_owner_id_idx on public.projects(owner_id);
create index if not exists canvas_snapshots_project_id_version_idx on public.canvas_snapshots(project_id, version desc);
create index if not exists assets_project_id_idx on public.assets(project_id);
create index if not exists chat_threads_project_id_idx on public.chat_threads(project_id);
create index if not exists chat_messages_thread_id_created_at_idx on public.chat_messages(thread_id, created_at);
create index if not exists ai_jobs_project_id_status_idx on public.ai_jobs(project_id, status);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_updated_at();

drop trigger if exists landscape_briefs_set_updated_at on public.landscape_briefs;
create trigger landscape_briefs_set_updated_at
before update on public.landscape_briefs
for each row execute function public.set_updated_at();

drop trigger if exists assets_set_updated_at on public.assets;
create trigger assets_set_updated_at
before update on public.assets
for each row execute function public.set_updated_at();

drop trigger if exists chat_threads_set_updated_at on public.chat_threads;
create trigger chat_threads_set_updated_at
before update on public.chat_threads
for each row execute function public.set_updated_at();

drop trigger if exists ai_jobs_set_updated_at on public.ai_jobs;
create trigger ai_jobs_set_updated_at
before update on public.ai_jobs
for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public)
values
  ('project-uploads', 'project-uploads', false),
  ('generated-assets', 'generated-assets', false),
  ('exports', 'exports', false)
on conflict (id) do update set public = excluded.public;
