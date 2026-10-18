-- Migration 014 · the loyalty programme's settings  (Task 13.1)
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Paste → Run
-- Idempotent: safe to run twice. Run after 008 (uses is_admin).
--
-- Safe to run before the code is merged: a new table nobody reads yet, no
-- existing right changes.
--
-- EPIC 13 (2026-10-18). Every number of the programme — earn rate, limits,
-- waiting and expiry periods, the wheel's switch — is the owner's to change
-- without a code change. They live here as one row of jsonb, read over the
-- defaults in code (src/lib/loyalty-settings.ts): a key missing or out of
-- range here falls back to its default, so a later task can add a setting
-- without a migration, and a typo can never zero a rate.
--
-- The wheel's prizes and odds are rows of their own (Task 13.10), not here.
--
-- Rights: admin reads and writes. The server reads with the service role
-- for the calculations and the public rules pages, so nobody else needs to.

create table if not exists public.loyalty_settings (
  -- One row only: the key can only ever be true.
  id          boolean primary key default true,
  settings    jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid,

  constraint loyalty_settings_one_row check (id),
  constraint loyalty_settings_object  check (jsonb_typeof(settings) = 'object')
);

-- Who changed it last, and when. auth.uid() is null for the service role.
create or replace function public.loyalty_settings_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists loyalty_settings_touch on public.loyalty_settings;
create trigger loyalty_settings_touch
  before insert or update on public.loyalty_settings
  for each row execute function public.loyalty_settings_touch();

-- ---------------------------------------------------------------------------
-- Rights
-- ---------------------------------------------------------------------------
alter table public.loyalty_settings enable row level security;

drop policy if exists "loyalty_settings: admin all" on public.loyalty_settings;
create policy "loyalty_settings: admin all" on public.loyalty_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

revoke all on public.loyalty_settings from anon;
grant select, insert, update on public.loyalty_settings to authenticated;
