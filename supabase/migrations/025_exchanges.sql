-- Migration 025 · exchanges (замена)  (Task 18.1, 2026-11-10 / 2026-11-12)
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Paste → Run
-- Idempotent: safe to run twice. Run after 009 (is_back_office, is_admin).
--
-- Safe to run before or after the code is merged: one new table and its
-- functions, no existing right changes. Until it runs, /admin/exchange says the
-- migration is waiting.
--
-- The owner (2026-11-10): the warehouse and the admin make an exchange. What
-- the customer bought comes back to the shelf, and the new pieces are recorded
-- as sold on the day the returned one was bought; one piece may be exchanged
-- for two. No money is paid back, the customer may only pay the difference.
-- The owner (2026-11-12): the top-up goes to the day of the purchase too, so
-- that no new piece looks sold at a discount.
--
-- So the returned piece's sale leaves `sold[]` and the ledger, and the new
-- pieces enter both on the purchase day, each at the price agreed for it: the
-- top-up is inside those prices. When the new pieces cost less, nothing is
-- paid back: what was paid is spread over them by their prices, so the
-- purchase day keeps it (D-047).
--
-- One transaction, every product row locked: the shelf, `sold[]` and the
-- ledger move together or not at all. Each product's updated_at moves with it
-- (its trigger), so every compare-and-set in stock.ts that read the old row
-- retries (D-013).
--
--   exchanges  one row per exchange: what came back, what went out and at
--              what price, the top-up. An admin can undo one while the new
--              pieces are still recorded as sold and the returned ones still
--              on the shelf.
--
-- A voucher redeemed (026) is made the same way, by the same function
-- (`exchange_apply`, kind 'voucher'): its card comes back like a returned piece.
--
-- Rights:
--   admin   read; make; undo
--   staff   read; make
--   others  nothing
-- Nothing here carries a cost; the ledger's own trigger fills it (008).

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table if not exists public.exchanges (
  id              bigint generated always as identity primary key,
  made_at         timestamptz not null default now(),
  made_by         text,
  -- 'exchange', or 'voucher' when a voucher's card is what came back (026).
  kind            text not null default 'exchange',
  -- The day the returned pieces were bought: the new ones are sold on it.
  purchase_day    date not null,
  -- [{product, name, category, size, price}]: price is what was paid.
  returned        jsonb not null,
  -- [{product, name, category, size, agreed, price, list}]: agreed is the
  -- price asked for it today, price what it is booked at, list its tag price.
  given           jsonb not null,
  returned_total  numeric(12,2) not null,
  given_total     numeric(12,2) not null,
  -- Paid at the exchange, booked inside the new pieces' prices on the
  -- purchase day. Never negative: no money is paid back.
  top_up          numeric(12,2) not null default 0,
  -- Where the returned pieces were sold: an online order's pieces stay its.
  channel         text not null default 'store',
  order_id        uuid,
  order_number    text,
  note            text,
  undone_at       timestamptz,
  undone_by       text,

  constraint exchanges_returned check (jsonb_typeof(returned) = 'array'),
  constraint exchanges_given    check (jsonb_typeof(given) = 'array'),
  constraint exchanges_kind     check (kind in ('exchange', 'voucher')),
  constraint exchanges_top_up   check (top_up >= 0),
  constraint exchanges_channel  check (channel in ('store', 'online'))
);

create index if not exists exchanges_made_at on public.exchanges (made_at desc);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- A list as exchange_make accepts it: 1 to 20 pieces, each a product id, a
-- size (empty for a product without sizes) and a price from 0 to a million;
-- with p_paid, above 0.
create or replace function public.exchange_valid(p jsonb, p_paid boolean)
returns boolean
language sql immutable
set search_path = public
as $$
  select jsonb_typeof(p) = 'array'
     and jsonb_array_length(p) between 1 and 20
     and not exists (
       select 1
       from jsonb_array_elements(p) e,
            lateral (select case when jsonb_typeof(e -> 'price') = 'number'
                                 then (e ->> 'price')::numeric end as price) x
       where jsonb_typeof(e) <> 'object'
          or coalesce(jsonb_typeof(e -> 'product'), '') <> 'string'
          or length(e ->> 'product') not between 1 and 200
          or coalesce(jsonb_typeof(e -> 'size'), 'null') not in ('string', 'null')
          or length(coalesce(e ->> 'size', '')) > 20
          or x.price is null
          or x.price < 0
          or x.price > 1000000
          or (p_paid and x.price <= 0)
     )
$$;

-- One size of a shelf moved by p_change, found by its trimmed name. A size the
-- shelf does not have is added when something comes back. Null when the size
-- would go below zero: the piece is not there.
create or replace function public.exchange_shelf(p_sizes jsonb, p_size text, p_change integer)
returns jsonb
language plpgsql immutable
set search_path = public
as $$
declare
  v_at integer;
  v_q  integer;
begin
  select i - 1, greatest(0, coalesce((e ->> 'quantity')::numeric, 0))::integer
  into v_at, v_q
  from jsonb_array_elements(coalesce(p_sizes, '[]'::jsonb)) with ordinality t(e, i)
  where btrim(coalesce(e ->> 'size', '')) = p_size
  order by i
  limit 1;

  if v_at is null then
    if p_change < 0 then
      return null;
    end if;
    return coalesce(p_sizes, '[]'::jsonb) || jsonb_build_array(jsonb_build_object('size', p_size, 'quantity', p_change));
  end if;
  if v_q + p_change < 0 then
    return null;
  end if;
  return jsonb_set(p_sizes, array[v_at::text, 'quantity'], to_jsonb(v_q + p_change));
end;
$$;

-- The index of one sale in `sold[]` with this size, price and day, the last
-- one recorded; null when there is none.
create or replace function public.exchange_find_sale(p_sold jsonb, p_size text, p_price numeric, p_day date)
returns integer
language sql immutable
set search_path = public
as $$
  select (i - 1)::integer
  from jsonb_array_elements(coalesce(p_sold, '[]'::jsonb)) with ordinality t(s, i)
  where btrim(coalesce(s ->> 'size', '')) = p_size
    and case when jsonb_typeof(s -> 'price') in ('number', 'string')
             then round((s ->> 'price')::numeric, 2) end = round(p_price, 2)
    and left(coalesce(s ->> 'soldDate', ''), 10) = p_day::text
  order by i desc
  limit 1
$$;

-- The new pieces ([{..., agreed}]) with `price` set: p_total spread over them
-- by their agreed prices, largest remainder first. In whole denars when
-- p_total is whole and no piece comes out at nothing; otherwise in cents (a
-- piece can still come out at nothing only when p_total is a few denars).
create or replace function public.exchange_spread(p_given jsonb, p_total numeric)
returns jsonb
language plpgsql immutable
set search_path = public
as $$
declare
  v_sum  numeric;
  v_unit numeric;
  v_out  jsonb;
begin
  select sum((e ->> 'agreed')::numeric) into v_sum from jsonb_array_elements(p_given) e;
  foreach v_unit in array case when p_total = trunc(p_total) then array[1, 0.01]::numeric[] else array[0.01]::numeric[] end loop
    with s as (
      select i, e,
             floor((e ->> 'agreed')::numeric * (p_total / v_unit) / v_sum) as base,
             mod((e ->> 'agreed')::numeric * (p_total / v_unit), v_sum) as rest
      from jsonb_array_elements(p_given) with ordinality t(e, i)
    ), r as (
      select s.*, row_number() over (order by rest desc, i) as rk,
             (p_total / v_unit) - sum(base) over () as left_over
      from s
    )
    select jsonb_agg(e || jsonb_build_object('price', (base + case when rk <= left_over then 1 else 0 end) * v_unit) order by i)
    into v_out
    from r;
    exit when not exists (select 1 from jsonb_array_elements(v_out) e where (e ->> 'price')::numeric = 0);
  end loop;
  return v_out;
end;
$$;

-- ---------------------------------------------------------------------------
-- The exchange itself, for exchange_make and voucher_redeem (026). Called by
-- them only: no role may call it directly.
--
-- p_kind      'exchange': no voucher anywhere in it.
--             'voucher': what comes back is a voucher's cards, no voucher goes
--             out (026).
--             Booked the same either way: the new pieces on p_day at their
--             agreed prices, the top-up inside them (the owner, 2026-11-11
--             for vouchers, 2026-11-12 for exchanges).
-- p_day       the day the returned pieces were bought; every one of them
-- p_returned  [{product, size, price}]: one entry per piece, price as sold
-- p_given     [{product, size, price}]: one entry per piece, price agreed today
--
-- Refused, with the hint the screen reads:
--   day      the day is missing or in the future
--   invalid  a list is malformed, or a returned piece was not paid for
--   missing  a product does not exist
--   voucher  a voucher where none may be (vouchers are redeemed, not exchanged)
--   nosale   a returned piece has no such sale on that day (detail: product size)
--   short    a new piece is not on the shelf (detail: product size)
-- ---------------------------------------------------------------------------
create or replace function public.exchange_apply(
  p_kind     text,
  p_day      date,
  p_returned jsonb,
  p_given    jsonb,
  p_note     text
) returns public.exchanges
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor    text := nullif(auth.jwt() ->> 'email', '');
  v_today    date := (now() at time zone 'Europe/Skopje')::date;
  v_ret      jsonb;
  v_giv      jsonb;
  v_rt       numeric;
  v_gt       numeric;
  v_top      numeric;
  v_ids      text[];
  v_id       text;
  v_sizes    jsonb;
  v_stock    integer;
  v_sold     jsonb;
  v_new      jsonb;
  v_e        jsonb;
  v_size     text;
  v_at       integer;
  v_lid      uuid;
  v_lorder   uuid;
  v_lnumber  text;
  v_order    uuid;
  v_number   text;
  v_same     boolean := true;
  v_first    boolean := true;
  v_removed  integer := 0;
  v_channel  text := 'store';
  v_ex       public.exchanges;
begin
  if not public.is_back_office() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_kind is null or p_kind not in ('exchange', 'voucher') then
    raise exception 'bad kind' using errcode = '22023', hint = 'invalid';
  end if;
  if p_day is null or p_day > v_today then
    raise exception 'bad purchase day' using errcode = '22023', hint = 'day';
  end if;
  if not (public.exchange_valid(p_returned, true) and public.exchange_valid(p_given, true)) then
    raise exception 'bad exchange' using errcode = '22023', hint = 'invalid';
  end if;

  -- Every product in it, locked in one order so two exchanges cannot deadlock.
  select array_agg(distinct x.id order by x.id) into v_ids
  from (select e ->> 'product' as id from jsonb_array_elements(p_returned) e
        union all
        select e ->> 'product' from jsonb_array_elements(p_given) e) x;
  perform 1 from public.products where id = any(v_ids) order by id for update;
  if (select count(*) from public.products where id = any(v_ids)) <> cardinality(v_ids) then
    raise exception 'no such product' using errcode = 'P0001', hint = 'missing';
  end if;
  if exists (select 1 from jsonb_array_elements(p_given) e join public.products p on p.id = e ->> 'product'
             where p.category = 'vaucer')
     or (p_kind = 'exchange' and exists (
             select 1 from jsonb_array_elements(p_returned) e join public.products p on p.id = e ->> 'product'
             where p.category = 'vaucer')) then
    raise exception 'a voucher is not exchanged' using errcode = 'P0001', hint = 'voucher';
  end if;
  if p_kind = 'voucher' and exists (
       select 1 from jsonb_array_elements(p_returned) e join public.products p on p.id = e ->> 'product'
       where p.category is distinct from 'vaucer') then
    raise exception 'only vouchers come back here' using errcode = '22023', hint = 'invalid';
  end if;

  -- The lists as they are kept: trimmed sizes, prices to the cent, names.
  select jsonb_agg(jsonb_build_object(
           'product', p.id, 'name', p.name, 'category', p.category,
           'size', btrim(coalesce(t.e ->> 'size', '')),
           'price', round((t.e ->> 'price')::numeric, 2)) order by t.i),
         sum(round((t.e ->> 'price')::numeric, 2))
  into v_ret, v_rt
  from jsonb_array_elements(p_returned) with ordinality t(e, i)
  join public.products p on p.id = t.e ->> 'product';

  select jsonb_agg(jsonb_build_object(
           'product', p.id, 'name', p.name, 'category', p.category,
           'size', btrim(coalesce(t.e ->> 'size', '')),
           'agreed', round((t.e ->> 'price')::numeric, 2),
           'list', coalesce(p.price, 0)) order by t.i),
         sum(round((t.e ->> 'price')::numeric, 2))
  into v_giv, v_gt
  from jsonb_array_elements(p_given) with ordinality t(e, i)
  join public.products p on p.id = t.e ->> 'product';

  -- What each new piece is booked at: its agreed price, the top-up inside
  -- them, so none looks sold at a discount. When they cost less, nothing comes
  -- back: what was paid is spread over them by price, and the purchase day
  -- keeps it.
  v_top := greatest(v_gt - v_rt, 0);
  if v_gt < v_rt then
    v_giv := public.exchange_spread(v_giv, v_rt);
  else
    select jsonb_agg(e || jsonb_build_object('price', e -> 'agreed') order by i)
    into v_giv
    from jsonb_array_elements(v_giv) with ordinality t(e, i);
  end if;

  -- Each product once: what comes back first, then what goes out.
  foreach v_id in array v_ids loop
    select coalesce(sizes, '[]'::jsonb), coalesce(stock, 0), coalesce(sold, '[]'::jsonb)
    into v_sizes, v_stock, v_sold
    from public.products where id = v_id;

    for v_e in select e from jsonb_array_elements(v_ret) e where e ->> 'product' = v_id loop
      v_size := v_e ->> 'size';
      v_at := public.exchange_find_sale(v_sold, v_size, (v_e ->> 'price')::numeric, p_day);
      if v_at is null then
        raise exception 'no such sale' using errcode = 'P0001', hint = 'nosale', detail = v_id || ' ' || v_size;
      end if;
      v_sold := v_sold - v_at;
      if jsonb_array_length(v_sizes) = 0 and v_size = '' then
        v_stock := v_stock + 1;
      else
        v_sizes := public.exchange_shelf(v_sizes, v_size, 1);
      end if;
    end loop;

    for v_e in select e from jsonb_array_elements(v_giv) e where e ->> 'product' = v_id loop
      v_size := v_e ->> 'size';
      if jsonb_array_length(v_sizes) = 0 and v_size = '' then
        if v_stock < 1 then
          raise exception 'not on the shelf' using errcode = 'P0001', hint = 'short', detail = v_id || ' ' || v_size;
        end if;
        v_stock := v_stock - 1;
      else
        v_new := public.exchange_shelf(v_sizes, v_size, -1);
        if v_new is null then
          raise exception 'not on the shelf' using errcode = 'P0001', hint = 'short', detail = v_id || ' ' || v_size;
        end if;
        v_sizes := v_new;
      end if;
      v_sold := v_sold || jsonb_build_array(jsonb_build_object(
        'size', v_size, 'price', to_jsonb((v_e ->> 'price')::float8), 'soldDate', p_day::text));
    end loop;

    if jsonb_array_length(v_sizes) > 0 then
      v_stock := (select coalesce(sum(greatest(0, coalesce((e ->> 'quantity')::numeric, 0))), 0)::integer
                  from jsonb_array_elements(v_sizes) e);
    end if;
    update public.products set sizes = v_sizes, stock = v_stock, sold = v_sold where id = v_id;
  end loop;

  -- The returned sales leave the ledger, one row each, found as
  -- ledger_refund_one finds it: a shop row before an online one, the newest.
  -- A sale the ledger lacks is no reason to refuse: ledger:sync reports it.
  for v_e in select e from jsonb_array_elements(v_ret) e loop
    v_lid := null;
    select id, order_id, order_number into v_lid, v_lorder, v_lnumber
    from public.sales_ledger
    where product_id = v_e ->> 'product'
      and btrim(coalesce(size, '')) = v_e ->> 'size'
      and unit_price = (v_e ->> 'price')::numeric
      and occurred_at >= (p_day::timestamp at time zone 'UTC')
      and occurred_at <  ((p_day + 1)::timestamp at time zone 'UTC')
    order by (order_id is null) desc, created_at desc
    limit 1;
    if v_lid is not null then
      delete from public.sales_ledger where id = v_lid;
      v_removed := v_removed + 1;
      if v_first then
        v_order := v_lorder;
        v_number := v_lnumber;
        v_first := false;
      elsif v_lorder is distinct from v_order then
        v_same := false;
      end if;
    end if;
  end loop;
  -- Pieces bought in one online order are exchanged within it.
  if v_removed = jsonb_array_length(v_ret) and v_same and v_order is not null then
    v_channel := 'online';
  else
    v_order := null;
    v_number := null;
  end if;

  insert into public.exchanges
    (made_by, kind, purchase_day, returned, given, returned_total, given_total, top_up,
     channel, order_id, order_number, note)
  values
    (v_actor, p_kind, p_day, v_ret, v_giv, v_rt, v_gt, v_top,
     v_channel, v_order, v_number, nullif(btrim(coalesce(p_note, '')), ''))
  returning * into v_ex;

  -- The new pieces enter the ledger on the purchase day, at noon UTC like
  -- every shop sale (useInStoreSales.ts).
  insert into public.sales_ledger
    (occurred_at, channel, reason, order_id, order_number, product_id, product_name, product_category,
     size, qty, unit_price, unit_list_price, unit_cost, created_by, source)
  select (p_day::timestamp + interval '12 hours') at time zone 'UTC', v_channel, 'sale', v_order, v_number,
         e ->> 'product', e ->> 'name', e ->> 'category',
         e ->> 'size', 1, (e ->> 'price')::numeric, (e ->> 'list')::numeric, null, v_actor,
         'exchange:' || v_ex.id
  from jsonb_array_elements(v_giv) e;

  return v_ex;
end;
$$;

-- ---------------------------------------------------------------------------
-- Make an exchange (admin, staff). Refused as exchange_apply says; a voucher
-- is never in it.
-- ---------------------------------------------------------------------------
create or replace function public.exchange_make(
  p_day      date,
  p_returned jsonb,
  p_given    jsonb,
  p_note     text default null
) returns public.exchanges
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ex public.exchanges;
begin
  if not public.is_back_office() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_ex from public.exchange_apply('exchange', p_day, p_returned, p_given, p_note);
  return v_ex;
end;
$$;

-- ---------------------------------------------------------------------------
-- Take an exchange back: the new pieces back on the shelf, the returned ones
-- sold again on their day at their price, so that day is as it was. For
-- exchange_undo and voucher_undo (026) only.
--
-- Refused, with the hint:
--   nothing  no such exchange
--   undone   undone already
--   missing  a product has been deleted since
--   gone     a new piece's sale is no longer in sold[] (refunded or changed)
--   resold   a returned piece is no longer on the shelf (sold again)
-- ---------------------------------------------------------------------------
create or replace function public.exchange_revert(p_id bigint)
returns public.exchanges
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  text := nullif(auth.jwt() ->> 'email', '');
  v_ex     public.exchanges;
  v_ids    text[];
  v_id     text;
  v_sizes  jsonb;
  v_stock  integer;
  v_sold   jsonb;
  v_new    jsonb;
  v_e      jsonb;
  v_size   text;
  v_at     integer;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select * into v_ex from public.exchanges where id = p_id for update;
  if not found then
    raise exception 'no such exchange' using errcode = 'P0001', hint = 'nothing';
  end if;
  if v_ex.undone_at is not null then
    raise exception 'undone already' using errcode = 'P0001', hint = 'undone';
  end if;

  select array_agg(distinct x.id order by x.id) into v_ids
  from (select e ->> 'product' as id from jsonb_array_elements(v_ex.returned) e
        union all
        select e ->> 'product' from jsonb_array_elements(v_ex.given) e) x;
  perform 1 from public.products where id = any(v_ids) order by id for update;
  if (select count(*) from public.products where id = any(v_ids)) <> cardinality(v_ids) then
    raise exception 'no such product' using errcode = 'P0001', hint = 'missing';
  end if;

  foreach v_id in array v_ids loop
    select coalesce(sizes, '[]'::jsonb), coalesce(stock, 0), coalesce(sold, '[]'::jsonb)
    into v_sizes, v_stock, v_sold
    from public.products where id = v_id;

    for v_e in select e from jsonb_array_elements(v_ex.given) e where e ->> 'product' = v_id loop
      v_size := v_e ->> 'size';
      v_at := public.exchange_find_sale(v_sold, v_size, (v_e ->> 'price')::numeric, v_ex.purchase_day);
      if v_at is null then
        raise exception 'the new piece is not sold any more' using errcode = 'P0001', hint = 'gone', detail = v_id || ' ' || v_size;
      end if;
      v_sold := v_sold - v_at;
      if jsonb_array_length(v_sizes) = 0 and v_size = '' then
        v_stock := v_stock + 1;
      else
        v_sizes := public.exchange_shelf(v_sizes, v_size, 1);
      end if;
    end loop;

    for v_e in select e from jsonb_array_elements(v_ex.returned) e where e ->> 'product' = v_id loop
      v_size := v_e ->> 'size';
      if jsonb_array_length(v_sizes) = 0 and v_size = '' then
        if v_stock < 1 then
          raise exception 'the returned piece is gone' using errcode = 'P0001', hint = 'resold', detail = v_id || ' ' || v_size;
        end if;
        v_stock := v_stock - 1;
      else
        v_new := public.exchange_shelf(v_sizes, v_size, -1);
        if v_new is null then
          raise exception 'the returned piece is gone' using errcode = 'P0001', hint = 'resold', detail = v_id || ' ' || v_size;
        end if;
        v_sizes := v_new;
      end if;
      v_sold := v_sold || jsonb_build_array(jsonb_build_object(
        'size', v_size, 'price', to_jsonb((v_e ->> 'price')::float8), 'soldDate', v_ex.purchase_day::text));
    end loop;

    if jsonb_array_length(v_sizes) > 0 then
      v_stock := (select coalesce(sum(greatest(0, coalesce((e ->> 'quantity')::numeric, 0))), 0)::integer
                  from jsonb_array_elements(v_sizes) e);
    end if;
    update public.products set sizes = v_sizes, stock = v_stock, sold = v_sold where id = v_id;
  end loop;

  delete from public.sales_ledger where source = 'exchange:' || v_ex.id;
  insert into public.sales_ledger
    (occurred_at, channel, reason, order_id, order_number, product_id, product_name, product_category,
     size, qty, unit_price, unit_list_price, unit_cost, created_by, source)
  select (v_ex.purchase_day::timestamp + interval '12 hours') at time zone 'UTC', v_ex.channel,
         case when (e ->> 'price')::numeric > 0 then 'sale' else 'personal' end,
         v_ex.order_id, v_ex.order_number,
         e ->> 'product', e ->> 'name', e ->> 'category',
         e ->> 'size', 1, (e ->> 'price')::numeric, p.price, null, v_actor,
         'exchange-undo:' || v_ex.id
  from jsonb_array_elements(v_ex.returned) e
  left join public.products p on p.id = e ->> 'product';

  update public.exchanges set undone_at = now(), undone_by = v_actor where id = v_ex.id
  returning * into v_ex;
  return v_ex;
end;
$$;

-- ---------------------------------------------------------------------------
-- Undo an exchange (admin). A redeemed voucher is undone from its own screen
-- (voucher_undo, 026), which puts the voucher back too: refused here with the
-- hint 'redeemed'.
-- ---------------------------------------------------------------------------
create or replace function public.exchange_undo(p_id bigint)
returns public.exchanges
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ex public.exchanges;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if exists (select 1 from public.exchanges where id = p_id and kind = 'voucher') then
    raise exception 'a voucher is undone from vouchers' using errcode = 'P0001', hint = 'redeemed';
  end if;
  select * into v_ex from public.exchange_revert(p_id);
  return v_ex;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rights: read for the back office; every write through the functions above,
-- so the shelf, sold[] and the ledger never part. exchange_apply and
-- exchange_revert are reached only through them.
-- ---------------------------------------------------------------------------
alter table public.exchanges enable row level security;

drop policy if exists "exchanges: back office read" on public.exchanges;
create policy "exchanges: back office read" on public.exchanges for select to authenticated
  using (public.is_back_office());

revoke all on public.exchanges from anon, authenticated;
grant select on public.exchanges to authenticated;

revoke all on function public.exchange_apply(text, date, jsonb, jsonb, text) from public, anon, authenticated;
revoke all on function public.exchange_revert(bigint)                        from public, anon, authenticated;
revoke all on function public.exchange_make(date, jsonb, jsonb, text)        from public, anon;
revoke all on function public.exchange_undo(bigint)                          from public, anon;
grant execute on function public.exchange_make(date, jsonb, jsonb, text) to authenticated;
grant execute on function public.exchange_undo(bigint)                   to authenticated;
