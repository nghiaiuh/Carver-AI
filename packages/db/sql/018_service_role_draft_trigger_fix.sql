-- Forward-fix for staging environments that applied the first version of 017.
-- Service-role RPC calls have no auth.uid(), so verify the draft owner against
-- the project row instead of rejecting valid BFF-managed writes.

create or replace function public.enforce_project_canvas_draft_integrity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_id is null then
    raise exception 'DRAFT_OWNERSHIP_INVALID' using errcode = 'P0001';
  end if;

  if auth.role() = 'service_role' then
    if not exists (
      select 1
      from public.projects
      where id = new.project_id
        and owner_id = new.owner_id
    ) then
      raise exception 'DRAFT_OWNERSHIP_INVALID' using errcode = 'P0001';
    end if;
  elsif auth.uid() is null
    or new.owner_id <> auth.uid()
    or not public.is_project_owner(new.project_id) then
    raise exception 'DRAFT_OWNERSHIP_INVALID' using errcode = 'P0001';
  end if;

  if tg_op = 'UPDATE' and new.owner_id <> old.owner_id then
    raise exception 'DRAFT_OWNER_IMMUTABLE' using errcode = 'P0001';
  end if;

  return new;
end;
$$;
