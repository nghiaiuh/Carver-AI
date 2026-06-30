create table if not exists public.library_folders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  slug text not null,
  created_by text not null default 'user',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, slug)
);

create table if not exists public.library_assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  folder_id uuid not null references public.library_folders(id) on delete cascade,
  title text not null,
  prompt text,
  category text,
  tags text[] not null default '{}'::text[],
  source_type text not null default 'upload',
  mime_type text,
  width integer,
  height integer,
  size_bytes bigint,
  thumb_storage_path text not null,
  preview_storage_path text not null,
  original_storage_path text not null,
  thumb_url text not null,
  preview_url text not null,
  original_url text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, original_storage_path),
  unique (owner_id, thumb_storage_path),
  unique (owner_id, preview_storage_path)
);

create index if not exists library_folders_owner_id_idx on public.library_folders(owner_id);
create index if not exists library_assets_owner_id_idx on public.library_assets(owner_id);
create index if not exists library_assets_folder_id_idx on public.library_assets(folder_id);
create index if not exists library_assets_category_idx on public.library_assets(category);
create index if not exists library_assets_tags_gin_idx on public.library_assets using gin(tags);
