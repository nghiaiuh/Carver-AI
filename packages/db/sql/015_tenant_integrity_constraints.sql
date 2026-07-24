-- Tenant integrity follow-up. Apply after 014_project_workspace_rpc.sql.
--
-- This migration fixes legacy rows before validating the ownership constraints
-- introduced in 005 and binds local drafts to the actual project owner.

update public.assets as assets
set owner_id = projects.owner_id
from public.projects as projects
where assets.project_id = projects.id
  and assets.owner_id is null;

update public.canvas_snapshots as snapshots
set created_by = projects.owner_id
from public.projects as projects
where snapshots.project_id = projects.id
  and snapshots.created_by is null;

alter table public.assets
  validate constraint assets_owner_id_required;

alter table public.canvas_snapshots
  validate constraint canvas_snapshots_created_by_required;

-- The original policy only compared owner_id. Without this project check, a
-- user could create a draft row against another tenant's project id while
-- claiming their own owner id. That cannot expose rows, but it can block the
-- real owner from creating a draft and breaks the tenant invariant.
drop policy if exists "project_canvas_drafts_project_owner_all" on public.project_canvas_drafts;

create policy "project_canvas_drafts_project_owner_all"
  on public.project_canvas_drafts
  for all
  using (
    owner_id = auth.uid()
    and public.is_project_owner(project_id)
  )
  with check (
    owner_id = auth.uid()
    and public.is_project_owner(project_id)
  );

-- Make a draft's declared owner immutable even for a valid project owner.
create or replace function public.enforce_project_canvas_draft_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_id is null or not public.is_project_owner(new.project_id) then
    raise exception 'DRAFT_OWNERSHIP_INVALID' using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE' and new.owner_id <> old.owner_id then
    raise exception 'DRAFT_OWNER_IMMUTABLE' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop trigger if exists project_canvas_drafts_enforce_integrity on public.project_canvas_drafts;
create trigger project_canvas_drafts_enforce_integrity
  before insert or update on public.project_canvas_drafts
  for each row execute function public.enforce_project_canvas_draft_integrity();
