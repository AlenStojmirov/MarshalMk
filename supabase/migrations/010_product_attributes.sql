-- Migration 010 · what a product is made of, its colour, and how it fits  (Task 9.1)
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Paste → Run
-- Idempotent: safe to run twice. Run after 009 (uses is_admin / is_back_office).
--
-- Safe to run before the code is merged: a new table, no existing right changes,
-- and nothing reads it until the code does.
--
-- EPIC 9. The only product copy today is a fibre list typed into `description`
-- about thirty different ways; no product has a colour or a measurement
-- (npm run catalog:audit). The structured data lands here, one row per product,
-- and not in `products`:
--
--   * `products` is overwritten by the Firebase sync until the switchover day
--     (D-012). This table is never touched by it.
--   * When EPIC 9 is done the two are joined by product_id (Task 9.10) — either
--     columns move into `products`, or this stays 1:1 behind the views.
--
-- What the values mean (fibres, colours, fits, which fields a category has)
-- lives in code, src/lib/attributes.ts (Task 9.2), like the seasons do. The
-- database only guards the shape: a composition that is a list of fibres
-- adding up to 100, measurements that are centimetres per size.
--
-- Rights follow D-019: admin everything; staff read, add, edit (they enter the
-- composition and measure the garments); no role and anon nothing. Customers
-- see it only once `products_public` includes it (Task 9.9).

-- ---------------------------------------------------------------------------
-- Shape checks
-- ---------------------------------------------------------------------------

-- [{"fiber": "cotton", "pct": 98}, {"fiber": "elastane", "pct": 2}]
-- Empty is allowed (not known yet); otherwise every entry names a fibre once,
-- each share is above 0 and at most 100, and the shares add up to exactly 100.
create or replace function public.composition_is_valid(c jsonb)
returns boolean
language sql immutable
set search_path = public
as $$
  select case
    when c is null then true
    when jsonb_typeof(c) <> 'array' then false
    when jsonb_array_length(c) = 0 then true
    else (
      -- Every cast sits behind a CASE: AND does not promise an evaluation order.
      select bool_and(
               jsonb_typeof(e) = 'object'
               and coalesce(e ->> 'fiber', '') <> ''
               and coalesce(case when jsonb_typeof(e -> 'pct') = 'number'
                                 then (e ->> 'pct')::numeric end, 0) between 0.01 and 100)
         and coalesce(sum(case when jsonb_typeof(e -> 'pct') = 'number'
                               then (e ->> 'pct')::numeric end), 0) = 100
         and count(distinct e ->> 'fiber') = count(*)
      from jsonb_array_elements(c) e
    )
  end
$$;

-- {"M": {"chest": 54, "length": 72}, "L": {...}} — centimetres, per size.
create or replace function public.measurements_are_valid(m jsonb)
returns boolean
language sql immutable
set search_path = public
as $$
  select case
    when m is null then true
    when jsonb_typeof(m) <> 'object' then false
    else coalesce((
      select bool_and(
               case when jsonb_typeof(s.value) <> 'object' then false
                    else not exists (
                      select 1 from jsonb_each(s.value) v
                      where case when jsonb_typeof(v.value) <> 'number' then true
                                 else (v.value #>> '{}')::numeric not between 0.1 and 300 end)
               end)
      from jsonb_each(m) s
    ), true)
  end
$$;

-- ---------------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------------
create table if not exists public.product_attributes (
  product_id   text primary key
               references public.products(id) on delete cascade,
  composition  jsonb not null default '[]'::jsonb,
  color        text,
  pattern      text,
  fit          text,
  -- Does it run true to size? Cuts exchanges and refused COD parcels (D-014).
  size_advice  text,
  -- Per-category fields: sleeve, collar, closure, leg length (32L), lining…
  details      jsonb not null default '{}'::jsonb,
  measurements jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now(),
  updated_by   uuid,

  constraint product_attributes_composition_valid  check (public.composition_is_valid(composition)),
  constraint product_attributes_measurements_valid check (public.measurements_are_valid(measurements)),
  constraint product_attributes_details_object     check (jsonb_typeof(details) = 'object'),
  constraint product_attributes_size_advice        check (size_advice is null or size_advice in ('true', 'larger', 'smaller'))
);

-- Who touched it last, and when. auth.uid() is null for the service role.
create or replace function public.product_attributes_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists product_attributes_touch on public.product_attributes;
create trigger product_attributes_touch
  before insert or update on public.product_attributes
  for each row execute function public.product_attributes_touch();

-- ---------------------------------------------------------------------------
-- Rights
-- ---------------------------------------------------------------------------
alter table public.product_attributes enable row level security;

drop policy if exists "product_attributes: back office read"   on public.product_attributes;
drop policy if exists "product_attributes: back office insert" on public.product_attributes;
drop policy if exists "product_attributes: back office update" on public.product_attributes;
drop policy if exists "product_attributes: admin delete"       on public.product_attributes;

create policy "product_attributes: back office read"   on public.product_attributes for select to authenticated
  using (public.is_back_office());
create policy "product_attributes: back office insert" on public.product_attributes for insert to authenticated
  with check (public.is_back_office());
create policy "product_attributes: back office update" on public.product_attributes for update to authenticated
  using (public.is_back_office()) with check (public.is_back_office());
create policy "product_attributes: admin delete"       on public.product_attributes for delete to authenticated
  using (public.is_admin());

revoke all on public.product_attributes from anon;
grant select, insert, update, delete on public.product_attributes to authenticated;
