-- Migration 001 · purchase_price  (Task 1.1)
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Paste → Run
--
-- Adds the real unit cost to products. Without this column, "Sync All" in
-- /admin/inventory will fail, because the sync now writes cost alongside
-- sizes/sold/stock.
--
-- The value stored here is the REAL cost — the Firebase RTDB `purchasePrice`
-- divided by 2 (see docs/DECISIONS.md D-002). Never divide it again on read.

alter table public.products
  add column if not exists purchase_price numeric(12,2);

comment on column public.products.purchase_price is
  'Real unit cost in denars. Firebase stores this value doubled; the sync halves it (D-002).';
