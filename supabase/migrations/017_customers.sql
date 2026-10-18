-- Migration 017 · customer accounts  (Task 13.6)
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Paste → Run
-- Idempotent: safe to run twice. Run after 008 (uses is_admin).
--
-- Safe to run before the code is merged: new tables nobody reads yet, no
-- existing right changes.
--
-- EPIC 13 (D-032). A customer is a Supabase account with the role
-- `customer` and one row here: their name, phone, birthday and what they
-- agreed to. One phone is one account — the database holds it, on the phone
-- in one canonical form (`normalizePhone`, src/lib/customers.ts).
--
-- The phone is confirmed without SMS: by the first order to it that is
-- delivered and paid (13.8). The e-mail is confirmed by Supabase.
--
-- What a customer agreed to is kept as a log, never overwritten: which text
-- (its version, src/config/policies.ts), yes or no, and when.
--
-- Rights: a customer reads their own row and their own consents; the admin
-- reads all. Nobody writes from the browser: every write goes through the
-- server (/api/account), which checks the input and the uniqueness first.

create table if not exists public.customers (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  first_name         text not null,
  last_name          text,
  -- As typed, for the courier; and in one form, for uniqueness.
  phone              text not null,
  phone_norm         text not null,
  birth_date         date,
  marketing_consent  boolean not null default false,
  -- The first order to this phone that was delivered and paid (13.8).
  phone_verified_at  timestamptz,
  -- The welcome coupon and the sign-up bonus, given once (after the e-mail is confirmed).
  welcome_issued_at  timestamptz,
  -- The bonus for a complete profile, given once.
  profile_bonus_at   timestamptz,
  -- The dashboard tour was seen (13.13), so it does not repeat on another phone.
  tour_seen_at       timestamptz,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint customers_first_name check (length(btrim(first_name)) between 1 and 60),
  constraint customers_last_name  check (last_name is null or length(btrim(last_name)) <= 60),
  constraint customers_phone_norm check (phone_norm ~ '^0[2-9][0-9]{7}$'),
  constraint customers_birth_date check (birth_date is null or birth_date >= date '1900-01-01')
);

-- One phone, one account.
create unique index if not exists customers_phone_unique on public.customers (phone_norm);

create or replace function public.customers_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' then
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists customers_touch on public.customers;
create trigger customers_touch
  before insert or update on public.customers
  for each row execute function public.customers_touch();

create table if not exists public.customer_consents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null,
  -- The version of the text agreed to (rules, privacy); null for marketing.
  version     text,
  granted     boolean not null,
  created_at  timestamptz not null default now(),

  constraint customer_consents_kind check (kind in ('rules', 'privacy', 'marketing')),
  constraint customer_consents_version check (kind = 'marketing' or version is not null)
);

create index if not exists customer_consents_user on public.customer_consents (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Rights
-- ---------------------------------------------------------------------------
alter table public.customers enable row level security;
alter table public.customer_consents enable row level security;

drop policy if exists "customers: own row"            on public.customers;
drop policy if exists "customers: admin reads"        on public.customers;
drop policy if exists "customer_consents: own rows"   on public.customer_consents;
drop policy if exists "customer_consents: admin reads" on public.customer_consents;

create policy "customers: own row" on public.customers for select to authenticated
  using (user_id = auth.uid());
create policy "customers: admin reads" on public.customers for select to authenticated
  using (public.is_admin());
create policy "customer_consents: own rows" on public.customer_consents for select to authenticated
  using (user_id = auth.uid());
create policy "customer_consents: admin reads" on public.customer_consents for select to authenticated
  using (public.is_admin());

revoke all on public.customers, public.customer_consents from anon, authenticated;
grant select on public.customers, public.customer_consents to authenticated;
