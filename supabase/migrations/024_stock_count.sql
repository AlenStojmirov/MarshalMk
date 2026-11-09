-- Migration 024 · stock count (попис)  (Tasks 17.2–17.3, 2026-11-09)
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Paste → Run
-- Idempotent: safe to run twice. Run after 009 (is_back_office) and 008
-- (is_admin).
--
-- Safe to run before or after the code is merged: two new tables and their
-- functions, no existing right changes. Until it runs, /admin/stock-count says
-- the migration is waiting.
--
-- The owner (2026-11-09): the warehouse goes product by product, confirms the
-- numbers that are right and corrects the ones that are not; the admin then
-- sees which products are wrong and fixes them. A count is finished when every
-- product on its list has been counted.
--
--   stock_counts       one row per count. At most one open at a time.
--   stock_count_lines  one row per product in a count. The list is every
--                      product with stock when the count starts; a product
--                      found on the shelf that is not on it is added when it
--                      is counted (`listed` false).
--
-- A line keeps what the shelf should have held when it was counted
-- (`expected`: the sizes, plus what open orders hold that has not left the
-- shop) and what was counted (`counted`). Both are [{size, quantity}].
--
-- A correction is the difference, counted − expected, added to the shelf as it
-- is when the admin applies it, never the counted number written over it:
-- whatever sold between the count and the fix stays sold (D-046).
--
-- Rights:
--   admin   everything: start, apply, dismiss, recount, close, cancel
--   staff   read; record a count through stock_count_record() only
--   others  nothing
-- Nothing here carries a cost.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table if not exists public.stock_counts (
  id          bigint generated always as identity primary key,
  started_at  timestamptz not null default now(),
  started_by  text,
  note        text,
  closed_at   timestamptz,
  closed_by   text
);

-- One count at a time: two open counts would split the shop's answer in two.
create unique index if not exists stock_counts_one_open
  on public.stock_counts ((true)) where closed_at is null;

create table if not exists public.stock_count_lines (
  count_id     bigint not null references public.stock_counts(id) on delete cascade,
  product_id   text   not null references public.products(id) on delete cascade,
  -- On the list when the count started; false = found on the shelf, added then.
  listed       boolean not null default true,
  expected     jsonb,
  counted      jsonb,
  -- counted = expected, size by size. Set with the count.
  matches      boolean,
  counted_at   timestamptz,
  counted_by   text,
  -- Only a line that does not match is resolved: applied to the shelf, or left.
  resolution   text,
  -- What applying changed on the shelf, size by size: [{size, change}].
  applied      jsonb,
  resolved_at  timestamptz,
  resolved_by  text,

  primary key (count_id, product_id),
  constraint stock_count_lines_resolution check (resolution in ('applied', 'dismissed')),
  constraint stock_count_lines_expected check (expected is null or jsonb_typeof(expected) = 'array'),
  constraint stock_count_lines_counted  check (counted  is null or jsonb_typeof(counted)  = 'array')
);

create index if not exists stock_count_lines_product on public.stock_count_lines (product_id);

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- Who is doing it, as the back office knows them. Null in the SQL editor.
create or replace function public.stock_count_actor()
returns text
language sql stable
set search_path = public
as $$
  select nullif(auth.jwt() ->> 'email', '')
$$;

-- [{size, quantity}] → {size: quantity}: sizes trimmed, the same size added up,
-- zeros dropped. Two counts are the same when these are equal.
create or replace function public.stock_count_map(p jsonb)
returns jsonb
language sql immutable
set search_path = public
as $$
  select coalesce(jsonb_object_agg(size, qty), '{}'::jsonb)
  from (
    select btrim(coalesce(e ->> 'size', '')) as size,
           sum(coalesce((e ->> 'quantity')::numeric, 0)) as qty
    from jsonb_array_elements(coalesce(p, '[]'::jsonb)) e
    group by 1
  ) s
  where qty <> 0
$$;

-- A count as the functions accept it: an array of at most 40 sizes, each a
-- whole number from 0 to 999.
create or replace function public.stock_count_valid(p jsonb)
returns boolean
language sql immutable
set search_path = public
as $$
  select jsonb_typeof(p) = 'array'
     and jsonb_array_length(p) <= 40
     and not exists (
       select 1 from jsonb_array_elements(p) e
       where jsonb_typeof(e) <> 'object'
          or jsonb_typeof(e -> 'quantity') <> 'number'
          or (e ->> 'quantity')::numeric <> trunc((e ->> 'quantity')::numeric)
          or (e ->> 'quantity')::numeric < 0
          or (e ->> 'quantity')::numeric > 999
          or length(coalesce(e ->> 'size', '')) > 20
     )
$$;

-- ---------------------------------------------------------------------------
-- Start (admin): the list is every product with stock right now.
-- ---------------------------------------------------------------------------
create or replace function public.stock_count_start(p_note text default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if exists (select 1 from public.stock_counts where closed_at is null) then
    raise exception 'a count is already open' using errcode = 'P0001', hint = 'open';
  end if;

  insert into public.stock_counts (started_by, note)
  values (public.stock_count_actor(), nullif(btrim(coalesce(p_note, '')), ''))
  returning id into v_id;

  insert into public.stock_count_lines (count_id, product_id, listed)
  select v_id, p.id, true
  from public.products p
  where coalesce(p.stock, 0) > 0;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Record a count (admin, staff).
--
-- p_seen is the product's updated_at when the counter opened it. If the shelf
-- moved since (a sale, an order, an edit), the numbers they confirmed are no
-- longer the system's, and the count is refused so they look again — the same
-- rule as the stock count in the product form (D-013).
-- A line can be counted again until the admin has resolved it.
-- ---------------------------------------------------------------------------
create or replace function public.stock_count_record(
  p_count    bigint,
  p_product  text,
  p_seen     timestamptz,
  p_expected jsonb,
  p_counted  jsonb
) returns public.stock_count_lines
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated timestamptz;
  v_line    public.stock_count_lines;
begin
  if not public.is_back_office() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.stock_counts where id = p_count and closed_at is null) then
    raise exception 'the count is closed' using errcode = 'P0001', hint = 'closed';
  end if;
  if not (public.stock_count_valid(p_expected) and public.stock_count_valid(p_counted)) then
    raise exception 'bad count' using errcode = '22023', hint = 'invalid';
  end if;

  select updated_at into v_updated from public.products where id = p_product;
  if not found then
    raise exception 'no such product' using errcode = 'P0001', hint = 'missing';
  end if;
  if v_updated is distinct from p_seen then
    raise exception 'the shelf changed' using errcode = 'P0001', hint = 'stale';
  end if;

  insert into public.stock_count_lines as l
    (count_id, product_id, listed, expected, counted, matches, counted_at, counted_by)
  values
    (p_count, p_product, false, p_expected, p_counted,
     public.stock_count_map(p_expected) = public.stock_count_map(p_counted),
     now(), public.stock_count_actor())
  on conflict (count_id, product_id) do update
    set expected   = excluded.expected,
        counted    = excluded.counted,
        matches    = excluded.matches,
        counted_at = excluded.counted_at,
        counted_by = excluded.counted_by
    where l.resolution is null
  returning * into v_line;

  if v_line.count_id is null then
    raise exception 'already resolved' using errcode = 'P0001', hint = 'resolved';
  end if;
  return v_line;
end;
$$;

-- ---------------------------------------------------------------------------
-- Apply a difference to the shelf (admin).
--
-- In one transaction, under a lock on the product: add counted − expected to
-- each size as it is now (never below zero), and mark the line applied with
-- what actually changed. The product's updated_at moves with it (its
-- trigger), so a screen holding the old numbers retries (stock.ts, D-013).
-- ---------------------------------------------------------------------------
create or replace function public.stock_count_apply(p_count bigint, p_product text)
returns public.stock_count_lines
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line    public.stock_count_lines;
  v_sizes   jsonb;
  v_stock   integer;
  v_delta   jsonb;
  v_new     jsonb := '[]'::jsonb;
  v_applied jsonb := '[]'::jsonb;
  v_seen    text[] := '{}';
  v_e       jsonb;
  v_size    text;
  v_old     integer;
  v_q       integer;
  v_k       text;
  v_change  integer;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if not exists (select 1 from public.stock_counts where id = p_count and closed_at is null) then
    raise exception 'the count is closed' using errcode = 'P0001', hint = 'closed';
  end if;

  select * into v_line from public.stock_count_lines
  where count_id = p_count and product_id = p_product
  for update;
  if not found or v_line.counted_at is null then
    raise exception 'not counted' using errcode = 'P0001', hint = 'uncounted';
  end if;
  if v_line.resolution is not null then
    raise exception 'already resolved' using errcode = 'P0001', hint = 'resolved';
  end if;

  select coalesce(sizes, '[]'::jsonb), coalesce(stock, 0) into v_sizes, v_stock
  from public.products where id = p_product
  for update;
  if not found then
    raise exception 'no such product' using errcode = 'P0001', hint = 'missing';
  end if;

  -- counted − expected, per trimmed size, without the zeros.
  select coalesce(jsonb_object_agg(k, d), '{}'::jsonb) into v_delta
  from (
    select k, coalesce((c ->> k)::numeric, 0) - coalesce((x ->> k)::numeric, 0) as d
    from (select public.stock_count_map(v_line.counted) c, public.stock_count_map(v_line.expected) x) m,
         lateral (select jsonb_object_keys(m.c) k union select jsonb_object_keys(m.x)) ks
  ) diff
  where d <> 0;

  if jsonb_array_length(v_sizes) = 0 then
    -- A product without sizes keeps its stock in `stock` alone, under size ''.
    v_change := coalesce((v_delta ->> '')::integer, 0);
    v_q := greatest(0, v_stock + v_change);
    if v_q <> v_stock then
      v_applied := jsonb_build_array(jsonb_build_object('size', '', 'change', v_q - v_stock));
    end if;
    update public.products set stock = v_q where id = p_product;
  else
    -- The shelf in its own order, each size moved by its difference.
    for v_e in select * from jsonb_array_elements(v_sizes) loop
      v_size := btrim(coalesce(v_e ->> 'size', ''));
      v_old := greatest(0, coalesce((v_e ->> 'quantity')::numeric, 0))::integer;
      v_change := case when v_size = any(v_seen) then 0 else coalesce((v_delta ->> v_size)::integer, 0) end;
      v_q := greatest(0, v_old + v_change);
      v_new := v_new || jsonb_build_array(v_e || jsonb_build_object('quantity', v_q));
      if v_q <> v_old then
        v_applied := v_applied || jsonb_build_array(jsonb_build_object('size', v_size, 'change', v_q - v_old));
      end if;
      v_seen := v_seen || v_size;
    end loop;
    -- A size the shelf did not have, found on it.
    for v_k in select jsonb_object_keys(v_delta) loop
      if not (v_k = any(v_seen)) and (v_delta ->> v_k)::integer > 0 then
        v_new := v_new || jsonb_build_array(jsonb_build_object('size', v_k, 'quantity', (v_delta ->> v_k)::integer));
        v_applied := v_applied || jsonb_build_array(jsonb_build_object('size', v_k, 'change', (v_delta ->> v_k)::integer));
      end if;
    end loop;
    update public.products
    set sizes = v_new,
        stock = (select coalesce(sum(greatest(0, coalesce((e ->> 'quantity')::numeric, 0))), 0)::integer
                 from jsonb_array_elements(v_new) e)
    where id = p_product;
  end if;

  update public.stock_count_lines
  set resolution = 'applied', applied = v_applied, resolved_at = now(), resolved_by = public.stock_count_actor()
  where count_id = p_count and product_id = p_product
  returning * into v_line;
  return v_line;
end;
$$;

-- ---------------------------------------------------------------------------
-- Leave a difference as it is (admin): the shelf keeps the system's numbers.
-- ---------------------------------------------------------------------------
create or replace function public.stock_count_dismiss(p_count bigint, p_product text)
returns public.stock_count_lines
language plpgsql
security definer
set search_path = public
as $$
declare
  v_line public.stock_count_lines;
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.stock_count_lines l
  set resolution = 'dismissed', applied = null, resolved_at = now(), resolved_by = public.stock_count_actor()
  from public.stock_counts c
  where l.count_id = p_count and l.product_id = p_product
    and c.id = l.count_id and c.closed_at is null
    and l.counted_at is not null and l.resolution is null
  returning l.* into v_line;
  if v_line.count_id is null then
    raise exception 'cannot dismiss' using errcode = 'P0001', hint = 'unresolvable';
  end if;
  return v_line;
end;
$$;

-- ---------------------------------------------------------------------------
-- Count it again (admin): back on the list, unless already applied.
-- ---------------------------------------------------------------------------
create or replace function public.stock_count_recount(p_count bigint, p_product text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.stock_count_lines l
  set expected = null, counted = null, matches = null, counted_at = null, counted_by = null,
      resolution = null, applied = null, resolved_at = null, resolved_by = null
  from public.stock_counts c
  where l.count_id = p_count and l.product_id = p_product
    and c.id = l.count_id and c.closed_at is null
    and l.resolution is distinct from 'applied';
  if not found then
    raise exception 'cannot recount' using errcode = 'P0001', hint = 'applied';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Close (admin): only when every listed product is counted and every
-- difference is resolved. A count that will not be finished is deleted.
-- ---------------------------------------------------------------------------
create or replace function public.stock_count_close(p_count bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  perform 1 from public.stock_counts where id = p_count and closed_at is null for update;
  if not found then
    raise exception 'the count is closed' using errcode = 'P0001', hint = 'closed';
  end if;
  if exists (select 1 from public.stock_count_lines where count_id = p_count and listed and counted_at is null) then
    raise exception 'not everything is counted' using errcode = 'P0001', hint = 'uncounted';
  end if;
  if exists (select 1 from public.stock_count_lines
             where count_id = p_count and counted_at is not null and not matches and resolution is null) then
    raise exception 'differences are open' using errcode = 'P0001', hint = 'unresolved';
  end if;
  update public.stock_counts set closed_at = now(), closed_by = public.stock_count_actor() where id = p_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Rights
-- ---------------------------------------------------------------------------
alter table public.stock_counts      enable row level security;
alter table public.stock_count_lines enable row level security;

drop policy if exists "stock_counts: back office read" on public.stock_counts;
drop policy if exists "stock_counts: admin all"        on public.stock_counts;
create policy "stock_counts: back office read" on public.stock_counts for select to authenticated
  using (public.is_back_office());
create policy "stock_counts: admin all"        on public.stock_counts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

drop policy if exists "stock_count_lines: back office read" on public.stock_count_lines;
drop policy if exists "stock_count_lines: admin all"        on public.stock_count_lines;
create policy "stock_count_lines: back office read" on public.stock_count_lines for select to authenticated
  using (public.is_back_office());
create policy "stock_count_lines: admin all"        on public.stock_count_lines for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

revoke all on public.stock_counts, public.stock_count_lines from anon;
grant select, insert, update, delete on public.stock_counts, public.stock_count_lines to authenticated;

revoke all on function public.stock_count_start(text)                                  from public, anon;
revoke all on function public.stock_count_record(bigint, text, timestamptz, jsonb, jsonb) from public, anon;
revoke all on function public.stock_count_apply(bigint, text)                          from public, anon;
revoke all on function public.stock_count_dismiss(bigint, text)                        from public, anon;
revoke all on function public.stock_count_recount(bigint, text)                        from public, anon;
revoke all on function public.stock_count_close(bigint)                                from public, anon;
grant execute on function public.stock_count_start(text)                                  to authenticated;
grant execute on function public.stock_count_record(bigint, text, timestamptz, jsonb, jsonb) to authenticated;
grant execute on function public.stock_count_apply(bigint, text)                          to authenticated;
grant execute on function public.stock_count_dismiss(bigint, text)                        to authenticated;
grant execute on function public.stock_count_recount(bigint, text)                        to authenticated;
grant execute on function public.stock_count_close(bigint)                                to authenticated;
