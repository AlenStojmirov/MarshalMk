-- Supabase schema for marshalecom store
-- Run this in: Supabase Dashboard → SQL Editor → New query → Paste → Run
--
-- Mirrors the previous Firestore collections: `products` and `orders`.
-- Auth is handled by Supabase Auth (built-in `auth.users`), no extra table.

-- ---------------------------------------------------------------------------
-- products
-- ---------------------------------------------------------------------------
create table if not exists public.products (
  id            text primary key,
  name          text not null default '',
  description   text not null default '',
  price         numeric(12,2) not null default 0,
  category      text not null default '',
  image_url     text not null default '',
  images        jsonb not null default '[]'::jsonb,
  stock         integer not null default 0,
  sizes         jsonb not null default '[]'::jsonb,
  sold          jsonb not null default '[]'::jsonb,
  brand         text,
  color         text,
  featured      boolean not null default false,
  is_visible    boolean not null default true,
  sale          jsonb, -- { isActive, salePrice, percentageOff } or null
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists idx_products_category   on public.products (category);
create index if not exists idx_products_created_at on public.products (created_at desc);
create index if not exists idx_products_is_visible on public.products (is_visible);

-- ---------------------------------------------------------------------------
-- orders
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id             uuid primary key default gen_random_uuid(),
  order_number   text unique not null,
  customer       jsonb not null,           -- { firstName, lastName, email, phone, address, city, notes }
  items          jsonb not null,           -- OrderItem[]
  subtotal       numeric(12,2) not null default 0,
  shipping       numeric(12,2) not null default 0,
  total          numeric(12,2) not null default 0,
  status         text not null default 'pending'
                  check (status in ('pending','confirmed','processing','shipped','delivered','cancelled')),
  payment_method text not null default 'cash_on_delivery',
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists idx_orders_created_at   on public.orders (created_at desc);
create index if not exists idx_orders_order_number on public.orders (order_number);
create index if not exists idx_orders_status       on public.orders (status);

-- ---------------------------------------------------------------------------
-- updated_at trigger (auto-touch)
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_products_updated_at on public.products;
create trigger trg_products_updated_at
  before update on public.products
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_orders_updated_at on public.orders;
create trigger trg_orders_updated_at
  before update on public.orders
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
--
-- Public (anon) can:
--   - SELECT products (storefront)
-- Authenticated admin can:
--   - do anything on products and orders
-- Server (service-role key) bypasses RLS automatically and is used by API routes
-- to create/track orders, mirroring the previous Admin SDK flow.
-- ---------------------------------------------------------------------------
alter table public.products enable row level security;
alter table public.orders   enable row level security;

drop policy if exists "products: public read"         on public.products;
drop policy if exists "products: authenticated write" on public.products;
drop policy if exists "orders: authenticated all"     on public.orders;

create policy "products: public read"
  on public.products for select
  using (true);

create policy "products: authenticated write"
  on public.products for all
  to authenticated
  using (true) with check (true);

create policy "orders: authenticated all"
  on public.orders for all
  to authenticated
  using (true) with check (true);
