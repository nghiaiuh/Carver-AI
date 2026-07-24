-- Metadata is a security boundary for the asset gateway. Browser-created rows
-- may only point at server-derived keys in the caller's own namespace.

create or replace function public.enforce_project_asset_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  expected_prefix text;
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if auth.uid() is null or new.owner_id <> auth.uid() or not public.is_project_owner(new.project_id) then
    raise exception 'ASSET_OWNERSHIP_INVALID' using errcode = 'P0001';
  end if;

  expected_prefix := format('users/%s/projects/%s/', new.owner_id, new.project_id);
  if new.storage_path is null or left(new.storage_path, char_length(expected_prefix)) <> expected_prefix then
    raise exception 'ASSET_STORAGE_PATH_INVALID' using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE' and (
    new.owner_id <> old.owner_id
    or new.project_id <> old.project_id
    or new.storage_bucket <> old.storage_bucket
    or new.storage_path <> old.storage_path
    or new.kind <> old.kind
    or new.source_job_id is distinct from old.source_job_id
  ) then
    raise exception 'ASSET_IMMUTABLE_FIELD' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists assets_enforce_integrity on public.assets;
create trigger assets_enforce_integrity
  before insert or update on public.assets
  for each row execute function public.enforce_project_asset_integrity();

create or replace function public.enforce_library_asset_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  expected_prefix text;
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if auth.uid() is null
    or new.owner_id <> auth.uid()
    or not public.is_library_folder_owner(new.folder_id) then
    raise exception 'LIBRARY_ASSET_OWNERSHIP_INVALID' using errcode = 'P0001';
  end if;

  expected_prefix := format('%s/', new.owner_id);
  if new.original_storage_path is null
    or new.thumb_storage_path is null
    or new.preview_storage_path is null
    or left(new.original_storage_path, char_length(expected_prefix)) <> expected_prefix
    or left(new.thumb_storage_path, char_length(expected_prefix)) <> expected_prefix
    or left(new.preview_storage_path, char_length(expected_prefix)) <> expected_prefix then
    raise exception 'LIBRARY_STORAGE_PATH_INVALID' using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE' and (
    new.owner_id <> old.owner_id
    or new.folder_id <> old.folder_id
    or new.original_storage_path <> old.original_storage_path
    or new.thumb_storage_path <> old.thumb_storage_path
    or new.preview_storage_path <> old.preview_storage_path
  ) then
    raise exception 'LIBRARY_ASSET_IMMUTABLE_FIELD' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists library_assets_enforce_integrity on public.library_assets;
create trigger library_assets_enforce_integrity
  before insert or update on public.library_assets
  for each row execute function public.enforce_library_asset_integrity();
