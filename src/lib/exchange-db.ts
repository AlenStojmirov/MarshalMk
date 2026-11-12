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
