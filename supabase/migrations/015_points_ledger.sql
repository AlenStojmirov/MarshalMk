-- Migration 015 · the points ledger  (Task 13.3)
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Paste → Run
-- Idempotent: safe to run twice. Run after 008 (uses is_admin) and 014.
--
-- Safe to run before the code is merged: new tables and functions nobody
-- calls yet, no existing right changes.
--
-- EPIC 13 (D-031, D-032). Points are kept as movements, never as one balance
-- field: every change is a row, and the balance is what the rows add up to.
--
-- Credits are lots: earned on an order, a bonus, a wheel prize, a manual
-- addition, or spent points that came back. Each lot carries its own dates —
-- `available_at` (null while it waits for the order to be delivered and paid)
-- and `expires_at` — and `remaining`, what is left of it. Debits — points
-- spent on an order, a manual removal, the earnings of a cancelled order —
-- take from the active lots that expire first, and `points_allocations` says
-- which lots, so a cancelled order puts its points back exactly where they
-- came from.
--
-- Expiry is read, not written: a lot past `expires_at` with points left has
-- expired, with no job to run. `remaining` is changed only by the functions
-- below, under a lock per customer, so two orders cannot spend the same
-- points.
--
-- Rights: a customer reads their own rows; the admin reads all. Nobody writes
-- the tables directly: every write goes through a function that checks for
-- the admin or the server (service role).

create table if not exists public.points_ledger (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  kind          text not null,
  -- The size of the movement, always positive; the kind says which way.
  points        integer not null,
  -- Lots only: what is left. Changed only by the functions below.
  remaining     integer,
  -- Lots only: when it can be spent (null = waits for delivery and payment)
  -- and when it lapses. Set together.
  available_at  timestamptz,
  expires_at    timestamptz,
  -- No foreign key, as in sales_ledger: the history outlives a deleted order.
  order_id      uuid,
  order_number  text,
  -- A cancel names the lot it voided; a return names the spending it undid.
  related_id    uuid references public.points_ledger(id) on delete set null,
  -- Spending only: when a cancelled order gave these points back.
  reversed_at   timestamptz,
  reason        text,
  created_by    uuid,
  created_at    timestamptz not null default now(),

  constraint points_ledger_kind check (kind in (
    'earn', 'bonus', 'wheel', 'adjust_add', 'return',  -- lots
    'redeem', 'adjust_remove', 'cancel'                 -- debits
  )),
  constraint points_ledger_points check (points > 0),
  constraint points_ledger_shape check (
    case when kind in ('earn', 'bonus', 'wheel', 'adjust_add', 'return')
      then remaining is not null and remaining between 0 and points
      else remaining is null and available_at is null and expires_at is null
    end
  ),
  constraint points_ledger_dates check ((available_at is null) = (expires_at is null) and (expires_at is null or expires_at > available_at)),
  constraint points_ledger_reason check (kind not in ('adjust_add', 'adjust_remove') or length(btrim(coalesce(reason, ''))) > 0),
  constraint points_ledger_reversal check (reversed_at is null or kind = 'redeem')
);

create index if not exists points_ledger_user on public.points_ledger (user_id, created_at desc);
create index if not exists points_ledger_order on public.points_ledger (order_id) where order_id is not null;
create index if not exists points_ledger_open_lots on public.points_ledger (user_id, expires_at) where remaining > 0;

create table if not exists public.points_allocations (
  debit_id  uuid not null references public.points_ledger(id) on delete cascade,
  lot_id    uuid not null references public.points_ledger(id) on delete cascade,
  points    integer not null check (points > 0),
  primary key (debit_id, lot_id)
);

-- ---------------------------------------------------------------------------
-- Internal: take points from a customer's active lots, the ones that expire
-- first. Fails the whole call if there are not enough, so nothing half-spent
-- is ever written. Called only by the functions below.
-- ---------------------------------------------------------------------------
create or replace function public.points__consume(p_user uuid, p_debit uuid, p_points integer)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_left integer := p_points;
  v_lot  record;
  v_take integer;
begin
  for v_lot in
    select id, remaining from public.points_ledger
    where user_id = p_user and remaining > 0 and available_at <= now() and expires_at > now()
    order by expires_at, created_at, id
    for update
  loop
    exit when v_left = 0;
    v_take := least(v_lot.remaining, v_left);
    update public.points_ledger set remaining = remaining - v_take where id = v_lot.id;
    insert into public.points_allocations (debit_id, lot_id, points) values (p_debit, v_lot.id, v_take);
    v_left := v_left - v_take;
  end loop;
  if v_left > 0 then
    raise exception 'not enough points: % short', v_left using errcode = 'P0001';
  end if;
end;
$$;

-- One customer's points are changed by one call at a time.
create or replace function public.points__lock(p_user uuid)
returns void
language sql
set search_path = public
as $$
  select pg_advisory_xact_lock(hashtextextended('points:' || p_user::text, 0));
$$;

-- ---------------------------------------------------------------------------
-- Credit a lot: earned on an order, a bonus, a wheel prize. Pending lots
-- (waiting for delivery and payment) pass both dates as null.
-- ---------------------------------------------------------------------------
create or replace function public.points_credit(
  p_user uuid, p_kind text, p_points integer,
  p_available_at timestamptz, p_expires_at timestamptz,
  p_order_id uuid default null, p_order_number text default null, p_reason text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_kind not in ('earn', 'bonus', 'wheel') then
    raise exception 'points_credit takes earn, bonus or wheel, not %', p_kind using errcode = '22023';
  end if;
  perform public.points__lock(p_user);
  insert into public.points_ledger (user_id, kind, points, remaining, available_at, expires_at, order_id, order_number, reason, created_by)
  values (p_user, p_kind, p_points, p_points, p_available_at, p_expires_at, p_order_id, p_order_number, p_reason, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- A pending lot becomes spendable: its order was delivered and paid (13.8).
create or replace function public.points_activate(p_lot uuid, p_available_at timestamptz, p_expires_at timestamptz)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.points_ledger
     set available_at = p_available_at, expires_at = p_expires_at
   where id = p_lot and available_at is null and remaining > 0
     and kind in ('earn', 'bonus', 'wheel', 'adjust_add');
  return found;
end;
$$;

-- ---------------------------------------------------------------------------
-- Spend points on an order.
-- ---------------------------------------------------------------------------
create or replace function public.points_redeem(p_user uuid, p_points integer, p_order_id uuid, p_order_number text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  perform public.points__lock(p_user);
  insert into public.points_ledger (user_id, kind, points, order_id, order_number, created_by)
  values (p_user, 'redeem', p_points, p_order_id, p_order_number, auth.uid())
  returning id into v_id;
  perform public.points__consume(p_user, v_id, p_points);
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- The owner adds or removes points by hand, always with a reason.
-- Added points are spendable at once and lapse at p_expires_at.
-- ---------------------------------------------------------------------------
create or replace function public.points_adjust(p_user uuid, p_delta integer, p_reason text, p_expires_at timestamptz default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) = 0 then
    raise exception 'a reason is required' using errcode = '22023';
  end if;
  if coalesce(p_delta, 0) = 0 then
    raise exception 'nothing to change' using errcode = '22023';
  end if;
  perform public.points__lock(p_user);
  if p_delta > 0 then
    if p_expires_at is null or p_expires_at <= now() then
      raise exception 'added points need an expiry in the future' using errcode = '22023';
    end if;
    insert into public.points_ledger (user_id, kind, points, remaining, available_at, expires_at, reason, created_by)
    values (p_user, 'adjust_add', p_delta, p_delta, now(), p_expires_at, btrim(p_reason), auth.uid())
    returning id into v_id;
  else
    insert into public.points_ledger (user_id, kind, points, reason, created_by)
    values (p_user, 'adjust_remove', -p_delta, btrim(p_reason), auth.uid())
    returning id into v_id;
    perform public.points__consume(p_user, v_id, -p_delta);
  end if;
  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- An order was cancelled or refused: its earnings go, its spending comes
-- back (D-032). Spent points return to the lots they came from, with their
-- own expiry; a lot that expired meanwhile returns its share as a new lot
-- that lasts p_grace_days, so a cancellation never costs the customer points.
-- Points that came from a cancelled order's own earnings do not come back.
-- Safe to call twice: the second call finds nothing left to do.
-- ---------------------------------------------------------------------------
create or replace function public.points_cancel_order(p_order_id uuid, p_grace_days integer default 30)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lot     record;
  v_debit   record;
  v_alloc   record;
  v_id      uuid;
  v_voided  integer := 0;
  v_back    integer := 0;
  v_late    integer;
  v_lost    integer;
  v_users   uuid[];
  v_user    uuid;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select array_agg(distinct user_id) into v_users from public.points_ledger where order_id = p_order_id;
  foreach v_user in array coalesce(v_users, '{}') loop
    perform public.points__lock(v_user);
  end loop;

  -- The earnings of the order.
  for v_lot in
    select id, user_id, remaining, order_number from public.points_ledger
    where order_id = p_order_id and kind = 'earn' and remaining > 0
    for update
  loop
    insert into public.points_ledger (user_id, kind, points, order_id, order_number, related_id, reason, created_by)
    values (v_lot.user_id, 'cancel', v_lot.remaining, p_order_id, v_lot.order_number, v_lot.id, 'откажана нарачка', auth.uid())
    returning id into v_id;
    insert into public.points_allocations (debit_id, lot_id, points) values (v_id, v_lot.id, v_lot.remaining);
    update public.points_ledger set remaining = 0 where id = v_lot.id;
    v_voided := v_voided + v_lot.remaining;
  end loop;

  -- What the order spent.
  for v_debit in
    select id, user_id, points, order_number from public.points_ledger
    where order_id = p_order_id and kind = 'redeem' and reversed_at is null
    for update
  loop
    v_late := 0;
    v_lost := 0;
    for v_alloc in
      select a.lot_id, a.points, l.expires_at,
             exists (select 1 from public.points_ledger c where c.kind = 'cancel' and c.related_id = a.lot_id) as voided
      from public.points_allocations a join public.points_ledger l on l.id = a.lot_id
      where a.debit_id = v_debit.id
    loop
      if v_alloc.voided then
        v_lost := v_lost + v_alloc.points;
      elsif v_alloc.expires_at > now() then
        update public.points_ledger set remaining = remaining + v_alloc.points where id = v_alloc.lot_id;
      else
        v_late := v_late + v_alloc.points;
      end if;
    end loop;
    if v_debit.points > v_lost then
      insert into public.points_ledger (user_id, kind, points, remaining, available_at, expires_at, order_id, order_number, related_id, reason, created_by)
      values (
        v_debit.user_id, 'return', v_debit.points - v_lost, v_late,
        case when v_late > 0 then now() end,
        case when v_late > 0 then now() + make_interval(days => greatest(p_grace_days, 1)) end,
        p_order_id, v_debit.order_number, v_debit.id, 'откажана нарачка', auth.uid()
      );
    end if;
    update public.points_ledger set reversed_at = now() where id = v_debit.id;
    v_back := v_back + v_debit.points - v_lost;
  end loop;

  return jsonb_build_object('voided', v_voided, 'returned', v_back);
end;
$$;

-- The owner finds a customer by e-mail to correct their points. auth.users is
-- not readable from the browser, so this answers only the admin.
create or replace function public.points_find_user(p_email text)
returns table (user_id uuid, email text, created_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  return query
    select u.id, u.email::text, u.created_at from auth.users u
    where lower(u.email) = lower(btrim(p_email));
end;
$$;

-- ---------------------------------------------------------------------------
-- Rights
-- ---------------------------------------------------------------------------
alter table public.points_ledger enable row level security;
alter table public.points_allocations enable row level security;

drop policy if exists "points_ledger: own rows"   on public.points_ledger;
drop policy if exists "points_ledger: admin reads" on public.points_ledger;
drop policy if exists "points_allocations: admin reads" on public.points_allocations;

create policy "points_ledger: own rows" on public.points_ledger for select to authenticated
  using (user_id = auth.uid());
create policy "points_ledger: admin reads" on public.points_ledger for select to authenticated
  using (public.is_admin());
create policy "points_allocations: admin reads" on public.points_allocations for select to authenticated
  using (public.is_admin());

revoke all on public.points_ledger, public.points_allocations from anon, authenticated;
grant select on public.points_ledger, public.points_allocations to authenticated;

revoke all on function public.points__consume(uuid, uuid, integer) from public, anon, authenticated;
revoke all on function public.points__lock(uuid)                    from public, anon, authenticated;
revoke all on function public.points_credit(uuid, text, integer, timestamptz, timestamptz, uuid, text, text) from public, anon;
revoke all on function public.points_activate(uuid, timestamptz, timestamptz)                          from public, anon;
revoke all on function public.points_redeem(uuid, integer, uuid, text)                                 from public, anon;
revoke all on function public.points_adjust(uuid, integer, text, timestamptz)                          from public, anon;
revoke all on function public.points_cancel_order(uuid, integer)                                       from public, anon;
revoke all on function public.points_find_user(text)                                                   from public, anon;
grant execute on function public.points_credit(uuid, text, integer, timestamptz, timestamptz, uuid, text, text) to authenticated;
grant execute on function public.points_activate(uuid, timestamptz, timestamptz)                          to authenticated;
grant execute on function public.points_redeem(uuid, integer, uuid, text)                                 to authenticated;
grant execute on function public.points_adjust(uuid, integer, text, timestamptz)                          to authenticated;
grant execute on function public.points_cancel_order(uuid, integer)                                       to authenticated;
grant execute on function public.points_find_user(text)                                                   to authenticated;
