alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.landscape_briefs enable row level security;
alter table public.canvas_snapshots enable row level security;
alter table public.assets enable row level security;
alter table public.chat_threads enable row level security;
alter table public.chat_messages enable row level security;
alter table public.ai_jobs enable row level security;
alter table public.design_versions enable row level security;
alter table public.exports enable row level security;

create or replace function public.is_project_owner(target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.projects
    where id = target_project_id
      and owner_id = auth.uid()
  );
$$;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own"
on public.profiles for select
using (id = auth.uid());

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
on public.profiles for insert
with check (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
on public.profiles for update
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "projects_owner_all" on public.projects;
create policy "projects_owner_all"
on public.projects for all
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "landscape_briefs_project_owner_all" on public.landscape_briefs;
create policy "landscape_briefs_project_owner_all"
on public.landscape_briefs for all
using (public.is_project_owner(project_id))
with check (public.is_project_owner(project_id));

drop policy if exists "canvas_snapshots_project_owner_all" on public.canvas_snapshots;
create policy "canvas_snapshots_project_owner_all"
on public.canvas_snapshots for all
using (public.is_project_owner(project_id))
with check (public.is_project_owner(project_id) and created_by = auth.uid());

drop policy if exists "assets_project_owner_all" on public.assets;
create policy "assets_project_owner_all"
on public.assets for all
using (owner_id = auth.uid() and public.is_project_owner(project_id))
with check (owner_id = auth.uid() and public.is_project_owner(project_id));

drop policy if exists "chat_threads_project_owner_all" on public.chat_threads;
create policy "chat_threads_project_owner_all"
on public.chat_threads for all
using (public.is_project_owner(project_id))
with check (public.is_project_owner(project_id));

drop policy if exists "chat_messages_project_owner_all" on public.chat_messages;
create policy "chat_messages_project_owner_all"
on public.chat_messages for all
using (public.is_project_owner(project_id))
with check (public.is_project_owner(project_id));

drop policy if exists "ai_jobs_project_owner_select" on public.ai_jobs;
create policy "ai_jobs_project_owner_select"
on public.ai_jobs for select
using (public.is_project_owner(project_id));

drop policy if exists "ai_jobs_project_owner_insert" on public.ai_jobs;
create policy "ai_jobs_project_owner_insert"
on public.ai_jobs for insert
with check (public.is_project_owner(project_id));

drop policy if exists "design_versions_project_owner_all" on public.design_versions;
create policy "design_versions_project_owner_all"
on public.design_versions for all
using (public.is_project_owner(project_id))
with check (public.is_project_owner(project_id) and created_by = auth.uid());

drop policy if exists "exports_project_owner_all" on public.exports;
create policy "exports_project_owner_all"
on public.exports for all
using (public.is_project_owner(project_id))
with check (public.is_project_owner(project_id) and created_by = auth.uid());

drop policy if exists "project_uploads_owner_select" on storage.objects;
create policy "project_uploads_owner_select"
on storage.objects for select
using (
  bucket_id = 'project-uploads'
  and public.is_project_owner((storage.foldername(name))[1]::uuid)
);

drop policy if exists "project_uploads_owner_insert" on storage.objects;
create policy "project_uploads_owner_insert"
on storage.objects for insert
with check (
  bucket_id = 'project-uploads'
  and public.is_project_owner((storage.foldername(name))[1]::uuid)
);

drop policy if exists "generated_assets_owner_select" on storage.objects;
create policy "generated_assets_owner_select"
on storage.objects for select
using (
  bucket_id = 'generated-assets'
  and public.is_project_owner((storage.foldername(name))[1]::uuid)
);

drop policy if exists "exports_owner_select" on storage.objects;
create policy "exports_owner_select"
on storage.objects for select
using (
  bucket_id = 'exports'
  and public.is_project_owner((storage.foldername(name))[1]::uuid)
);
