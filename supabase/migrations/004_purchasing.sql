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
