-- Migration 023 · the storefront reads a product's attributes  (Task 9.7, 2026-11-01)
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Paste → Run
-- Idempotent: safe to run twice. Run after 007 (products_public) and 010
-- (product_attributes).
--
-- Safe to run before or after the code is merged: the view keeps every column
-- it had, in the same order, and only gains one at the end. Old code reads the
-- same rows; new code finds `attributes` and writes the titles from it. Until
-- this has run, the pages that read through the browser (the home page,
-- /categories, "similar products") show the old titles; the server pages
-- (product, category, new, sale) already read the attributes themselves.
--
-- Task 9.7: a product's title on the storefront is written from its
-- attributes (category, cut, colour, material, details — src/lib/product-title.ts),
-- not typed. Customers cannot read `product_attributes` (010: back office
-- only), so the public view joins them in, as one object per product:
--
--   attributes = { composition, color, pattern, fit, size_advice, details,
--                  measurements }   — or null when the product has none.
--
-- Everything in it is meant for the customer: what the garment is made of,
-- its colour and cut, the size advice, the measurements (Task 9.9 shows them).
-- Who edited the row and when (`updated_by`, `updated_at`) stays out.
--
-- The view still runs with its owner's rights (007): its column list and its
-- WHERE are the whole of what anon gets.

create or replace view public.products_public as
select
  p.id,
  p.name,
  p.description,
  p.price,
  p.category,
  p.image_url,
  p.images,
  p.stock,
  p.sizes,
  p.brand,
  p.color,
  p.featured,
  p.is_visible,
  p.sale,
  p.created_at,
  p.updated_at,
  case when a.product_id is null then null else jsonb_build_object(
    'composition',  a.composition,
    'color',        a.color,
    'pattern',      a.pattern,
    'fit',          a.fit,
    'size_advice',  a.size_advice,
    'details',      a.details,
    'measurements', a.measurements
  ) end as attributes
from public.products p
left join public.product_attributes a on a.product_id = p.id
where p.is_visible is distinct from false
  and p.stock > 0;

revoke all on public.products_public from anon, authenticated;
grant select on public.products_public to anon, authenticated;
