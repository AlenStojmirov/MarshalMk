-- Migration 013 · what each post tested and what it brought  (Task 10.7)
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Paste → Run
-- Idempotent: safe to run twice. Run after 012.
--
-- Safe to run before the code is merged: new nullable columns on a table only
-- the marketing screen reads; no right changes.
--
-- EPIC 10. The owner is not a marketer and wants to learn from numbers: every
-- post is a small experiment. A post can name the question it tests
-- (`hypothesis`, a key from src/lib/marketing-tests.ts) and which side it is
-- (`variant` A or B), and after posting carry what Meta Insights showed —
-- entered by hand, since nothing is read from Meta (owner, 2026-09-27).
-- Online orders are not typed in: they are counted from the tracked link each
-- order carries (D-025).
--
-- Numbers are counts: never negative. Empty means "not entered", which is not
-- the same as zero and is kept apart in the comparisons.

alter table public.marketing_plan add column if not exists hypothesis   text;
alter table public.marketing_plan add column if not exists variant      text;
alter table public.marketing_plan add column if not exists reach        integer;
alter table public.marketing_plan add column if not exists saves        integer;
alter table public.marketing_plan add column if not exists messages     integer;
alter table public.marketing_plan add column if not exists store_visits integer;
alter table public.marketing_plan add column if not exists results_at   timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'marketing_plan_variant') then
    alter table public.marketing_plan add constraint marketing_plan_variant check (variant is null or variant in ('A', 'B'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'marketing_plan_counts') then
    alter table public.marketing_plan add constraint marketing_plan_counts check (
      coalesce(reach, 0) >= 0 and coalesce(saves, 0) >= 0 and
      coalesce(messages, 0) >= 0 and coalesce(store_visits, 0) >= 0
    );
  end if;
end
$$;
