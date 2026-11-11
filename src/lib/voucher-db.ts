/**
 * Vouchers in the database (Task 18.2, migration 026).
 *
 * Reads go to the table. Numbering a card sold earlier writes no stock and
 * lives here; selling, redeeming, undoing and cancelling move cards and
 * pieces, so they are in stock.ts with every other write to stock.
 *
 * Takes the client as an argument, so it never pulls supabase-js onto a page
 * by itself (16.11).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { isMissingRelation } from './product-views';
import { voucherErrorMessage, type Voucher } from './vouchers';

interface CardRow {
  product: string;
  name: string | null;
  size: string | null;
  price: number | string;
}

export interface VoucherRow {
  id: number;
  number: number;
  sold_day: string;
  expires_on: string;
  holder: string | null;
  cards: CardRow[];
  amount: number | string;
  sold_here: boolean;
  created_at: string;
  created_by: string | null;
  exchange_id: number | null;
  redeemed_at: string | null;
  redeemed_by: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
}

export const rowToVoucher = (r: VoucherRow): Voucher => ({
  id: Number(r.id),
  number: Number(r.number),
  soldDay: String(r.sold_day).slice(0, 10),
  expiresOn: String(r.expires_on).slice(0, 10),
  holder: r.holder,
  cards: (r.cards ?? []).map((c) => ({
    productId: c.product,
    name: c.name ?? c.product,
    size: c.size ?? '',
    price: Number(c.price) || 0,
  })),
  amount: Number(r.amount) || 0,
  soldHere: r.sold_here,
  createdAt: r.created_at,
  createdBy: r.created_by,
  exchangeId: r.exchange_id === null ? null : Number(r.exchange_id),
  redeemedAt: r.redeemed_at,
  redeemedBy: r.redeemed_by,
  cancelledAt: r.cancelled_at,
  cancelledBy: r.cancelled_by,
});

/** An error from Supabase as the shop floor reads it. */
export class VoucherError extends Error {
  hint: string;
  constructor(err: { message?: string; hint?: string | null; code?: string; details?: string | null }) {
    super(voucherErrorMessage(err));
    this.hint = err.hint ?? '';
  }
}

export interface VoucherList {
  /** Migration 026 has not run yet. */
  missing: boolean;
  list: Voucher[];
}

/** Every voucher, newest number first. A few a month: all of them fit. */
export async function fetchVouchers(sb: SupabaseClient): Promise<VoucherList> {
  const { data, error } = await sb.from('vouchers').select('*').order('number', { ascending: false }).limit(2000);
  if (isMissingRelation(error)) return { missing: true, list: [] };
  if (error) throw new VoucherError(error);
  return { missing: false, list: ((data as VoucherRow[]) ?? []).map(rowToVoucher) };
}

/**
 * Give the next number to a card sold earlier (`voucher_number_sale`): the
 * vouchers out before this screen, or one sold in Firebase. The sale stays.
 */
export async function numberSale(
  sb: SupabaseClient,
  productId: string,
  day: string,
  price: number,
  holder: string,
): Promise<Voucher> {
  const { data, error } = await sb.rpc('voucher_number_sale', {
    p_product: productId,
    p_day: day,
    p_price: price,
    p_holder: holder || null,
  });
  if (error) throw new VoucherError(error);
  return rowToVoucher(data as VoucherRow);
}
