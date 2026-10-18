-- Migration 018 · the wheel of fortune  (Task 13.10)
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Paste → Run
-- Idempotent: safe to run twice. Run after 008, 015, 016 and 017.
--
-- Safe to run before the code is merged: new tables and functions; the wheel
-- stays off until the owner switches it on in the loyalty settings.
--
-- EPIC 13 (D-032, D-035). Every spin wins something, and every prize on the
-- wheel can really be won: a prize that reached its daily or monthly limit is
-- taken off the wheel for the time being, and the others share its chance.
--
-- The result is decided here, never in the browser, and in one transaction
-- with the prize itself: the spin is counted, the coupon is made or the points
-- credited, together or not at all. One function does it under locks — per
-- account, per phone, and one for the wheel — so a customer cannot spin twice
-- in a period by pressing twice, and the last prize under a limit goes once.
--
-- Rights: the admin edits the prizes and reads every spin; a customer reads
-- their own spins. Spinning goes through the server only.

create table if not exists public.wheel_prizes (
  id           uuid primary key default gen_random_uuid(),
  -- What the wheel shows, e.g. "50 поени".
  label        text not null,
  kind         text not null,
  -- Points for 'points', percent for 'percent', 0 for 'free_shipping'.
  value        numeric(12,2) not null default 0,
  -- The chance, as a weight; the wheel shares 100% among the prizes on it.
  weight       numeric(8,3) not null,
  daily_cap    integer,
  monthly_cap  integer,
  sort         integer not null default 0,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint wheel_prizes_label  check (length(btrim(label)) between 1 and 30),
  constraint wheel_prizes_kind   check (kind in ('points', 'percent', 'free_shipping')),
  constraint wheel_prizes_value  check (
    case kind when 'points' then value >= 1 and value = trunc(value)
              when 'percent' then value > 0 and value <= 50
              else value = 0 end),
  constraint wheel_prizes_weight check (weight > 0),
  constraint wheel_prizes_caps   check ((daily_cap is null or daily_cap >= 0) and (monthly_cap is null or monthly_cap >= 0))
);

create table if not exists public.wheel_spins (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  -- One spin per period per phone as well as per account.
  phone_norm   text not null,
  -- 'weekly': the spin every few days; 'order': the bonus for a delivered order.
  kind         text not null,
  order_id     uuid,
  prize_id     uuid references public.wheel_prizes(id) on delete set null,
  -- A copy of what was won, so the history reads after the prize is changed.
  prize_label  text not null,
  prize_kind   text not null,
  prize_value  numeric(12,2) not null default 0,
  coupon_id    uuid references public.coupons(id) on delete set null,
  points_lot   uuid references public.points_ledger(id) on delete set null,
  created_at   timestamptz not null default now(),

  constraint wheel_spins_kind check (kind in ('weekly', 'order')),
  constraint wheel_spins_order check ((kind = 'order') = (order_id is not null))
);

create index if not exists wheel_spins_user  on public.wheel_spins (user_id, created_at desc);
create index if not exists wheel_spins_phone on public.wheel_spins (phone_norm, created_at desc);
create index if not exists wheel_spins_prize on public.wheel_spins (prize_id, created_at);
create index if not exists wheel_spins_order on public.wheel_spins (order_id) where order_id is not null;

create or replace function public.wheel_prizes_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists wheel_prizes_touch on public.wheel_prizes;
create trigger wheel_prizes_touch
  before insert or update on public.wheel_prizes
  for each row execute function public.wheel_prizes_touch();

-- The prizes proposed on 2026-10-18. Only when there are none yet, so a
-- second run never puts back a prize the owner removed.
insert into public.wheel_prizes (label, kind, value, weight, sort)
select * from (values
  ('20 поени',          'points',        20, 30, 1),
  ('5% попуст',         'percent',        5, 25, 2),
  ('50 поени',          'points',        50, 15, 3),
  ('Бесплатна достава', 'free_shipping',  0, 15, 4),
  ('10% попуст',        'percent',       10, 10, 5),
  ('100 поени',         'points',       100,  4, 6),
  ('20% попуст',        'percent',       20,  1, 7)
) as v(label, kind, value, weight, sort)
where not exists (select 1 from public.wheel_prizes);

-- ---------------------------------------------------------------------------
-- The prizes on the wheel now: switched on and under their limits. Days and
-- months are counted in Skopje time.
-- ---------------------------------------------------------------------------
create or replace function public.wheel__available()
returns setof public.wheel_prizes
language sql
stable
security definer
set search_path = public
as $$
  select p.* from public.wheel_prizes p
  where p.active
    and (p.daily_cap is null or p.daily_cap > (
      select count(*) from public.wheel_spins s where s.prize_id = p.id
        and (s.created_at at time zone 'Europe/Skopje')::date = (now() at time zone 'Europe/Skopje')::date))
    and (p.monthly_cap is null or p.monthly_cap > (
      select count(*) from public.wheel_spins s where s.prize_id = p.id
        and date_trunc('month', s.created_at at time zone 'Europe/Skopje') = date_trunc('month', now() at time zone 'Europe/Skopje')))
  order by p.sort, p.created_at;
$$;

-- Delivered and paid orders of an account that still owe a bonus spin.
create or replace function public.wheel__bonus_orders(p_user uuid, p_per_order integer)
returns table (order_id uuid, left_over integer)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, (p_per_order - count(s.id))::integer
  from public.orders o
  left join public.wheel_spins s on s.order_id = o.id and s.kind = 'order'
  where o.customer->>'userId' = p_user::text
    and (o.outcome = 'delivered' or (o.outcome is null and o.status = 'delivered'))
  group by o.id, o.created_at
  having count(s.id) < p_per_order
  order by o.created_at;
$$;

-- What the wheel offers now, and what this account may do with it.
create or replace function public.wheel_status(p_user uuid, p_phone text, p_interval_days integer, p_per_order integer)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_last timestamptz;
  v_bonus integer;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select max(created_at) into v_last from public.wheel_spins
    where kind = 'weekly' and (user_id = p_user or phone_norm = p_phone);
  select coalesce(sum(left_over), 0) into v_bonus from public.wheel__bonus_orders(p_user, greatest(p_per_order, 0));
  return jsonb_build_object(
    'last_weekly_at', v_last,
    'next_weekly_at', case when v_last is null then null else v_last + make_interval(days => p_interval_days) end,
    'weekly_ready', v_last is null or v_last + make_interval(days => p_interval_days) <= now(),
    'bonus_left', v_bonus
  );
end;
$$;

-- The prizes on the wheel now, for the server to draw it. Anyone may see them
-- through the server; nobody reads the table directly.
create or replace function public.wheel_available_prizes()
returns setof public.wheel_prizes
language sql
stable
security definer
set search_path = public
as $$
  select * from public.wheel__available();
$$;

-- ---------------------------------------------------------------------------
-- One spin. Checks the account may spin (a spin every p_interval_days, per
-- account and per phone, or a bonus spin owed for a delivered order), picks a
-- prize by its chance among those on the wheel, gives it, and records it —
-- in one transaction. Raises 'wheel: not_now' or 'wheel: no_prizes'.
-- ---------------------------------------------------------------------------
create or replace function public.wheel_spin(
  p_user uuid, p_phone text, p_interval_days integer, p_per_order integer,
  p_coupon_hours integer, p_coupon_min_basket integer, p_points_days integer
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind   text;
  v_order  uuid;
  v_last   timestamptz;
  v_total  numeric;
  v_roll   numeric;
  v_pick   uuid;
  v_prize  public.wheel_prizes%rowtype;
  v_code   text;
  v_coupon uuid;
  v_lot    uuid;
  v_spin   uuid;
  v_alpha  constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('wheel:user:' || p_user::text, 0));
  perform pg_advisory_xact_lock(hashtextextended('wheel:phone:' || p_phone, 0));
  perform pg_advisory_xact_lock(hashtextextended('wheel', 0));

  -- The regular spin first; a bonus spin only when it is not due.
  select max(created_at) into v_last from public.wheel_spins
    where kind = 'weekly' and (user_id = p_user or phone_norm = p_phone);
  if v_last is null or v_last + make_interval(days => p_interval_days) <= now() then
    v_kind := 'weekly';
  else
    select b.order_id into v_order from public.wheel__bonus_orders(p_user, greatest(p_per_order, 0)) b limit 1;
    if v_order is null then
      raise exception 'wheel: not_now' using errcode = 'P0001';
    end if;
    v_kind := 'order';
  end if;

  -- A prize by its chance, among those on the wheel now.
  select sum(weight) into v_total from public.wheel__available();
  if v_total is null or v_total <= 0 then
    raise exception 'wheel: no_prizes' using errcode = 'P0001';
  end if;
  v_roll := random() * v_total;
  select a.id into v_pick from (
    select w.id, sum(w.weight) over (order by w.sort, w.created_at, w.id) as upto from public.wheel__available() w
  ) a where a.upto > v_roll order by a.upto limit 1;
  if v_pick is null then
    -- Rounding at the very top of the range: the last prize.
    select w.id into v_pick from public.wheel__available() w order by w.sort desc, w.created_at desc, w.id desc limit 1;
  end if;
  select * into v_prize from public.wheel_prizes where id = v_pick;

  -- The prize itself.
  if v_prize.kind = 'points' then
    v_lot := public.points_credit(p_user, 'wheel', v_prize.value::integer, now(), now() + make_interval(days => p_points_days),
                                  null, null, 'тркало на среќа');
  else
    loop
      v_code := 'KOLO-';
      for i in 1..6 loop
        v_code := v_code || substr(v_alpha, 1 + floor(random() * length(v_alpha))::integer, 1);
      end loop;
      begin
        insert into public.coupons (code, kind, value, min_basket, starts_at, ends_at, max_uses, max_uses_per_user, user_id, source, note)
        values (v_code, v_prize.kind, v_prize.value, nullif(p_coupon_min_basket, 0), now(), now() + make_interval(hours => p_coupon_hours),
                1, 1, p_user, 'wheel', 'тркало на среќа')
        returning id into v_coupon;
        exit;
      exception when unique_violation then
        -- another code
      end;
    end loop;
  end if;

  insert into public.wheel_spins (user_id, phone_norm, kind, order_id, prize_id, prize_label, prize_kind, prize_value, coupon_id, points_lot)
  values (p_user, p_phone, v_kind, v_order, v_prize.id, v_prize.label, v_prize.kind, v_prize.value, v_coupon, v_lot)
  returning id into v_spin;

  return jsonb_build_object(
    'spin_id', v_spin, 'kind', v_kind, 'prize_id', v_prize.id, 'label', v_prize.label,
    'prize_kind', v_prize.kind, 'value', v_prize.value, 'coupon_code', v_code
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Rights
-- ---------------------------------------------------------------------------
alter table public.wheel_prizes enable row level security;
alter table public.wheel_spins enable row level security;

drop policy if exists "wheel_prizes: admin all"    on public.wheel_prizes;
drop policy if exists "wheel_spins: admin reads"   on public.wheel_spins;
drop policy if exists "wheel_spins: own rows"      on public.wheel_spins;

create policy "wheel_prizes: admin all" on public.wheel_prizes for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "wheel_spins: admin reads" on public.wheel_spins for select to authenticated
  using (public.is_admin());
create policy "wheel_spins: own rows" on public.wheel_spins for select to authenticated
  using (user_id = auth.uid());

revoke all on public.wheel_prizes, public.wheel_spins from anon, authenticated;
grant select, insert, update, delete on public.wheel_prizes to authenticated;
grant select on public.wheel_spins to authenticated;

revoke all on function public.wheel__available()                     from public, anon, authenticated;
revoke all on function public.wheel__bonus_orders(uuid, integer)     from public, anon, authenticated;
revoke all on function public.wheel_available_prizes()               from public, anon;
revoke all on function public.wheel_status(uuid, text, integer, integer) from public, anon;
revoke all on function public.wheel_spin(uuid, text, integer, integer, integer, integer, integer) from public, anon;
grant execute on function public.wheel_available_prizes()               to authenticated;
grant execute on function public.wheel_status(uuid, text, integer, integer) to authenticated;
grant execute on function public.wheel_spin(uuid, text, integer, integer, integer, integer, integer) to authenticated;
