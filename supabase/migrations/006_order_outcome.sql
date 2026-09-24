-- Migration 006 · how an order actually ended  (Task 0.5)
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Paste → Run
-- Idempotent: safe to run twice.
--
-- With cash on delivery an order is not revenue — a delivered one is. A parcel
-- the customer refuses at the door costs the courier fee both ways and brings
-- nothing, and with store pickup (D-011) an order can simply never be collected.
-- `status` says where an order is in the workflow; `outcome` says how it ended,
-- which is the part a refusal rate is computed from (Task 7.2).
--
-- A negative outcome also cancels the order, which puts the goods back on the
-- shelf and removes the sale from sold[] and the ledger — the same path as a
-- cancellation, so revenue only ever counts orders that were actually paid for.

alter table public.orders
  add column if not exists outcome text
    check (outcome in ('delivered', 'refused', 'returned', 'not_collected'));

alter table public.orders
  add column if not exists outcome_at timestamptz;

comment on column public.orders.outcome is
  'How the order ended: delivered | refused (at the door) | returned (after delivery) | not_collected (pickup). Null while still open.';
comment on column public.orders.outcome_at is
  'When the outcome was recorded.';

create index if not exists idx_orders_outcome on public.orders (outcome);

-- ---------------------------------------------------------------------------
-- Marketing opt-out (Task 7.4)
--
-- The Viber/SMS list is built from people who ordered, and anyone on it must be
-- able to say no. One row per normalised phone number; being on this table
-- keeps a number off every exported list. Keyed on the phone rather than an
-- order, because the same person orders more than once.
-- ---------------------------------------------------------------------------
create table if not exists public.marketing_optout (
  phone_norm  text primary key,
  note        text,
  created_at  timestamptz not null default now()
);

alter table public.marketing_optout enable row level security;

drop policy if exists "marketing_optout: authenticated all" on public.marketing_optout;
create policy "marketing_optout: authenticated all"
  on public.marketing_optout for all
  to authenticated
  using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Manual "do not reorder" (leftover from Task 5.1)
--
-- The reorder plan decides from sales, and sales cannot know that a supplier
-- dropped a line or that a style has had its moment. This is the owner saying
-- so. It only ever removes a product from the plan — nothing adds one back but
-- switching it off again.
-- ---------------------------------------------------------------------------
alter table public.products
  add column if not exists no_reorder boolean not null default false;

comment on column public.products.no_reorder is
  'Set by hand: never suggest this product in the reorder plan, whatever its sales say.';
