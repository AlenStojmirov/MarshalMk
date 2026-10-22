-- Migration 020 · the shop's settings  (Task 14.2)
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Paste → Run
-- Idempotent: safe to run twice. Run after 008 (uses is_admin).
--
-- Safe to run before the code is merged: a new table nobody reads yet, no
-- existing right changes. Until it runs, no new-order e-mail is sent and the
-- settings screen says so.
--
-- Settings of the shop itself, as opposed to the loyalty programme's (014).
-- The first is where an e-mail goes when an order comes in, so it is seen at
-- once rather than when someone next opens the back office. One row of jsonb,
-- read over the defaults in code (src/lib/store-settings.ts), so a later
-- setting needs no migration.
--
-- Rights: admin reads and writes. The order route reads it with the service
-- role, so nobody else needs to — the addresses are the owner's business.

create table if not exists public.store_settings (
  -- One row only: the key can only ever be true.
  id          boolean primary key default true,
  settings    jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now(),
  updated_by  uuid,

  constraint store_settings_one_row check (id),
  constraint store_settings_object  check (jsonb_typeof(settings) = 'object')
);

-- Who changed it last, and when. auth.uid() is null for the service role.
create or replace function public.store_settings_touch()
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

drop trigger if exists store_settings_touch on public.store_settings;
create trigger store_settings_touch
  before insert or update on public.store_settings
  for each row execute function public.store_settings_touch();

-- ---------------------------------------------------------------------------
-- Rights
-- ---------------------------------------------------------------------------
alter table public.store_settings enable row level security;

drop policy if exists "store_settings: admin all" on public.store_settings;
create policy "store_settings: admin all" on public.store_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

revoke all on public.store_settings from anon;
grant select, insert, update on public.store_settings to authenticated;
