create or replace function public.consume_profile_credits(p_amount integer)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  next_credits integer;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_credit_amount';
  end if;

  if not exists (
    select 1
    from public.profiles
    where id = auth.uid()
  ) then
    raise exception 'profile_not_found';
  end if;

  update public.profiles
  set credits_amount = credits_amount - p_amount
  where id = auth.uid()
    and credits_amount >= p_amount
  returning credits_amount into next_credits;

  if next_credits is null then
    raise exception 'insufficient_credits';
  end if;

  return next_credits;
end;
$$;

create or replace function public.restore_profile_credits(p_amount integer)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  next_credits integer;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'invalid_credit_amount';
  end if;

  update public.profiles
  set credits_amount = credits_amount + p_amount
  where id = auth.uid()
  returning credits_amount into next_credits;

  if next_credits is null then
    raise exception 'profile_not_found';
  end if;

  return next_credits;
end;
$$;

grant execute on function public.consume_profile_credits(integer) to authenticated;
grant execute on function public.restore_profile_credits(integer) to authenticated;
