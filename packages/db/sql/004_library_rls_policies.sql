alter table public.library_folders enable row level security;
alter table public.library_assets enable row level security;

create or replace function public.is_library_folder_owner(target_folder_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.library_folders
    where id = target_folder_id
      and owner_id = auth.uid()
  );
$$;

drop policy if exists "library_folders_owner_all" on public.library_folders;
create policy "library_folders_owner_all"
on public.library_folders for all
using (owner_id = auth.uid())
with check (owner_id = auth.uid());

drop policy if exists "library_assets_owner_all" on public.library_assets;
create policy "library_assets_owner_all"
on public.library_assets for all
using (owner_id = auth.uid() and public.is_library_folder_owner(folder_id))
with check (owner_id = auth.uid() and public.is_library_folder_owner(folder_id));
