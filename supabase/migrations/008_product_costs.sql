-- Migration 008 · the purchase price is the admin's alone  (Task 8.3)
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Paste → Run
-- Idempotent: safe to run twice. Run after 007.
--
-- The warehouse role (8.2) edits products and records sales, but must never
-- see what a piece cost. Row-level security works on rows, not columns, and
-- every signed-in user is the same Postgres role — so a column on `products`
-- cannot be hidden from staff while the rest of the row stays readable. The
-- cost moves to its own table that only the admin can read.
--
-- Nothing that writes a cost has to change. `products.purchase_price` stays as
-- a write-only port: a trigger takes any value written there — by the Firebase
-- sync, the product form, the scripts — files it in `product_costs`, and leaves
-- the column empty. A cost written by someone who is not the admin is dropped.
--
-- Readers that need the cost read `products_costed`: the product row with the
-- cost joined in. It runs with the reader's rights, so the admin gets the cost
-- and staff get the same rows with the cost empty.
--
-- The ledger keeps its cost snapshot (D-008): a sale inserted without a cost —
-- which is every sale staff enter — has it filled from `product_costs`. A cost
-- sent by anyone but the admin is replaced the same way.

-- ---------------------------------------------------------------------------
-- Who is asking. Also used by the role-based rights in 8.4.
-- ---------------------------------------------------------------------------
create or replace function public.app_role()
returns text
language sql stable
set search_path = public
as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '')
$$;

-- The owner, the service-role key (server routes, scripts), or a direct
-- database session such as this SQL editor, which carries no JWT at all.
create or replace function public.is_admin()
returns boolean
language sql stable
set search_path = public
as $$
  select auth.jwt() is null
      or coalesce(auth.jwt() ->> 'role', '') = 'service_role'
      or public.app_role() = 'admin'
$$;

-- ---------------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------------
create table if not exists public.product_costs (
  -- Deferred, so a product and its cost can be written in one statement: the
  -- trigger files the cost before the product row itself exists.
  product_id     text primary key
                 references public.products(id) on delete cascade
                 deferrable initially deferred,
  purchase_price numeric(12,2) not null check (purchase_price >= 0),
  updated_at     timestamptz not null default now()
);

alter table public.product_costs enable row level security;

drop policy if exists "product_costs: admin only" on public.product_costs;
create policy "product_costs: admin only"
  on public.product_costs for all
  to authenticated
  using (public.is_admin()) with check (public.is_admin());

revoke all on public.product_costs from anon;

-- ---------------------------------------------------------------------------
-- Move what is there. 442 of 445 products had a cost on 2026-09-25.
-- ---------------------------------------------------------------------------
insert into public.product_costs (product_id, purchase_price)
select id, purchase_price
from public.products
where purchase_price is not null
on conflict (product_id) do update
  set purchase_price = excluded.purchase_price, updated_at = now();

-- ---------------------------------------------------------------------------
-- The write port on products
-- ---------------------------------------------------------------------------
create or replace function public.products_divert_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.purchase_price is not null then
    if public.is_admin() then
      insert into public.product_costs (product_id, purchase_price)
      values (new.id, new.purchase_price)
      on conflict (product_id) do update
        set purchase_price = excluded.purchase_price, updated_at = now();
    end if;
    -- Filed or refused, it never stays on the row staff can read.
    new.purchase_price := null;
  end if;
  return new;
end;
$$;

drop trigger if exists products_divert_cost on public.products;
create trigger products_divert_cost
  before insert or update on public.products
  for each row execute function public.products_divert_cost();

-- Empty the column. The trigger sees null and does nothing.
update public.products set purchase_price = null where purchase_price is not null;

-- ---------------------------------------------------------------------------
-- The read side
-- ---------------------------------------------------------------------------
-- Columns are listed, not p.*: a view fixes its columns when it is created, so
-- a column added to products later must be added here as well (and to
-- products_public, 007, if customers may see it).
create or replace view public.products_costed
with (security_invoker = true) as
select
  p.id, p.name, p.description, p.price, p.category, p.image_url, p.images,
  p.stock, p.sizes, p.sold, p.brand, p.color, p.featured, p.is_visible, p.sale,
  p.created_at, p.updated_at,
  c.purchase_price,
  p.first_received_at, p.supplier_id, p.first_received_estimated, p.no_reorder
from public.products p
left join public.product_costs c on c.product_id = p.id;

revoke all on public.products_costed from anon, authenticated;
grant select on public.products_costed to authenticated;

-- ---------------------------------------------------------------------------
-- The ledger's cost snapshot
-- ---------------------------------------------------------------------------
create or replace function public.ledger_fill_cost()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Anyone but the admin gets the cost on file, whatever they sent: staff
  -- cannot know it, so any figure from them would only skew the margin.
  if new.unit_cost is null or not public.is_admin() then
    new.unit_cost := null;
    select c.purchase_price into new.unit_cost
    from public.product_costs c
    where c.product_id = new.product_id;
  end if;
  return new;
end;
$$;

drop trigger if exists ledger_fill_cost on public.sales_ledger;
create trigger ledger_fill_cost
  before insert on public.sales_ledger
  for each row execute function public.ledger_fill_cost();
