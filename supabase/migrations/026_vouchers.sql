-- Migration 026 · vouchers (ваучери)  (Task 18.2, 2026-11-11)
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Paste → Run
-- Idempotent: safe to run twice. Run after 025 (exchanges, exchange_apply).
--
-- Safe to run before or after the code is merged: one new table and its
-- functions, no existing right changes. Until it runs, /admin/vouchers says the
-- migration is waiting.
--
-- The owner (2026-11-11), for the gift vouchers sold in the shop (the cards
-- vaucer-1000, vaucer-1500, vaucer-2000; a larger sum is several cards):
--   - a voucher has a number, who it is for or a phone, and a term of 12
--     months from the day it was bought; the vouchers out now too;
--   - redeemed like an exchange: the voucher's sale is deleted, the pieces
--     taken are recorded on the day the voucher was bought, and a top-up goes
--     on that same day;
--   - taking less than the voucher is worth, the rest is lost;
--   - in the shop only.
--
-- So a voucher is a number on one or more cards sold on one day. Its sale
-- stands, as revenue of that day, until it is redeemed; then the cards come
-- back to the drawer and the pieces take the sale's place on its day
-- (`exchange_apply`, kind 'voucher', 025). A voucher that runs out stays sold.
--
--   vouchers  one row per voucher: its number, cards, day, term, who it is
--             for, and how it ended (redeemed through an exchange row, or
--             cancelled by the admin).
--
-- Every write takes one lock first, so numbers are handed out one at a time
-- and a sale is never given two numbers.
--
-- Rights:
--   admin   read; sell; number an old sale; redeem (also past its term);
--           undo a redemption; cancel
--   staff   read; sell; number an old sale; redeem within the term
--   others  nothing

-- ---------------------------------------------------------------------------
-- Table
-- ---------------------------------------------------------------------------
create table if not exists public.vouchers (
  id            bigint generated always as identity primary key,
  -- Written on the card. Never handed out twice, cancelled ones included.
  number        integer not null unique,
  -- The day it was bought: its term runs from it, and the pieces taken for it
  -- are sold on it.
  sold_day      date not null,
  -- Valid up to and including this day.
  expires_on    date not null,
  -- Who it is for, or a phone.
  holder        text,
  -- [{product, name, size, price}]: one entry per card, its sale as recorded.
  cards         jsonb not null,
  amount        numeric(12,2) not null,
  -- True when voucher_sell recorded the cards' sale; false when a sale
  -- recorded elsewhere (an old voucher, Firebase) was given a number.
  sold_here     boolean not null default false,
  created_at    timestamptz not null default now(),
  created_by    text,
  exchange_id   bigint references public.exchanges(id),
  redeemed_at   timestamptz,
  redeemed_by   text,
  cancelled_at  timestamptz,
  cancelled_by  text,

  constraint vouchers_number   check (number > 0),
  constraint vouchers_cards    check (jsonb_typeof(cards) = 'array' and jsonb_array_length(cards) between 1 and 10),
  constraint vouchers_amount   check (amount > 0),
  constraint vouchers_holder   check (holder is null or length(holder) between 1 and 200),
  constraint vouchers_term     check (expires_on >= sold_day),
  constraint vouchers_redeemed check ((exchange_id is null) = (redeemed_at is null)),
  constraint vouchers_one_end  check (redeemed_at is null or cancelled_at is null)
);

create index if not exists vouchers_sold_day on public.vouchers (sold_day);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- The term: 12 months from the day it was bought.
create or replace function public.voucher_term(p_day date)
returns date
language sql immutable
set search_path = public
as $$
  select (p_day + interval '12 months')::date
$$;

-- One lock for every voucher write, then the next number.
create or replace function public.voucher_lock_and_number()
returns integer
language plpgsql
security definer
set search_path = public
as $$
begin
  perform pg_advisory_xact_lock(hashtext('public.vouchers'));
  return coalesce((select max(number) from public.vouchers), 0) + 1;
end;
$$;

-- Sales of a card on a day at a price still without a number: in sold[],
-- less the cards of vouchers still out.
create or replace function public.voucher_unnumbered(p_product text, p_day date, p_price numeric)
returns integer
language sql stable
set search_path = public
as $$
  select (select count(*)::integer
          from public.products p, jsonb_array_elements(coalesce(p.sold, '[]'::jsonb)) s
          where p.id = p_product
            and left(coalesce(s ->> 'soldDate', ''), 10) = p_day::text
            and case when jsonb_typeof(s -> 'price') in ('number', 'string')
                     then round((s ->> 'price')::numeric, 2) end = round(p_price, 2))
       - (select count(*)::integer
          from public.vouchers v, jsonb_array_elements(v.cards) c
          where v.redeemed_at is null and v.cancelled_at is null
            and v.sold_day = p_day
            and c ->> 'product' = p_product
            and round((c ->> 'price')::numeric, 2) = round(p_price, 2))
$$;

-- ---------------------------------------------------------------------------
-- Sell a voucher today (admin, staff): its cards leave the drawer and are
-- sold at their price, and it gets the next number.
--
-- p_cards   ["vaucer-2000", "vaucer-1500"]: one product id per card
-- p_holder  who it is for, or a phone (may be empty)
--
-- Refused, with the hint:
--   invalid  the list is malformed, or a card has no price
--   missing  a card does not exist
--   novoucher  a product that is not a voucher card
--   short    no such card left in the drawer (detail: product)
-- ---------------------------------------------------------------------------
create or replace function public.voucher_sell(p_cards jsonb, p_holder text default null)
returns public.vouchers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  text := nullif(auth.jwt() ->> 'email', '');
  v_today  date := (now() at time zone 'Europe/Skopje')::date;
  v_number integer;
  v_ids    text[];
  v_id     text;
  v_p      public.products;
  v_size   text;
  v_sizes  jsonb;
  v_stock  integer;
  v_cards  jsonb := '[]'::jsonb;
  v_n      integer;
  v_new    jsonb;
  v_v      public.vouchers;
begin
  if not public.is_back_office() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if jsonb_typeof(p_cards) is distinct from 'array'
     or jsonb_array_length(p_cards) not between 1 and 10
     or exists (select 1 from jsonb_array_elements(p_cards) e
                where jsonb_typeof(e) <> 'string' or length(e #>> '{}') not between 1 and 200) then
    raise exception 'bad cards' using errcode = '22023', hint = 'invalid';
  end if;
  v_number := public.voucher_lock_and_number();

  select array_agg(distinct e #>> '{}' order by e #>> '{}') into v_ids from jsonb_array_elements(p_cards) e;
  perform 1 from public.products where id = any(v_ids) order by id for update;
  if (select count(*) from public.products where id = any(v_ids)) <> cardinality(v_ids) then
    raise exception 'no such card' using errcode = 'P0001', hint = 'missing';
  end if;
  if exists (select 1 from public.products where id = any(v_ids) and category is distinct from 'vaucer') then
    raise exception 'not a voucher card' using errcode = 'P0001', hint = 'novoucher';
  end if;
  if exists (select 1 from public.products where id = any(v_ids) and not coalesce(price, 0) > 0) then
    raise exception 'a card without a price' using errcode = '22023', hint = 'invalid';
  end if;

  foreach v_id in array v_ids loop
    select * into v_p from public.products where id = v_id;
    v_n := (select count(*) from jsonb_array_elements(p_cards) e where e #>> '{}' = v_id);
    v_sizes := coalesce(v_p.sizes, '[]'::jsonb);
    v_stock := coalesce(v_p.stock, 0);
    -- A card has one size ("количина"), or none.
    v_size := coalesce((select btrim(coalesce(e ->> 'size', '')) from jsonb_array_elements(v_sizes) e limit 1), '');
    if jsonb_array_length(v_sizes) = 0 then
      if v_stock < v_n then
        raise exception 'no card left' using errcode = 'P0001', hint = 'short', detail = v_id;
      end if;
      v_stock := v_stock - v_n;
    else
      v_new := public.exchange_shelf(v_sizes, v_size, -v_n);
      if v_new is null then
        raise exception 'no card left' using errcode = 'P0001', hint = 'short', detail = v_id;
      end if;
      v_sizes := v_new;
      v_stock := (select coalesce(sum(greatest(0, coalesce((e ->> 'quantity')::numeric, 0))), 0)::integer
                  from jsonb_array_elements(v_sizes) e);
    end if;
    update public.products
    set sizes = v_sizes,
        stock = v_stock,
        sold = coalesce(sold, '[]'::jsonb) || (select jsonb_agg(jsonb_build_object(
                 'size', v_size, 'price', to_jsonb(v_p.price::float8), 'soldDate', v_today::text))
               from generate_series(1, v_n))
    where id = v_id;
  end loop;

  -- The cards in the order they were given.
  select jsonb_agg(jsonb_build_object(
           'product', p.id, 'name', p.name,
           'size', coalesce((select btrim(coalesce(z ->> 'size', '')) from jsonb_array_elements(coalesce(p.sizes, '[]'::jsonb)) z limit 1), ''),
           'price', round(p.price::numeric, 2)) order by t.i)
  into v_cards
  from jsonb_array_elements(p_cards) with ordinality t(e, i)
  join public.products p on p.id = t.e #>> '{}';

  insert into public.vouchers (number, sold_day, expires_on, holder, cards, amount, sold_here, created_by)
  values (v_number, v_today, public.voucher_term(v_today), nullif(btrim(coalesce(p_holder, '')), ''),
          v_cards, (select sum((c ->> 'price')::numeric) from jsonb_array_elements(v_cards) c), true, v_actor)
  returning * into v_v;

  insert into public.sales_ledger
    (occurred_at, channel, reason, product_id, product_name, product_category,
     size, qty, unit_price, unit_list_price, unit_cost, created_by, source)
  select (v_today::timestamp + interval '12 hours') at time zone 'UTC', 'store', 'sale',
         c ->> 'product', c ->> 'name', 'vaucer', c ->> 'size', 1,
         (c ->> 'price')::numeric, (c ->> 'price')::numeric, null, v_actor,
         'voucher:' || v_v.id
  from jsonb_array_elements(v_cards) c;

  return v_v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Give a number to a card sold earlier (admin, staff): the vouchers out
-- before this screen, or one sold in Firebase. The sale stays as it is.
--
-- Refused, with the hint:
--   invalid    malformed
--   missing    no such card
--   novoucher  not a voucher card
--   nosale     no sale of it on that day at that price without a number
-- ---------------------------------------------------------------------------
create or replace function public.voucher_number_sale(p_product text, p_day date, p_price numeric, p_holder text default null)
returns public.vouchers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  text := nullif(auth.jwt() ->> 'email', '');
  v_number integer;
  v_p      public.products;
  v_size   text;
  v_v      public.vouchers;
begin
  if not public.is_back_office() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if p_product is null or p_day is null or p_price is null or not p_price > 0 then
    raise exception 'bad sale' using errcode = '22023', hint = 'invalid';
  end if;
  v_number := public.voucher_lock_and_number();

  select * into v_p from public.products where id = p_product;
  if not found then
    raise exception 'no such card' using errcode = 'P0001', hint = 'missing';
  end if;
  if v_p.category is distinct from 'vaucer' then
    raise exception 'not a voucher card' using errcode = 'P0001', hint = 'novoucher';
  end if;
  if public.voucher_unnumbered(p_product, p_day, p_price) < 1 then
    raise exception 'no such sale without a number' using errcode = 'P0001', hint = 'nosale';
  end if;
  v_size := (select btrim(coalesce(s ->> 'size', ''))
             from jsonb_array_elements(coalesce(v_p.sold, '[]'::jsonb)) with ordinality t(s, i)
             where left(coalesce(s ->> 'soldDate', ''), 10) = p_day::text
               and case when jsonb_typeof(s -> 'price') in ('number', 'string')
                        then round((s ->> 'price')::numeric, 2) end = round(p_price, 2)
             order by i desc limit 1);

  insert into public.vouchers (number, sold_day, expires_on, holder, cards, amount, sold_here, created_by)
  values (v_number, p_day, public.voucher_term(p_day), nullif(btrim(coalesce(p_holder, '')), ''),
          jsonb_build_array(jsonb_build_object('product', v_p.id, 'name', v_p.name, 'size', v_size, 'price', round(p_price, 2))),
          round(p_price, 2), false, v_actor)
  returning * into v_v;
  return v_v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Redeem a voucher (admin, staff): its cards come back to the drawer and out
-- of sold[] and the ledger, the pieces taken are sold on the voucher's day
-- (exchange_apply, kind 'voucher'). Returns the exchange it made.
--
-- p_given  [{product, size, price}]: the pieces, price agreed today
--
-- Refused, with the hint (and exchange_apply's):
--   nothing   no such voucher
--   used      redeemed or cancelled already
--   expired   past its term (the admin may still redeem it)
-- ---------------------------------------------------------------------------
create or replace function public.voucher_redeem(p_id bigint, p_given jsonb, p_note text default null)
returns public.exchanges
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor text := nullif(auth.jwt() ->> 'email', '');
  v_today date := (now() at time zone 'Europe/Skopje')::date;
  v_v     public.vouchers;
  v_ex    public.exchanges;
  v_note  text;
begin
  if not public.is_back_office() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  perform public.voucher_lock_and_number();
  select * into v_v from public.vouchers where id = p_id for update;
  if not found then
    raise exception 'no such voucher' using errcode = 'P0001', hint = 'nothing';
  end if;
  if v_v.redeemed_at is not null or v_v.cancelled_at is not null then
    raise exception 'voucher used' using errcode = 'P0001', hint = 'used';
  end if;
  if v_today > v_v.expires_on and not public.is_admin() then
    raise exception 'voucher expired' using errcode = 'P0001', hint = 'expired';
  end if;

  v_note := 'Ваучер бр. ' || v_v.number || coalesce(' · ' || nullif(btrim(coalesce(p_note, '')), ''), '');
  select * into v_ex
  from public.exchange_apply(
    'voucher', v_v.sold_day,
    (select jsonb_agg(jsonb_build_object('product', c ->> 'product', 'size', c ->> 'size', 'price', (c ->> 'price')::numeric))
     from jsonb_array_elements(v_v.cards) c),
    p_given, v_note);

  update public.vouchers
  set exchange_id = v_ex.id, redeemed_at = now(), redeemed_by = v_actor
  where id = v_v.id;
  return v_ex;
end;
$$;

-- ---------------------------------------------------------------------------
-- Undo a redemption (admin): the pieces back on the shelf, the cards sold
-- again on the voucher's day, the voucher valid again (exchange_revert, 025).
--
-- Refused, with the hint (and exchange_revert's):
--   nothing  no such voucher
--   unused   not redeemed
-- ---------------------------------------------------------------------------
create or replace function public.voucher_undo(p_id bigint)
returns public.vouchers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_v  public.vouchers;
  v_ex public.exchanges;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  perform public.voucher_lock_and_number();
  select * into v_v from public.vouchers where id = p_id for update;
  if not found then
    raise exception 'no such voucher' using errcode = 'P0001', hint = 'nothing';
  end if;
  if v_v.exchange_id is null then
    raise exception 'not redeemed' using errcode = 'P0001', hint = 'unused';
  end if;
  select * into v_ex from public.exchange_revert(v_v.exchange_id);
  update public.vouchers
  set exchange_id = null, redeemed_at = null, redeemed_by = null
  where id = v_v.id
  returning * into v_v;
  return v_v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cancel a voucher that was not redeemed (admin): a mistake, or a test. Sold
-- here, its cards go back to the drawer and their sale leaves sold[] and the
-- ledger; a sale only numbered here stays sold and is without a number again.
-- The number is not handed out again.
--
-- Refused, with the hint:
--   nothing  no such voucher
--   used     redeemed or cancelled already
-- ---------------------------------------------------------------------------
create or replace function public.voucher_cancel(p_id bigint)
returns public.vouchers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor  text := nullif(auth.jwt() ->> 'email', '');
  v_v      public.vouchers;
  v_ids    text[];
  v_id     text;
  v_sizes  jsonb;
  v_stock  integer;
  v_sold   jsonb;
  v_c      jsonb;
  v_at     integer;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  perform public.voucher_lock_and_number();
  select * into v_v from public.vouchers where id = p_id for update;
  if not found then
    raise exception 'no such voucher' using errcode = 'P0001', hint = 'nothing';
  end if;
  if v_v.redeemed_at is not null or v_v.cancelled_at is not null then
    raise exception 'voucher used' using errcode = 'P0001', hint = 'used';
  end if;

  if v_v.sold_here then
    select array_agg(distinct c ->> 'product' order by c ->> 'product') into v_ids from jsonb_array_elements(v_v.cards) c;
    perform 1 from public.products where id = any(v_ids) order by id for update;
    foreach v_id in array v_ids loop
      select coalesce(sizes, '[]'::jsonb), coalesce(stock, 0), coalesce(sold, '[]'::jsonb)
      into v_sizes, v_stock, v_sold
      from public.products where id = v_id;
      if not found then
        continue;
      end if;
      -- A card whose sale is gone already (taken back in Firebase and synced)
      -- has nothing left to take back.
      for v_c in select c from jsonb_array_elements(v_v.cards) c where c ->> 'product' = v_id loop
        v_at := public.exchange_find_sale(v_sold, v_c ->> 'size', (v_c ->> 'price')::numeric, v_v.sold_day);
        if v_at is not null then
          v_sold := v_sold - v_at;
          if jsonb_array_length(v_sizes) = 0 and (v_c ->> 'size') = '' then
            v_stock := v_stock + 1;
          else
            v_sizes := public.exchange_shelf(v_sizes, v_c ->> 'size', 1);
          end if;
        end if;
      end loop;
      if jsonb_array_length(v_sizes) > 0 then
        v_stock := (select coalesce(sum(greatest(0, coalesce((e ->> 'quantity')::numeric, 0))), 0)::integer
                    from jsonb_array_elements(v_sizes) e);
      end if;
      update public.products set sizes = v_sizes, stock = v_stock, sold = v_sold where id = v_id;
    end loop;
    delete from public.sales_ledger where source = 'voucher:' || v_v.id;
  end if;

  update public.vouchers
  set cancelled_at = now(), cancelled_by = v_actor
  where id = v_v.id
  returning * into v_v;
  return v_v;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rights: read for the back office; every write through the functions above.
-- ---------------------------------------------------------------------------
alter table public.vouchers enable row level security;

drop policy if exists "vouchers: back office read" on public.vouchers;
create policy "vouchers: back office read" on public.vouchers for select to authenticated
  using (public.is_back_office());

revoke all on public.vouchers from anon, authenticated;
grant select on public.vouchers to authenticated;

revoke all on function public.voucher_lock_and_number()                         from public, anon, authenticated;
revoke all on function public.voucher_unnumbered(text, date, numeric)           from public, anon, authenticated;
revoke all on function public.voucher_sell(jsonb, text)                         from public, anon;
revoke all on function public.voucher_number_sale(text, date, numeric, text)    from public, anon;
revoke all on function public.voucher_redeem(bigint, jsonb, text)               from public, anon;
revoke all on function public.voucher_undo(bigint)                              from public, anon;
revoke all on function public.voucher_cancel(bigint)                            from public, anon;
grant execute on function public.voucher_sell(jsonb, text)                      to authenticated;
grant execute on function public.voucher_number_sale(text, date, numeric, text) to authenticated;
grant execute on function public.voucher_redeem(bigint, jsonb, text)            to authenticated;
grant execute on function public.voucher_undo(bigint)                           to authenticated;
grant execute on function public.voucher_cancel(bigint)                         to authenticated;
