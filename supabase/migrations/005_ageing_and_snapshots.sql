-- Migration 005 · ageing estimate flag + inventory snapshots  (Tasks 2.3, 3.4)
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Paste → Run
--
-- Two small things, both about being able to measure time.

-- ---------------------------------------------------------------------------
-- 1. Was first_received_at measured, or guessed?
--
-- Goods received from now on carry a real arrival date. The 439 products that
-- were already here do not, and never will — so their date is estimated from
-- the earliest sale or the sync date, whichever is older. That is an upper
-- bound on arrival, which means it makes stock look *younger* than it is.
-- Marking which is which keeps an estimate from being read as a measurement.
-- ---------------------------------------------------------------------------
alter table public.products
  add column if not exists first_received_estimated boolean not null default false;

comment on column public.products.first_received_estimated is
  'True when first_received_at was inferred rather than recorded at receiving. Such ages are lower bounds.';

-- ---------------------------------------------------------------------------
-- 2. Inventory snapshots
--
-- Turnover and GMROI need *average* inventory over a period, and average cannot
-- be reconstructed after the fact — a week not captured is a week gone. Current
-- stock stands in for now, which is why every turnover figure so far has been
-- an approximation.
--
-- One row per category per capture keeps it small: about ten rows a week.
-- ---------------------------------------------------------------------------
create table if not exists public.inventory_snapshots (
  id            uuid primary key default gen_random_uuid(),
  taken_on      date not null default current_date,
  category      text not null,
  units         integer not null default 0,
  cost_value    numeric(12,2) not null default 0,
  retail_value  numeric(12,2) not null default 0,
  models        integer not null default 0,
  created_at    timestamptz not null default now(),

  -- One capture per category per day. Re-running is a no-op rather than a
  -- duplicate, so it is safe to call from anything on any schedule.
  unique (taken_on, category)
);

create index if not exists idx_snapshots_taken on public.inventory_snapshots (taken_on desc);

alter table public.inventory_snapshots enable row level security;

drop policy if exists "inventory_snapshots: authenticated all" on public.inventory_snapshots;
create policy "inventory_snapshots: authenticated all"
  on public.inventory_snapshots for all
  to authenticated using (true) with check (true);
