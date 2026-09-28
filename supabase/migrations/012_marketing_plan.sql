-- Migration 012 · the content calendar  (Task 10.4)
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Paste → Run
-- Idempotent: safe to run twice. Run after 011 (uses is_admin / is_marketing).
--
-- Safe to run before the code is merged: a new table nobody reads yet, no
-- existing right changes.
--
-- EPIC 10. The owner (2026-09-27): the plan should lay out next month's work,
-- ideally three months, and be moved day by day as the shop's days require —
-- but stay written down. One row is one planned post: a day, a kind, the
-- products in it, its text, and how far it got. Moving a post is counted, so
-- the plan can say how well it holds.
--
-- The three-month frame (weekly themes) is not stored: it follows from the
-- season calendar and the dates of the year, in code (src/lib/marketing-calendar.ts).
--
-- Rights: admin everything; marketing reads, adds, edits and deletes its own
-- calendar; staff, no role and anon nothing. Results per post (reach,
-- messages) arrive with Task 10.7.

create table if not exists public.marketing_plan (
  id            uuid primary key default gen_random_uuid(),
  day           date not null,
  kind          text not null,
  -- Products in the post, in order. Empty for a trust post. No foreign key:
  -- an array cannot carry one, and a post about a product later deleted
  -- should stay in the history rather than vanish.
  product_ids   text[] not null default '{}',
  title         text,
  -- The caption as it was (or will be) posted.
  body          text,
  status        text not null default 'planned',
  channel       text not null default 'both',
  note          text,
  post_url      text,
  -- The day it was first planned for, and how often it moved since.
  original_day  date,
  moved_count   integer not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid,
  updated_by    uuid,

  constraint marketing_plan_kind    check (kind in ('carousel', 'reel', 'story', 'combo', 'clearance', 'trust')),
  constraint marketing_plan_status  check (status in ('planned', 'ready', 'posted', 'skipped')),
  constraint marketing_plan_channel check (channel in ('instagram', 'facebook', 'both')),
  constraint marketing_plan_moved   check (moved_count >= 0)
);

create index if not exists marketing_plan_day on public.marketing_plan (day);

-- Who touched it last, when, and whether its day moved. auth.uid() is null
-- for the service role.
create or replace function public.marketing_plan_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    new.original_day := coalesce(new.original_day, new.day);
    new.moved_count  := 0;
    new.created_at   := now();
    new.created_by   := auth.uid();
  else
    new.original_day := old.original_day;
    new.created_at   := old.created_at;
    new.created_by   := old.created_by;
    new.moved_count  := old.moved_count + case when new.day is distinct from old.day then 1 else 0 end;
  end if;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

drop trigger if exists marketing_plan_touch on public.marketing_plan;
create trigger marketing_plan_touch
  before insert or update on public.marketing_plan
  for each row execute function public.marketing_plan_touch();

-- ---------------------------------------------------------------------------
-- Rights
-- ---------------------------------------------------------------------------
alter table public.marketing_plan enable row level security;

drop policy if exists "marketing_plan: admin all"     on public.marketing_plan;
drop policy if exists "marketing_plan: marketing all" on public.marketing_plan;

create policy "marketing_plan: admin all" on public.marketing_plan for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "marketing_plan: marketing all" on public.marketing_plan for all to authenticated
  using (public.is_marketing()) with check (public.is_marketing());

revoke all on public.marketing_plan from anon;
grant select, insert, update, delete on public.marketing_plan to authenticated;
