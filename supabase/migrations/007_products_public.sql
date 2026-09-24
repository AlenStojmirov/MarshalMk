-- Migration 007 · the public site reads only what a customer sees  (Task 8.1)
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Paste → Run
-- Idempotent: safe to run twice.
--
-- Until now `products` had the policy "public read" — anyone holding the anon
-- key, which ships inside every page of the storefront, could select every
-- column: the purchase price, every sale in sold[] with its date and price,
-- the supplier, the receive date. Measured 2026-09-25 with the anon key alone.
--
-- The storefront now reads `products_public`: the customer-facing columns of
-- the products a customer may see (visible, with at least one unit). The table
-- itself is closed to anon; the admin (authenticated) reads it as before, and
-- the server pages read it with the service-role key, which RLS does not touch.
--
-- The view deliberately runs with its owner's rights (no security_invoker), so
-- it can read a table anon cannot. That is the point of it: the column list and
-- the WHERE below are the whole of what anon gets. When a column is added to
-- `products`, it is NOT public until it is added here.

create or replace view public.products_public as
select
  id,
  name,
  description,
  price,
  category,
  image_url,
  images,
  stock,
  sizes,
  brand,       -- already part of the id; only used when a product has no category
  color,
  featured,
  is_visible,
  sale,
  created_at,
  updated_at
from public.products
where is_visible is distinct from false
  and stock > 0;

revoke all on public.products_public from anon, authenticated;
grant select on public.products_public to anon, authenticated;

-- Close the table to anon. The policy goes, and so does the grant, so an anon
-- read fails loudly ("permission denied") instead of quietly returning nothing.
drop policy if exists "products: public read" on public.products;
revoke all on public.products from anon;
