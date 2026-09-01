-- ===========================================================================
-- Миграции 003–005 во еден фајл
--
-- Supabase Dashboard → SQL Editor → New query → Paste → Run
--
-- За чиста база, или кога не се знае што е пуштено. Сите три се идемпотентни
-- (`if not exists`, `drop policy if exists` пред `create`), па повторно
-- пуштање на нешто што веќе постои не прави ништо. Редоследот меѓу нив не е
-- важен — не зависат една од друга.
--
-- За да видиш што фактички е пуштено:  npm run migrations:check
--
-- По ова:
--   npm run ageing:estimate apply   — процени датум на прием за старите производи
--   npm run snapshot apply          — прва снимка на залихата
-- ===========================================================================


-- ─────────────────────────────────────────────────────────────────────────
-- 003_operating_expenses.sql
-- ─────────────────────────────────────────────────────────────────────────

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


-- ─────────────────────────────────────────────────────────────────────────
-- 004_purchasing.sql
-- ─────────────────────────────────────────────────────────────────────────

-- Migration 004 · suppliers, purchases, purchase_lines  (Tasks 2.1, 2.2, 2.3)
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Paste → Run
--
-- Receiving is the only moment when a batch's real cost and its arrival date
-- exist. Without somewhere to put them they are lost for that batch forever,
-- and stock ageing — every clearance and slow-mover rule downstream — has
-- nothing to measure from. `products.created_at` is the date the row was synced
-- from Firebase, not the date the goods arrived, so it cannot stand in.

create table if not exists public.suppliers (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  -- Days from placing an order to goods on the shelf. Feeds the reorder point
  -- directly; 14 is a placeholder until the real figures are known (Q2).
  lead_time_days  integer not null default 14 check (lead_time_days >= 0),
  min_order_value numeric(12,2),
  payment_terms   text,
  notes           text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create unique index if not exists idx_suppliers_name on public.suppliers (lower(name));

-- One delivery. `received_at` is the date the goods arrived, which is the one
-- that matters for ageing; `ordered_at` is kept because the gap between the two
-- is the real lead time, measured rather than guessed.
create table if not exists public.purchases (
  id           uuid primary key default gen_random_uuid(),
  supplier_id  uuid references public.suppliers(id) on delete set null,
  ordered_at   date,
  received_at  date not null default current_date,
  invoice_no   text,
  notes        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists idx_purchases_received on public.purchases (received_at desc);
create index if not exists idx_purchases_supplier on public.purchases (supplier_id);

-- What actually arrived. `unit_cost` is per batch, so margin on an old sale
-- stays correct after a later batch comes in at a different price —
-- products.purchase_price only ever holds the most recent one.
create table if not exists public.purchase_lines (
  id           uuid primary key default gen_random_uuid(),
  purchase_id  uuid not null references public.purchases(id) on delete cascade,
  product_id   text not null,
  size         text,
  qty          integer not null check (qty > 0),
  unit_cost    numeric(12,2) not null check (unit_cost >= 0),
  created_at   timestamptz not null default now()
);

create index if not exists idx_purchase_lines_purchase on public.purchase_lines (purchase_id);
create index if not exists idx_purchase_lines_product  on public.purchase_lines (product_id);

-- Ageing clock, and which supplier a product comes from.
alter table public.products
  add column if not exists first_received_at date;
alter table public.products
  add column if not exists supplier_id uuid references public.suppliers(id) on delete set null;

comment on column public.products.first_received_at is
  'Date the goods first arrived. Ageing is measured from here — created_at is the Firebase sync date, not an arrival.';

drop trigger if exists trg_suppliers_updated_at on public.suppliers;
create trigger trg_suppliers_updated_at
  before update on public.suppliers
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_purchases_updated_at on public.purchases;
create trigger trg_purchases_updated_at
  before update on public.purchases
  for each row execute function public.touch_updated_at();

alter table public.suppliers      enable row level security;
alter table public.purchases      enable row level security;
alter table public.purchase_lines enable row level security;

drop policy if exists "suppliers: authenticated all"      on public.suppliers;
drop policy if exists "purchases: authenticated all"      on public.purchases;
drop policy if exists "purchase_lines: authenticated all" on public.purchase_lines;

create policy "suppliers: authenticated all"
  on public.suppliers for all to authenticated using (true) with check (true);
create policy "purchases: authenticated all"
  on public.purchases for all to authenticated using (true) with check (true);
create policy "purchase_lines: authenticated all"
  on public.purchase_lines for all to authenticated using (true) with check (true);


-- ─────────────────────────────────────────────────────────────────────────
-- 005_ageing_and_snapshots.sql
-- ─────────────────────────────────────────────────────────────────────────

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


