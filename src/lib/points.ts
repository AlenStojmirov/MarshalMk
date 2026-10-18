/**
 * The points ledger (EPIC 13, Task 13.3, migration 015, D-031, D-032).
 *
 * Points are movements, never a balance field. Credits are lots, each with its
 * own dates and what is left of it; spending takes from the lots that expire
 * first. The database does the writing (functions under a lock per customer);
 * this file reads the rows and says what they add up to, and wraps the calls.
 *
 * Expiry is read, not written: a lot past its date with points left has
 * expired, so the history shows it as an expiry on that date without any job
 * having run.
 *
 * Takes the Supabase client as an argument, like product-attributes.ts: the
 * customer's browser client reads their own rows (RLS), the admin's reads all
 * and may adjust, the server (service role) credits, spends and cancels.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { LoyaltySettings } from './loyalty-settings';

export const POINTS_LEDGER = 'points_ledger';

/**
 * Points that come back from a cancelled order after the lot they were spent
 * from has expired are a new lot of this many days, so a cancellation never
 * costs the customer points (passed to points_cancel_order).
 */
export const RETURN_GRACE_DAYS = 30;

export const CREDIT_KINDS = ['earn', 'bonus', 'wheel', 'adjust_add', 'return'] as const;
export const DEBIT_KINDS = ['redeem', 'adjust_remove', 'cancel'] as const;
export type PointsKind = (typeof CREDIT_KINDS)[number] | (typeof DEBIT_KINDS)[number];

export interface PointsRow {
  id: string;
  user_id: string;
  kind: PointsKind;
  points: number;
  remaining: number | null;
  available_at: string | null;
  expires_at: string | null;
  order_id: string | null;
  order_number: string | null;
  related_id: string | null;
  reversed_at: string | null;
  reason: string | null;
  created_by: string | null;
  created_at: string;
}

export interface PointsMovement {
  id: string;
  userId: string;
  kind: PointsKind;
  points: number;
  /** Lots only. */
  remaining?: number;
  availableAt?: Date;
  expiresAt?: Date;
  orderId?: string;
  orderNumber?: string;
  relatedId?: string;
  reversedAt?: Date;
  reason?: string;
  createdAt: Date;
}

const toDate = (s: string | null) => (s ? new Date(s) : undefined);

export function rowToMovement(r: PointsRow): PointsMovement {
  return {
    id: r.id,
    userId: r.user_id,
    kind: r.kind,
    points: Number(r.points),
    remaining: r.remaining === null ? undefined : Number(r.remaining),
    availableAt: toDate(r.available_at),
    expiresAt: toDate(r.expires_at),
    orderId: r.order_id ?? undefined,
    orderNumber: r.order_number ?? undefined,
    relatedId: r.related_id ?? undefined,
    reversedAt: toDate(r.reversed_at),
    reason: r.reason ?? undefined,
    createdAt: new Date(r.created_at),
  };
}

export const isCredit = (k: PointsKind) => (CREDIT_KINDS as readonly string[]).includes(k);

/** Where a lot stands at `now`. */
export type LotState = 'awaiting' | 'waiting' | 'active' | 'expired' | 'used';

export function lotState(m: PointsMovement, now: Date): LotState {
  if ((m.remaining ?? 0) === 0) return 'used';
  if (!m.availableAt) return 'awaiting';
  if (m.availableAt > now) return 'waiting';
  if (m.expiresAt && m.expiresAt <= now) return 'expired';
  return 'active';
}

export interface PointsSummary {
  /** Spendable now; one point is one denar. */
  active: number;
  /** Waiting: for the order to be delivered and paid, or for the waiting period after it. */
  pending: number;
  expired: number;
  /** Active points lapsing within `soonDays`. */
  expiringSoon: number;
  /** The first date active points lapse, and how many. */
  nextExpiry?: Date;
  nextExpiryPoints: number;
}

export function summarizePoints(ms: PointsMovement[], now: Date, soonDays = 30): PointsSummary {
  const soon = new Date(now.getTime() + soonDays * 86_400_000);
  const s: PointsSummary = { active: 0, pending: 0, expired: 0, expiringSoon: 0, nextExpiryPoints: 0 };
  for (const m of ms) {
    if (!isCredit(m.kind)) continue;
    const left = m.remaining ?? 0;
    const state = lotState(m, now);
    if (state === 'awaiting' || state === 'waiting') s.pending += left;
    else if (state === 'expired') s.expired += left;
    else if (state === 'active') {
      s.active += left;
      if (m.expiresAt && m.expiresAt <= soon) s.expiringSoon += left;
      if (m.expiresAt) {
        const t = m.expiresAt.getTime();
        if (!s.nextExpiry || t < s.nextExpiry.getTime()) { s.nextExpiry = m.expiresAt; s.nextExpiryPoints = left; }
        else if (t === s.nextExpiry.getTime()) s.nextExpiryPoints += left;
      }
    }
  }
  return s;
}

export type HistoryKind = PointsKind | 'expired';

export interface HistoryEntry {
  key: string;
  at: Date;
  kind: HistoryKind;
  /** Signed: + in, − out. */
  points: number;
  orderNumber?: string;
  /** Lots: their state and dates. */
  state?: LotState;
  availableAt?: Date;
  expiresAt?: Date;
  reason?: string;
  /** Spending a cancelled order gave back. */
  reversed?: boolean;
}

export const HISTORY_LABEL: Record<HistoryKind, string> = {
  earn: 'Заработени',
  bonus: 'Бонус',
  wheel: 'Тркало на среќа',
  adjust_add: 'Додадени',
  return: 'Вратени',
  redeem: 'Потрошени',
  adjust_remove: 'Одземени',
  cancel: 'Одземени · откажана нарачка',
  expired: 'Истечени',
};

/**
 * Every movement, newest first, plus an expiry entry for each lot that lapsed
 * with points left, on the day it lapsed.
 */
export function pointsHistory(ms: PointsMovement[], now: Date): HistoryEntry[] {
  const out: HistoryEntry[] = [];
  for (const m of ms) {
    const credit = isCredit(m.kind);
    out.push({
      key: m.id,
      at: m.createdAt,
      kind: m.kind,
      points: credit ? m.points : -m.points,
      orderNumber: m.orderNumber,
      state: credit ? lotState(m, now) : undefined,
      availableAt: m.availableAt,
      expiresAt: m.expiresAt,
      reason: m.reason,
      reversed: m.kind === 'redeem' && !!m.reversedAt,
    });
    if (credit && lotState(m, now) === 'expired' && m.expiresAt) {
      out.push({ key: m.id + ':expired', at: m.expiresAt, kind: 'expired', points: -(m.remaining ?? 0), orderNumber: m.orderNumber });
    }
  }
  return out.sort((a, b) => b.at.getTime() - a.at.getTime());
}

/** When a lot that becomes active at `from` lapses: wheel prizes sooner (D-032). */
export function expiryFor(kind: PointsKind, from: Date, s: LoyaltySettings): Date {
  const d = new Date(from);
  if (kind === 'wheel') d.setDate(d.getDate() + s.wheelPointsExpiryDays);
  else d.setMonth(d.getMonth() + s.expiryMonths);
  return d;
}

// ---------------------------------------------------------------------------
// Reading and writing
// ---------------------------------------------------------------------------

export interface PointsRead<T> {
  data: T;
  /** Migration 015 has not run. */
  missingTable: boolean;
  error?: string;
}

function isMissing(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return ['42P01', 'PGRST205', 'PGRST202', '42883'].includes(err.code ?? '') ||
    /does not exist|schema cache|could not find the function/i.test(err.message ?? '');
}

export async function fetchPointsMovements(sb: SupabaseClient, userId: string): Promise<PointsRead<PointsMovement[]>> {
  const out: PointsMovement[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(POINTS_LEDGER).select('*').eq('user_id', userId)
      .order('created_at', { ascending: false }).range(from, from + 999);
    if (error) return { data: out, missingTable: isMissing(error), error: error.message };
    out.push(...((data ?? []) as PointsRow[]).map(rowToMovement));
    if ((data ?? []).length < 1000) break;
  }
  return { data: out, missingTable: false };
}

export interface FoundUser { userId: string; email: string; createdAt: Date }

/** The admin finds a customer by e-mail (auth.users is not readable from the browser). */
export async function findUserByEmail(sb: SupabaseClient, email: string): Promise<PointsRead<FoundUser | null>> {
  const { data, error } = await sb.rpc('points_find_user', { p_email: email });
  if (error) return { data: null, missingTable: isMissing(error), error: error.message };
  const row = ((data ?? []) as Array<{ user_id: string; email: string; created_at: string }>)[0];
  return { data: row ? { userId: row.user_id, email: row.email, createdAt: new Date(row.created_at) } : null, missingTable: false };
}

/** The admin adds (+) or removes (−) points, always with a reason. Added points need an expiry. */
export async function adjustPoints(sb: SupabaseClient, userId: string, delta: number, reason: string, expiresAt?: Date): Promise<{ error?: string }> {
  const { error } = await sb.rpc('points_adjust', {
    p_user: userId, p_delta: delta, p_reason: reason, p_expires_at: expiresAt ? expiresAt.toISOString() : null,
  });
  return error ? { error: /not enough points/.test(error.message) ? 'Купувачот нема толку активни поени.' : error.message } : {};
}

// Server (service role): used by the order (13.7), its outcome (13.8) and the wheel (13.10).

export async function creditPoints(sb: SupabaseClient, a: {
  userId: string; kind: 'earn' | 'bonus' | 'wheel'; points: number;
  availableAt?: Date; expiresAt?: Date; orderId?: string; orderNumber?: string; reason?: string;
}): Promise<{ id?: string; error?: string }> {
  const { data, error } = await sb.rpc('points_credit', {
    p_user: a.userId, p_kind: a.kind, p_points: a.points,
    p_available_at: a.availableAt?.toISOString() ?? null, p_expires_at: a.expiresAt?.toISOString() ?? null,
    p_order_id: a.orderId ?? null, p_order_number: a.orderNumber ?? null, p_reason: a.reason ?? null,
  });
  return error ? { error: error.message } : { id: data as string };
}

export async function redeemPoints(sb: SupabaseClient, userId: string, points: number, orderId: string, orderNumber: string): Promise<{ id?: string; error?: string }> {
  const { data, error } = await sb.rpc('points_redeem', { p_user: userId, p_points: points, p_order_id: orderId, p_order_number: orderNumber });
  return error ? { error: error.message } : { id: data as string };
}

export async function activateLot(sb: SupabaseClient, lotId: string, availableAt: Date, expiresAt: Date): Promise<{ activated: boolean; error?: string }> {
  const { data, error } = await sb.rpc('points_activate', {
    p_lot: lotId, p_available_at: availableAt.toISOString(), p_expires_at: expiresAt.toISOString(),
  });
  return error ? { activated: false, error: error.message } : { activated: data === true };
}

export async function cancelOrderPoints(sb: SupabaseClient, orderId: string): Promise<{ voided: number; returned: number; error?: string }> {
  const { data, error } = await sb.rpc('points_cancel_order', { p_order_id: orderId, p_grace_days: RETURN_GRACE_DAYS });
  if (error) return { voided: 0, returned: 0, error: error.message };
  const r = (data ?? {}) as { voided?: number; returned?: number };
  return { voided: Number(r.voided) || 0, returned: Number(r.returned) || 0 };
}
