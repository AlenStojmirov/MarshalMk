-- Migration 011 · the marketing role reads the catalogue, and nothing else  (Task 10.0)
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Paste → Run
-- Idempotent: safe to run twice. Run after 010 (uses app_role / is_admin from 008).
--
-- Safe to run before the code is merged: it only adds read policies for a role
-- nobody holds yet. No existing right changes.
--
-- EPIC 10. The marketing employee prepares posts from what the shop already
-- knows: products, photos, prices, sales, season, stock (D-021). So:
--
--   marketing   products:            read (not add, edit or delete)
--               product_attributes:  read
--               everything else:     nothing
--
-- What that read does NOT reach:
--   * the purchase price — it lives in product_costs, admin only (008). Through
--     products_costed (reader's rights) the cost comes back empty, as for staff.
--     `products.purchase_price` is a write-only port and always empty (008).
--   * the ledger — its rows carry the cost (8.3). Sales per product come from
--     products.sold[], the source of truth (D-008), which holds size, price and
--     day, never a cost.
--   * orders (customer names and phones), expenses, snapshots, suppliers.
--
-- Marketing is deliberately NOT part of is_back_office(): that function also
-- grants writing products and orders, recording sales and the three ledger
-- functions (009). A separate check keeps marketing read-only.

-- ---------------------------------------------------------------------------
-- Who is asking
-- ---------------------------------------------------------------------------
create or replace function public.is_marketing()
returns boolean
language sql stable
set search_path = public
as $$
  select public.app_role() = 'marketing'
$$;

-- ---------------------------------------------------------------------------
-- products: read
-- ---------------------------------------------------------------------------
drop policy if exists "products: marketing read" on public.products;
create policy "products: marketing read" on public.products for select to authenticated
  using (public.is_marketing());

-- ---------------------------------------------------------------------------
-- product_attributes: read
-- ---------------------------------------------------------------------------
drop policy if exists "product_attributes: marketing read" on public.product_attributes;
create policy "product_attributes: marketing read" on public.product_attributes for select to authenticated
  using (public.is_marketing());
