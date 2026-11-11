/**
 * Exchanges in the database (Task 18.1, migration 025).
 *
 * Reads go to the table; the two writes, making and undoing an exchange, are
 * functions in 025 called from stock.ts with every other write to stock.
 *
 * Takes the client as an argument, so it never pulls supabase-js onto a page
 * by itself (16.11).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingRelation } from './product-views';
import {
  exchangeErrorMessage,
  type Exchange, type ExchangeGivenPiece, type ExchangePiece,
} from './exchange';

interface PieceRow {
  product: string;
  name: string | null;
  category: string | null;
  size: string | null;
  price: number | string;
  agreed?: number | string;
  list?: number | string;
}

export interface ExchangeRow {
  id: number;
  made_at: string;
  made_by: string | null;
  kind?: 'exchange' | 'voucher';
  purchase_day: string;
  returned: PieceRow[];
  given: PieceRow[];
  returned_total: number | string;
  given_total: number | string;
  top_up: number | string;
  top_up_day?: string | null;
  channel: 'store' | 'online';
  order_number: string | null;
  note: string | null;
  undone_at: string | null;
  undone_by: string | null;
}

const num = (v: unknown) => Number(v) || 0;

const piece = (r: PieceRow): ExchangePiece => ({
  productId: r.product,
  name: r.name ?? r.product,
  category: r.category ?? '',
  size: r.size ?? '',
  price: num(r.price),
});

const givenPiece = (r: PieceRow): ExchangeGivenPiece => ({ ...piece(r), agreed: num(r.agreed), list: num(r.list) });

export const rowToExchange = (r: ExchangeRow): Exchange => ({
  id: Number(r.id),
  madeAt: r.made_at,
  madeBy: r.made_by,
  kind: r.kind ?? 'exchange',
  purchaseDay: String(r.purchase_day).slice(0, 10),
  returned: (r.returned ?? []).map(piece),
  given: (r.given ?? []).map(givenPiece),
  returnedTotal: num(r.returned_total),
  givenTotal: num(r.given_total),
  topUp: num(r.top_up),
  topUpDay: r.top_up_day ? String(r.top_up_day).slice(0, 10) : null,
  channel: r.channel,
  orderNumber: r.order_number,
  note: r.note,
  undoneAt: r.undone_at,
  undoneBy: r.undone_by,
});

/** An error from Supabase as the shop floor reads it. */
export class ExchangeError extends Error {
  hint: string;
  constructor(err: { message?: string; hint?: string | null; code?: string; details?: string | null }, migration = '025') {
    super(exchangeErrorMessage(err, migration));
    this.hint = err.hint ?? '';
  }
}

export interface ExchangeList {
  /** Migration 025 has not run yet. */
  missing: boolean;
  list: Exchange[];
}

/** The latest exchanges, newest first; redeemed vouchers are listed with the vouchers. */
export async function fetchExchanges(sb: SupabaseClient, limit = 30): Promise<ExchangeList> {
  const { data, error } = await sb
    .from('exchanges')
    .select('*')
    .eq('kind', 'exchange')
    .order('made_at', { ascending: false })
    .limit(limit);
  if (isMissingRelation(error)) return { missing: true, list: [] };
  if (error) throw new ExchangeError(error);
  return { missing: false, list: ((data as ExchangeRow[]) ?? []).map(rowToExchange) };
}

/** A top-up as money taken in on its day, without a piece of its own (D-047). */
export interface TopUp {
  exchangeId: number;
  /** YYYY-MM-DD it was paid. */
  day: string;
  amount: number;
  /** What came back and what went out, for a line among the day's sales. */
  returned: string[];
  given: string[];
}

/**
 * Every top-up still standing, oldest first. The sales screens add them to the
 * day they were paid; the pieces themselves are already in `sold[]` on the
 * purchase day. Empty until 025 runs.
 */
export async function fetchTopUps(sb: SupabaseClient): Promise<TopUp[]> {
  const { data, error } = await sb
    .from('exchanges')
    .select('id, top_up, top_up_day, returned, given')
    .not('top_up_day', 'is', null)
    .is('undone_at', null)
    .order('top_up_day', { ascending: true });
  if (isMissingRelation(error)) return [];
  if (error) throw new ExchangeError(error);
  const label = (r: PieceRow) => `${r.name ?? r.product}${r.size ? ' ' + r.size : ''}`;
  type Row = Pick<ExchangeRow, 'id' | 'top_up' | 'top_up_day' | 'returned' | 'given'>;
  return ((data as Row[]) ?? []).map((r) => ({
    exchangeId: Number(r.id),
    day: String(r.top_up_day).slice(0, 10),
    amount: num(r.top_up),
    returned: (r.returned ?? []).map(label),
    given: (r.given ?? []).map(label),
  }));
}

/** Top-ups added up by the first `len` characters of their day: 10 by day, 7 by month. */
export function topUpTotals(list: TopUp[], len: 7 | 10): Map<string, number> {
  const out = new Map<string, number>();
  for (const t of list) out.set(t.day.slice(0, len), (out.get(t.day.slice(0, len)) ?? 0) + t.amount);
  return out;
}
