/**
 * The customer e-mails (Task 13.11). Server only.
 *
 * Once a day (Vercel Cron, vercel.json) the job looks for what is due:
 *   - points lapsing within `expiryNoticeFirstDays` (30), and again within
 *     `expiryNoticeSecondDays` (7) — not the first notice for points that
 *     never had longer than that to live (the wheel's 30-day points);
 *   - a personal coupon lapsing within `couponNoticeDays` and not yet used —
 *     not for coupons that were that short from the start (the wheel's 72 h);
 *   - a welcome e-mail with the welcome coupon, if the one sent at sign-up
 *     did not go out;
 *   - birthdays: the birthday bonus and coupon are given, and the e-mail goes
 *     only to customers who agreed to offers.
 *
 * Each message is first claimed in `customer_notifications` under a key (the
 * points lot, the coupon, the year), unique, then sent; a send that fails
 * gives the claim back so the next run tries again. So the job can run twice,
 * late, or by hand, and nobody gets the same message twice. A run stops below
 * Brevo's free daily limit; what is left goes out the next day.
 */

import crypto from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchLoyaltySettings } from './loyalty-settings';
import { creditPoints, expiryFor } from './points';
import { describeCoupon, issuePersonalCoupon } from './coupons';
import { hasPaidOrder } from './paid-orders';
import { emailConfigured, sendEmail } from './email/brevo';
import { Rendered, SITE, birthdayEmail, couponExpiringEmail, pointsExpiringEmail, welcomeEmail } from './email/templates';

export const NOTIFICATIONS = 'customer_notifications';
/** Below Brevo's free 300 a day, with room for the welcome e-mails sent at sign-up. */
export const MAX_PER_RUN = 250;
/** A welcome coupon older than this gets no catch-up e-mail. */
const WELCOME_CATCH_UP_DAYS = 7;
const DAY = 86_400_000;

export type NoticeKind = 'welcome' | 'points_first' | 'points_last' | 'coupon_expiring' | 'birthday';

// ---------------------------------------------------------------------------
// One-click "no more offers"
// ---------------------------------------------------------------------------

function secret(): string {
  return process.env.UNSUBSCRIBE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

export function unsubscribeToken(userId: string): string {
  return crypto.createHmac('sha256', secret()).update(`unsubscribe:${userId}`).digest('base64url').slice(0, 32);
}

export function unsubscribeUrl(userId: string): string {
  return `${SITE}/api/account/unsubscribe?u=${userId}&t=${unsubscribeToken(userId)}`;
}

export function verifyUnsubscribe(userId: string, token: string): boolean {
  const want = Buffer.from(unsubscribeToken(userId));
  const got = Buffer.from(token);
  return want.length === got.length && crypto.timingSafeEqual(want, got);
}

// ---------------------------------------------------------------------------
// Claim, send, give back
// ---------------------------------------------------------------------------

interface Recipient { userId: string; email: string; firstName: string; confirmed: boolean; marketing: boolean; birthDate: string | null }

async function recipients(sb: SupabaseClient): Promise<Map<string, Recipient>> {
  const out = new Map<string, Recipient>();
  const { data: rows } = await sb.from('customers').select('user_id, first_name, marketing_consent, birth_date');
  const byId = new Map(((rows ?? []) as Array<{ user_id: string; first_name: string; marketing_consent: boolean; birth_date: string | null }>).map((r) => [r.user_id, r]));
  for (let page = 1; ; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`users: ${error.message}`);
    for (const u of data.users) {
      const c = byId.get(u.id);
      if (!c || !u.email) continue;
      out.set(u.id, { userId: u.id, email: u.email, firstName: c.first_name, confirmed: !!u.email_confirmed_at, marketing: c.marketing_consent, birthDate: c.birth_date });
    }
    if (data.users.length < 1000) break;
  }
  return out;
}

/** Claim the keys; returns the ids of the ones this run claimed (none: already sent). */
async function claim(sb: SupabaseClient, userId: string, kind: NoticeKind, refs: string[]): Promise<string[]> {
  const { data, error } = await sb.from(NOTIFICATIONS)
    .upsert(refs.map((ref) => ({ user_id: userId, kind, ref })), { onConflict: 'user_id,kind,ref', ignoreDuplicates: true })
    .select('id');
  if (error) throw new Error(`claim: ${error.message}`);
  return ((data ?? []) as Array<{ id: string }>).map((r) => r.id);
}

async function deliver(sb: SupabaseClient, r: Recipient, kind: NoticeKind, refs: string[], message: Rendered): Promise<'sent' | 'already' | string> {
  const ids = await claim(sb, r.userId, kind, refs);
  if (ids.length === 0) return 'already';
  const sent = await sendEmail({ to: { email: r.email, name: r.firstName }, subject: message.subject, html: message.html, text: message.text, tag: kind });
  if (sent.error) {
    await sb.from(NOTIFICATIONS).delete().in('id', ids);
    return sent.error;
  }
  await sb.from(NOTIFICATIONS).update({ message_id: sent.messageId ?? null }).in('id', ids);
  return 'sent';
}

/** The welcome e-mail right at sign-up (13.6); the daily job catches any that failed. */
export async function notifyWelcome(sb: SupabaseClient, a: {
  userId: string; email: string; firstName: string; couponId: string; couponCode: string; pct: number; until: Date; minBasket: number;
}): Promise<void> {
  if (!emailConfigured()) return;
  const r: Recipient = { userId: a.userId, email: a.email, firstName: a.firstName, confirmed: true, marketing: false, birthDate: null };
  const res = await deliver(sb, r, 'welcome', [a.couponId], welcomeEmail(a));
  if (res !== 'sent' && res !== 'already') console.error(`[NOTIFY_WELCOME_FAILED] user=${a.userId} ${res}`);
}

// ---------------------------------------------------------------------------
// The daily run
// ---------------------------------------------------------------------------

export interface PlannedNotice { kind: NoticeKind; email: string; subject: string }

export interface RunResult {
  dryRun: boolean;
  planned: PlannedNotice[];
  sent: number;
  already: number;
  failed: Array<{ email: string; kind: NoticeKind; error: string }>;
  /** Due, but the account has no confirmed e-mail or no profile. */
  skipped: number;
  /** Stopped at MAX_PER_RUN; the rest go out tomorrow. */
  capped: boolean;
  birthdayGifts: number;
}

interface Due { kind: NoticeKind; userId: string; refs: string[]; render: (r: Recipient) => Rendered }

/** Skopje's date as yyyy-mm-dd. */
function skopjeDay(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Skopje', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

export async function runNotifications(sb: SupabaseClient, opts: { dryRun: boolean; now?: Date; limit?: number }): Promise<RunResult> {
  const now = opts.now ?? new Date();
  const limit = opts.limit ?? MAX_PER_RUN;
  const { settings } = await fetchLoyaltySettings(sb);
  const people = await recipients(sb);
  const res: RunResult = { dryRun: opts.dryRun, planned: [], sent: 0, already: 0, failed: [], skipped: 0, capped: false, birthdayGifts: 0 };
  const due: Due[] = [];

  // Points about to lapse: the last notice first, it is the more urgent.
  const { data: lotRows } = await sb.from('points_ledger').select('id, user_id, remaining, available_at, expires_at')
    .gt('remaining', 0).lte('available_at', now.toISOString()).gt('expires_at', now.toISOString());
  const lots = (lotRows ?? []) as Array<{ id: string; user_id: string; remaining: number; available_at: string; expires_at: string }>;
  for (const [kind, days] of [['points_last', settings.expiryNoticeSecondDays], ['points_first', settings.expiryNoticeFirstDays]] as const) {
    const edge = now.getTime() + days * DAY;
    const byUser = new Map<string, typeof lots>();
    for (const l of lots) {
      const ends = new Date(l.expires_at).getTime();
      if (ends > edge) continue;
      if (kind === 'points_first') {
        // The first notice is for points that had longer than the notice to live,
        // and not for points already due their last one: one e-mail, not two.
        if (ends - new Date(l.available_at).getTime() <= days * DAY) continue;
        if (ends <= now.getTime() + settings.expiryNoticeSecondDays * DAY) continue;
      }
      byUser.set(l.user_id, [...(byUser.get(l.user_id) ?? []), l]);
    }
    for (const [userId, ls] of byUser) {
      const points = ls.reduce((a, l) => a + Number(l.remaining), 0);
      const until = new Date(Math.min(...ls.map((l) => new Date(l.expires_at).getTime())));
      due.push({ kind, userId, refs: ls.map((l) => l.id), render: (r) => pointsExpiringEmail({ firstName: r.firstName, points, until, last: kind === 'points_last' }) });
    }
  }

  // Personal coupons about to lapse, not used, that had longer than the notice to begin with.
  const soon = new Date(now.getTime() + settings.couponNoticeDays * DAY).toISOString();
  const { data: couponRows } = await sb.from('coupons').select('*')
    .not('user_id', 'is', null).eq('active', true).gt('ends_at', now.toISOString()).lte('ends_at', soon);
  const coupons = (couponRows ?? []) as Array<{ id: string; user_id: string; code: string; kind: 'percent' | 'fixed' | 'free_shipping'; value: number; max_discount: number | null; min_basket: number | null; starts_at: string; ends_at: string }>;
  const { data: usedRows } = coupons.length
    ? await sb.from('coupon_redemptions').select('coupon_id').in('coupon_id', coupons.map((c) => c.id)).is('released_at', null)
    : { data: [] };
  const used = new Set(((usedRows ?? []) as Array<{ coupon_id: string }>).map((u) => u.coupon_id));
  for (const c of coupons) {
    if (used.has(c.id)) continue;
    if (new Date(c.ends_at).getTime() - new Date(c.starts_at).getTime() <= settings.couponNoticeDays * DAY) continue;
    const what = describeCoupon({ kind: c.kind, value: Number(c.value), maxDiscount: c.max_discount ?? undefined, minBasket: c.min_basket ?? undefined });
    due.push({ kind: 'coupon_expiring', userId: c.user_id, refs: [c.id], render: (r) => couponExpiringEmail({ firstName: r.firstName, code: c.code, what, until: new Date(c.ends_at) }) });
  }

  // Welcome e-mails that did not go out at sign-up.
  const since = new Date(now.getTime() - WELCOME_CATCH_UP_DAYS * DAY).toISOString();
  const { data: welcomeRows } = await sb.from('coupons').select('id, user_id, code, value, min_basket, ends_at')
    .eq('source', 'welcome').not('user_id', 'is', null).gte('created_at', since);
  for (const c of (welcomeRows ?? []) as Array<{ id: string; user_id: string; code: string; value: number; min_basket: number | null; ends_at: string }>) {
    due.push({
      kind: 'welcome', userId: c.user_id, refs: [c.id],
      render: (r) => welcomeEmail({ firstName: r.firstName, couponCode: c.code, pct: Number(c.value), until: new Date(c.ends_at), minBasket: c.min_basket ?? 0 }),
    });
  }

  for (const d of due) {
    const r = people.get(d.userId);
    if (!r || !r.confirmed) { res.skipped++; continue; }
    const message = d.render(r);
    if (opts.dryRun) { res.planned.push({ kind: d.kind, email: r.email, subject: message.subject }); continue; }
    if (res.sent >= limit) { res.capped = true; break; }
    const out = await deliver(sb, r, d.kind, d.refs, message);
    if (out === 'sent') res.sent++;
    else if (out === 'already') res.already++;
    else res.failed.push({ email: r.email, kind: d.kind, error: out });
  }

  // Birthdays: the gift is given whether or not the e-mail goes.
  const giftsOn = settings.bonusBirthday > 0 || settings.birthdayCouponPct > 0;
  const today = skopjeDay(now);
  // Born on 29 February: celebrated on the 28th when the year has no 29th.
  const y = Number(today.slice(0, 4));
  const leapless = today.endsWith('-02-28') && !((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0);
  for (const r of giftsOn ? people.values() : []) {
    if (!r.birthDate || !r.confirmed) continue;
    const md = r.birthDate.slice(5, 10);
    if (md !== today.slice(5, 10) && !(leapless && md === '02-29')) continue;
    const year = today.slice(0, 4);
    if (opts.dryRun) {
      if (r.marketing) res.planned.push({ kind: 'birthday', email: r.email, subject: birthdayEmail({ firstName: r.firstName, points: settings.bonusBirthday, unsubscribe: '' }).subject });
      continue;
    }
    const ids = await claim(sb, r.userId, 'birthday', [year]);
    if (ids.length === 0) { res.already++; continue; }
    let couponCode: string | undefined;
    let until: Date | undefined;
    if (settings.bonusBirthday > 0) {
      const paid = await hasPaidOrder(r.userId);
      const dates = paid ? { availableAt: now, expiresAt: expiryFor('bonus', now, settings) } : {};
      const c = await creditPoints(sb, { userId: r.userId, kind: 'bonus', points: settings.bonusBirthday, reason: 'роденденски бонус', ...dates });
      if (c.error) console.error(`[BIRTHDAY_POINTS_FAILED] user=${r.userId} ${c.error}`);
    }
    if (settings.birthdayCouponPct > 0) {
      const c = await issuePersonalCoupon(sb, {
        userId: r.userId, source: 'birthday', kind: 'percent', value: settings.birthdayCouponPct,
        validHours: settings.birthdayCouponValidDays * 24, prefix: 'RODENDEN', note: 'роденденски купон',
      });
      if (c.error) console.error(`[BIRTHDAY_COUPON_FAILED] user=${r.userId} ${c.error}`);
      else { couponCode = c.code; until = new Date(now.getTime() + settings.birthdayCouponValidDays * DAY); }
    }
    res.birthdayGifts++;
    if (!r.marketing || res.sent >= limit) continue;
    const sent = await sendEmail({
      to: { email: r.email, name: r.firstName }, tag: 'birthday',
      ...birthdayEmail({ firstName: r.firstName, points: settings.bonusBirthday, couponCode, pct: settings.birthdayCouponPct, until, unsubscribe: unsubscribeUrl(r.userId) }),
    });
    // The claim stays either way: the gift was given, and giving it twice would cost twice.
    if (sent.error) res.failed.push({ email: r.email, kind: 'birthday', error: sent.error });
    else { res.sent++; await sb.from(NOTIFICATIONS).update({ message_id: sent.messageId ?? null }).in('id', ids); }
  }
  return res;
}
