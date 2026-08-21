-- Migration 002 · sales_ledger  (Task 0.1)
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Paste → Run
--
-- One append-only row per unit that left the shop, from either channel. This
-- replaces the role of `products.sold[]`, which is a jsonb array with no
-- channel, no cost, no quantity and no way to aggregate in SQL.
--
-- Deliberately denormalised: product name and category are snapshotted, and
-- there is no foreign key to products. A ledger has to survive its subjects —
-- deleting a product must not delete or block its history.

create table if not exists public.sales_ledger (
  id                uuid primary key default gen_random_uuid(),

  -- when the unit actually left, not when the row was written
  occurred_at       timestamptz not null,

  channel           text not null check (channel in ('store','online')),

  -- 'sale' is revenue. The rest are units leaving for other reasons and must
  -- never be counted as demand (see docs/DECISIONS.md D-005).
  reason            text not null default 'sale'
                      check (reason in ('sale','giveaway','personal','writeoff','return')),

  -- online only; kept loose on purpose, see the note above
  order_id          uuid,
  order_number      text,

  product_id        text not null,
  product_name      text,
  product_category  text,
  size              text,

  qty               integer not null default 1 check (qty > 0),

  -- Amount actually charged per unit, after any discount.
  -- Revenue is always qty * unit_price — for historical and new rows alike.
  unit_price        numeric(12,2) not null default 0,

  -- List price at the time, when known. Discount is derived from the pair
  -- rather than stored, so the two can never disagree.
  unit_list_price   numeric(12,2),

  -- Cost at the time of the sale. Snapshotted so margin survives a later
  -- change to the product's purchase price.
  unit_cost         numeric(12,2),

  vat_rate          numeric(5,2),

  created_by        text,

  -- 'backfill:sold-array' | 'backfill:orders' | 'pos' | 'online'
  -- Lets migrated rows be told apart from ones written live.
  source            text not null default 'app',

  created_at        timestamptz not null default now()
);

create index if not exists idx_ledger_occurred_at on public.sales_ledger (occurred_at desc);
create index if not exists idx_ledger_product     on public.sales_ledger (product_id);
create index if not exists idx_ledger_product_time on public.sales_ledger (product_id, occurred_at desc);
create index if not exists idx_ledger_channel     on public.sales_ledger (channel);
create index if not exists idx_ledger_reason      on public.sales_ledger (reason);
create index if not exists idx_ledger_order       on public.sales_ledger (order_id);

comment on table public.sales_ledger is
  'Append-only record of units sold or otherwise removed, both channels. Replaces products.sold[].';
comment on column public.sales_ledger.unit_price is
  'Charged per unit after discount. Revenue = qty * unit_price.';
comment on column public.sales_ledger.unit_cost is
  'Cost snapshot at sale time. Never divide again — the Firebase doubling is handled at sync (D-002).';

-- ---------------------------------------------------------------------------
-- Row Level Security — same shape as products/orders
-- ---------------------------------------------------------------------------
alter table public.sales_ledger enable row level security;

drop policy if exists "sales_ledger: authenticated all" on public.sales_ledger;
create policy "sales_ledger: authenticated all"
  on public.sales_ledger for all
  to authenticated
  using (true) with check (true);
