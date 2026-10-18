-- Migration 016 · coupons  (Task 13.4)
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Paste → Run
-- Idempotent: safe to run twice. Run after 008 (uses is_admin).
--
-- Safe to run before the code is merged: new tables and functions nobody
-- calls yet, no existing right changes.
--
-- EPIC 13 (D-032). A coupon takes a percent or a fixed amount off, or waives
-- delivery. It may be public (a code anyone can type) or personal (bound to
-- one account: welcome, birthday, wheel, or given by the owner), may cover
-- only some categories or products, and has a window, a minimum basket and a
-- number of uses. One coupon per order, held by the database.
--
-- What the coupon takes off a basket is decided by the basket arithmetic
-- (src/lib/loyalty.ts) within the limits — at most 50% off the regular price
-- and never below the floor. This file decides only whether a coupon may be
-- used at all, and records that it was, once, per order.
--
-- A use is released, not deleted, when its order is cancelled or refused:
-- the history stays, and the coupon can be used again within its window.
--
-- Rights: the admin creates and edits coupons and reads every use. A customer
-- reads their own personal coupons and their own uses. Uses are written only
-- by the functions below (admin or server).

create table if not exists public.coupons (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null,
  kind               text not null,
  -- Percent for 'percent', denars for 'fixed', 0 for 'free_shipping'.
  value              numeric(12,2) not null default 0,
  -- Denars: caps a percent coupon.
  max_discount       integer,
  -- Denars: the basket at its sale prices, before the coupon.
  min_basket         integer,
  starts_at          timestamptz not null default now(),
  ends_at            timestamptz,
  -- Across everyone; null = no limit.
  max_uses           integer,
  -- Per customer; 1 = once, null = no limit.
  max_uses_per_user  integer default 1,
  -- Personal coupon: only this account may use it.
  user_id            uuid references auth.users(id) on delete cascade,
  include_categories text[] not null default '{}',
  exclude_categories text[] not null default '{}',
  include_products   text[] not null default '{}',
  exclude_products   text[] not null default '{}',
  source             text not null default 'manual',
  active             boolean not null default true,
  -- The owner's own note: what it was for. Never shown to customers.
  note               text,
  created_by         uuid,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),

  constraint coupons_code    check (code ~ '^[A-Z0-9-]{3,24}$'),
  constraint coupons_kind    check (kind in ('percent', 'fixed', 'free_shipping')),
  constraint coupons_value   check (
    case kind when 'percent' then value > 0 and value <= 100
              when 'fixed' then value > 0
              else value = 0 end),
  constraint coupons_caps    check ((max_discount is null or max_discount > 0) and (min_basket is null or min_basket >= 0)),
  constraint coupons_window  check (ends_at is null or ends_at > starts_at),
  constraint coupons_uses    check ((max_uses is null or max_uses > 0) and (max_uses_per_user is null or max_uses_per_user > 0)),
  constraint coupons_source  check (source in ('public', 'manual', 'welcome', 'birthday', 'wheel', 'abandoned'))
);

create unique index if not exists coupons_code_unique on public.coupons (code);
create index if not exists coupons_user on public.coupons (user_id) where user_id is not null;

-- Codes are kept in one form: trimmed and upper case, so "zima10 " and
-- "ZIMA10" are one coupon. Who changed it, and when.
create or replace function public.coupons_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.code := upper(btrim(new.code));
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.created_by := coalesce(new.created_by, auth.uid());
  else
    new.created_at := old.created_at;
    new.created_by := old.created_by;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists coupons_touch on public.coupons;
create trigger coupons_touch
  before insert or update on public.coupons
  for each row execute function public.coupons_touch();

create table if not exists public.coupon_redemptions (
  id               uuid primary key default gen_random_uuid(),
  coupon_id        uuid not null references public.coupons(id) on delete restrict,
  -- A snapshot, so the customer's history reads without the coupon row.
  code             text not null,
  user_id          uuid not null references auth.users(id) on delete cascade,
  order_id         uuid not null,
  order_number     text,
  -- What it took off the goods, and the delivery it waived, in denars.
  discount         integer not null default 0 check (discount >= 0),
  shipping_waived  integer not null default 0 check (shipping_waived >= 0),
  created_at       timestamptz not null default now(),
  -- The order was cancelled or refused: the use no longer counts.
  released_at      timestamptz
);

-- One coupon per order (D-032).
create unique index if not exists coupon_redemptions_one_per_order
  on public.coupon_redemptions (order_id) where released_at is null;
create index if not exists coupon_redemptions_coupon on public.coupon_redemptions (coupon_id) where released_at is null;
create index if not exists coupon_redemptions_user on public.coupon_redemptions (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Why a coupon cannot be used by this customer now, or null if it can.
-- One answer for the basket (coupon_lookup) and the order (coupon_redeem).
-- ---------------------------------------------------------------------------
create or replace function public.coupon__refusal(p_coupon uuid, p_user uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  c       public.coupons%rowtype;
  v_total integer;
  v_mine  integer;
begin
  select * into c from public.coupons where id = p_coupon;
  if not found then return 'not_found'; end if;
  if not c.active then return 'inactive'; end if;
  if c.starts_at > now() then return 'not_started'; end if;
  if c.ends_at is not null and c.ends_at <= now() then return 'expired'; end if;
  if c.user_id is not null and c.user_id is distinct from p_user then return 'not_yours'; end if;
  select count(*), count(*) filter (where user_id = p_user) into v_total, v_mine
    from public.coupon_redemptions where coupon_id = c.id and released_at is null;
  if c.max_uses is not null and v_total >= c.max_uses then return 'used_up'; end if;
  if c.max_uses_per_user is not null and v_mine >= c.max_uses_per_user then return 'used'; end if;
  return null;
end;
$$;

-- The coupon behind a typed code, and whether this customer may use it.
-- No row: no such code. Asked by the server for the basket.
create or replace function public.coupon_lookup(p_code text, p_user uuid)
returns table (
  id uuid, code text, kind text, value numeric, max_discount integer, min_basket integer, ends_at timestamptz,
  include_categories text[], exclude_categories text[], include_products text[], exclude_products text[],
  source text, refusal text
)
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
    select c.id, c.code, c.kind, c.value, c.max_discount, c.min_basket, c.ends_at,
           c.include_categories, c.exclude_categories, c.include_products, c.exclude_products,
           c.source, public.coupon__refusal(c.id, p_user)
    from public.coupons c
    where c.code = upper(btrim(p_code));
end;
$$;

-- Record a use on an order, checked again under a lock on the coupon, so the
-- last use of a limited code goes to one order only.
create or replace function public.coupon_redeem(
  p_code text, p_user uuid, p_order_id uuid, p_order_number text, p_discount integer, p_shipping_waived integer default 0
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_coupon  uuid;
  v_code    text;
  v_refusal text;
  v_id      uuid;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select c.id, c.code into v_coupon, v_code from public.coupons c where c.code = upper(btrim(p_code)) for update;
  if v_coupon is null then
    raise exception 'coupon refused: not_found' using errcode = 'P0001';
  end if;
  v_refusal := public.coupon__refusal(v_coupon, p_user);
  if v_refusal is not null then
    raise exception 'coupon refused: %', v_refusal using errcode = 'P0001';
  end if;
  insert into public.coupon_redemptions (coupon_id, code, user_id, order_id, order_number, discount, shipping_waived)
  values (v_coupon, v_code, p_user, p_order_id, p_order_number, greatest(coalesce(p_discount, 0), 0), greatest(coalesce(p_shipping_waived, 0), 0))
  returning id into v_id;
  return v_id;
end;
$$;

-- The order was cancelled or refused: its coupon use stops counting (13.8).
-- Safe to call twice.
create or replace function public.coupon_release_order(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.coupon_redemptions set released_at = now() where order_id = p_order_id and released_at is null;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- The e-mails behind account ids, for the owner's screens (whose personal
-- coupon is this). auth.users is not readable from the browser.
create or replace function public.admin_user_emails(p_ids uuid[])
returns table (user_id uuid, email text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query select u.id, u.email::text from auth.users u where u.id = any(p_ids);
end;
$$;

-- ---------------------------------------------------------------------------
-- Rights
-- ---------------------------------------------------------------------------
alter table public.coupons enable row level security;
alter table public.coupon_redemptions enable row level security;

drop policy if exists "coupons: admin all"        on public.coupons;
drop policy if exists "coupons: own personal"     on public.coupons;
drop policy if exists "coupon_redemptions: admin reads" on public.coupon_redemptions;
drop policy if exists "coupon_redemptions: own"   on public.coupon_redemptions;

create policy "coupons: admin all" on public.coupons for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- Public codes are not listed to customers: a code shared in one place is
-- not an offer to everyone. They see a public coupon in their own uses.
create policy "coupons: own personal" on public.coupons for select to authenticated
  using (user_id = auth.uid());
create policy "coupon_redemptions: admin reads" on public.coupon_redemptions for select to authenticated
  using (public.is_admin());
create policy "coupon_redemptions: own" on public.coupon_redemptions for select to authenticated
  using (user_id = auth.uid());

revoke all on public.coupons, public.coupon_redemptions from anon, authenticated;
grant select, insert, update on public.coupons to authenticated;
grant select on public.coupon_redemptions to authenticated;

revoke all on function public.coupon__refusal(uuid, uuid) from public, anon, authenticated;
revoke all on function public.coupon_lookup(text, uuid) from public, anon;
revoke all on function public.coupon_redeem(text, uuid, uuid, text, integer, integer) from public, anon;
revoke all on function public.coupon_release_order(uuid) from public, anon;
revoke all on function public.admin_user_emails(uuid[]) from public, anon;
grant execute on function public.admin_user_emails(uuid[]) to authenticated;
grant execute on function public.coupon_lookup(text, uuid) to authenticated;
grant execute on function public.coupon_redeem(text, uuid, uuid, text, integer, integer) to authenticated;
grant execute on function public.coupon_release_order(uuid) to authenticated;
