-- Migration 003 · operating_expenses  (Task 1.4)
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Paste → Run
--
-- The shop's ~65.000 den. of monthly running costs existed nowhere in the
-- system, so there was no net profit figure anywhere — only gross.
--
-- Two shapes of row, on purpose. A month can be recorded as one lump sum while
-- the detail is not to hand, and broken into line items later. Whichever is
-- present wins, and both being present for one month is flagged rather than
-- silently added together.

create table if not exists public.operating_expenses (
  id            uuid primary key default gen_random_uuid(),

  -- 'YYYY-MM'. The unit the shop actually thinks in.
  period        text not null check (period ~ '^\d{4}-\d{2}$'),

  -- Exact date, when known. Null for a whole-month figure.
  occurred_on   date,

  category      text not null default 'other'
                  check (category in (
                    'rent','salary','utilities','marketing','delivery',
                    'packaging','fees','tax','other'
                  )),

  amount        numeric(12,2) not null check (amount >= 0),
  description   text,

  -- True for "the whole month cost this much". False for a single line item.
  is_monthly_total boolean not null default false,

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_opex_period on public.operating_expenses (period);
create index if not exists idx_opex_category on public.operating_expenses (category);

comment on table public.operating_expenses is
  'Running costs by month. A month is either one monthly-total row or a set of line items — never both.';

drop trigger if exists trg_opex_updated_at on public.operating_expenses;
create trigger trg_opex_updated_at
  before update on public.operating_expenses
  for each row execute function public.touch_updated_at();

alter table public.operating_expenses enable row level security;

drop policy if exists "operating_expenses: authenticated all" on public.operating_expenses;
create policy "operating_expenses: authenticated all"
  on public.operating_expenses for all
  to authenticated
  using (true) with check (true);
