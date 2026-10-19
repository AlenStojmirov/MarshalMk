-- Migration 019 · e-mails sent to customers  (Task 13.11)
--
-- Run in: Supabase Dashboard → SQL Editor → New query → Paste → Run
-- Idempotent: safe to run twice. Run after 008 (uses is_admin).
--
-- Safe to run before the code is merged: a new table nobody writes yet.
--
-- EPIC 13. Every message the shop sends a customer is written here before
-- it goes out — welcome, points about to lapse (30 and 7 days), a coupon
-- about to lapse, birthday — under a key that says what it is about (the
-- points lot, the coupon, the year). The key is unique, so the daily job,
-- run twice or late, never sends the same message twice. A message that
-- fails to send is taken out again, so the next run tries it.
--
-- Rights: the admin reads; the server writes. Customers do not read it.

create table if not exists public.customer_notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  kind        text not null,
  -- What the message is about: a points lot, a coupon, a year.
  ref         text not null,
  message_id  text,
  sent_at     timestamptz not null default now(),

  constraint customer_notifications_kind check (kind in ('welcome', 'points_first', 'points_last', 'coupon_expiring', 'birthday'))
);

create unique index if not exists customer_notifications_once on public.customer_notifications (user_id, kind, ref);
create index if not exists customer_notifications_sent on public.customer_notifications (sent_at desc);

alter table public.customer_notifications enable row level security;

drop policy if exists "customer_notifications: admin reads" on public.customer_notifications;
create policy "customer_notifications: admin reads" on public.customer_notifications for select to authenticated
  using (public.is_admin());

revoke all on public.customer_notifications from anon, authenticated;
grant select on public.customer_notifications to authenticated;
