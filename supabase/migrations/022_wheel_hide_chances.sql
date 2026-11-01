-- Migration 022 · the wheel's chances stay with the owner  (2026-11-01, D-035)
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Paste → Run
-- Idempotent: safe to run twice. Run after 018 (the wheel).
--
-- Safe to run before or after the code is merged: the server reads only the
-- id, name, kind and value of each prize, which the function returns both
-- before and after this migration.
--
-- The owner does not publish the chances of the prizes (2026-11-01): the
-- wheel, the rules page and /api/wheel no longer show them. But the function
-- the server draws the wheel with, `wheel_available_prizes()`, returned whole
-- rows — weight, daily and monthly limits included — and any signed-in
-- account could call it. Sign-up is open, so anyone could read the chances
-- straight from the database.
--
-- Now it returns only what the wheel shows (id, label, kind, value), in the
-- wheel's order, and only the service role may call it. The draw itself is
-- unchanged: `wheel_spin` picks by weight from `wheel__available()` as before.
-- The owner still sees and edits the chances at /admin/loyalty → Тркало
-- (the table, admin only, 018).

-- The return type changes, which `create or replace` cannot do.
drop function if exists public.wheel_available_prizes();

create function public.wheel_available_prizes()
returns table (id uuid, label text, kind text, value numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select a.id, a.label, a.kind::text, a.value::numeric
    from public.wheel__available() with ordinality as a
    order by a.ordinality;
end;
$$;

revoke all on function public.wheel_available_prizes() from public, anon, authenticated;
grant execute on function public.wheel_available_prizes() to service_role;
