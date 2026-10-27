-- Migration 021 · the customer's delivery address on the profile  (Task 14.9)
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Paste → Run
-- Idempotent: safe to run twice. Run after 017 (customers).
--
-- Safe to run before the code is merged: two empty columns nobody reads yet,
-- no right changes. Until it runs, the profile has no address fields to save
-- and the checkout fills in everything but the address.
--
-- The checkout fills a signed-in customer's details from the profile, and
-- the profile had no address. Taking it from the last order would not do: a
-- customer may send an order to someone else, under another name, as a gift.
-- So the address is the customer's own, typed on the profile (/smetka →
-- Профил), never required, and a change at checkout stays with that order.
--
-- Rights: as the rest of the row (017). The customer reads it; every write
-- goes through /api/account/me with the service role.

alter table public.customers add column if not exists address text;
alter table public.customers add column if not exists city    text;

alter table public.customers drop constraint if exists customers_address;
alter table public.customers add  constraint customers_address check (address is null or length(btrim(address)) between 1 and 200);
alter table public.customers drop constraint if exists customers_city;
alter table public.customers add  constraint customers_city    check (city is null or length(btrim(city)) between 1 and 80);
