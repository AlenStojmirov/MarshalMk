-- Migration 009 · rights in the database follow the role  (Task 8.4)
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Paste → Run
-- Idempotent: safe to run twice. Run after 008.
--
-- Until now every table said "authenticated: all" — anyone signed in could read
-- and write everything. Sign-up is open in Supabase, so that meant anyone who
-- made an account. From here on the database checks the role in the JWT
-- (D-017), the same line the screens draw:
--
--   admin       everything
--   staff       products: read, add, edit (not delete)
--               orders:   read and process (not delete)
--               ledger:   record a sale; undo one through the functions below
--   no role /
--   customer    nothing
--
-- Server routes and scripts use the service-role key, which RLS does not
-- touch; the public site reads products_public (007). Neither changes.
--
-- Staff never read the ledger: its rows carry the cost (8.3). The three things
-- staff must still do to it — undo a shop sale, drop a cancelled order's rows,
-- reprice an order line — are functions that do exactly that and no more.

-- ---------------------------------------------------------------------------
-- Who is asking (app_role and is_admin come from 008)
-- ---------------------------------------------------------------------------
create or replace function public.is_back_office()
returns boolean
language sql stable
set search_path = public
as $$
  select public.is_admin() or public.app_role() = 'staff'
$$;

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------
drop policy if exists "products: authenticated write" on public.products;
drop policy if exists "products: back office read"    on public.products;
drop policy if exists "products: back office insert"  on public.products;
drop policy if exists "products: back office update"  on public.products;
drop policy if exists "products: admin delete"        on public.products;

create policy "products: back office read"   on public.products for select to authenticated
  using (public.is_back_office());
create policy "products: back office insert" on public.products for insert to authenticated
  with check (public.is_back_office());
create policy "products: back office update" on public.products for update to authenticated
  using (public.is_back_office()) with check (public.is_back_office());
create policy "products: admin delete"       on public.products for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------
drop policy if exists "orders: authenticated all"    on public.orders;
drop policy if exists "orders: back office read"     on public.orders;
drop policy if exists "orders: back office update"   on public.orders;
drop policy if exists "orders: admin insert"         on public.orders;
drop policy if exists "orders: admin delete"         on public.orders;

create policy "orders: back office read"   on public.orders for select to authenticated
  using (public.is_back_office());
create policy "orders: back office update" on public.orders for update to authenticated
  using (public.is_back_office()) with check (public.is_back_office());
-- Orders are created by POST /api/orders with the service-role key.
create policy "orders: admin insert"       on public.orders for insert to authenticated
  with check (public.is_admin());
create policy "orders: admin delete"       on public.orders for delete to authenticated
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- sales_ledger
-- ---------------------------------------------------------------------------
drop policy if exists "sales_ledger: authenticated all"    on public.sales_ledger;
drop policy if exists "sales_ledger: admin all"            on public.sales_ledger;
drop policy if exists "sales_ledger: back office insert"   on public.sales_ledger;

create policy "sales_ledger: admin all"          on public.sales_ledger for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
-- Recording a sale. No select: the insert is sent without RETURNING, and the
-- cost is filled by the trigger from 008.
create policy "sales_ledger: back office insert" on public.sales_ledger for insert to authenticated
  with check (public.is_back_office());

-- Undo one sale from the product page: the row matching product, size, price
-- and day (UTC, as the client matched it before). Same as the old client path.
create or replace function public.ledger_refund_one(
  p_product_id text, p_size text, p_unit_price numeric, p_day date
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not public.is_back_office() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select id into v_id
  from public.sales_ledger
  where product_id = p_product_id
    and size is not distinct from p_size
    and unit_price = p_unit_price
    and occurred_at >= (p_day::timestamp at time zone 'UTC')
    and occurred_at <  ((p_day + 1)::timestamp at time zone 'UTC')
  -- A shop row before an online one, the newest first.
  order by (order_id is null) desc, created_at desc
  limit 1;
  if v_id is null then
    return false;
  end if;
  delete from public.sales_ledger where id = v_id;
  return true;
end;
$$;

-- A cancelled order takes its sales with it.
create or replace function public.ledger_remove_order(p_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  if not public.is_back_office() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  delete from public.sales_ledger where order_id = p_order_id;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

-- An order line agreed at a different price (the reprice on an order).
create or replace function public.ledger_reprice_order_line(
  p_order_id uuid, p_product_id text, p_size text, p_old_price numeric, p_new_price numeric
) returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n integer;
begin
  if not public.is_back_office() then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  update public.sales_ledger
     set unit_price = p_new_price, unit_list_price = p_old_price
   where order_id = p_order_id
     and product_id = p_product_id
     and size is not distinct from p_size
     and unit_price = p_old_price;
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.ledger_refund_one(text, text, numeric, date)                        from public, anon;
revoke all on function public.ledger_remove_order(uuid)                                            from public, anon;
revoke all on function public.ledger_reprice_order_line(uuid, text, text, numeric, numeric)        from public, anon;
grant execute on function public.ledger_refund_one(text, text, numeric, date)                      to authenticated;
grant execute on function public.ledger_remove_order(uuid)                                         to authenticated;
grant execute on function public.ledger_reprice_order_line(uuid, text, text, numeric, numeric)     to authenticated;

-- ---------------------------------------------------------------------------
-- The owner's tables
-- ---------------------------------------------------------------------------
do $$
declare
  t text;
begin
  foreach t in array array['operating_expenses', 'inventory_snapshots', 'marketing_optout',
                           'suppliers', 'purchases', 'purchase_lines']
  loop
    if to_regclass('public.' || t) is not null then
      execute format('drop policy if exists %I on public.%I', t || ': authenticated all', t);
      execute format('drop policy if exists %I on public.%I', t || ': admin all', t);
      execute format(
        'create policy %I on public.%I for all to authenticated using (public.is_admin()) with check (public.is_admin())',
        t || ': admin all', t);
      execute format('revoke all on public.%I from anon', t);
    end if;
  end loop;
end
$$;
