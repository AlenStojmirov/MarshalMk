/**
 * Ваучери: gift vouchers sold in the shop (Task 18.2, D-048, migration 026).
 *
 * The owner (2026-11-11): a voucher has a number, who it is for or a phone,
 * and a term of 12 months from the day it was bought. Redeeming it is like an
 * exchange: its sale is deleted, the pieces taken are sold on the day the
 * voucher was bought, a top-up goes on that same day, and taking less loses
 * the rest. The cards are the products vaucer-1000, -1500, -2000; a larger
 * sum is several cards under one number. In the shop only.
 *
 * Pure: no database, no browser.
 */

import type { Product } from '@/types';
import { exchangeErrorMessage } from './exchange';

/** The category of the voucher cards. */
export const VOUCHER_CATEGORY = 'vaucer';

/** A voucher's term, in months from the day it was bought (026, voucher_term). */
export const VOUCHER_TERM_MONTHS = 12;

export interface VoucherCard {
  productId: string;
  name: string;
  size: string;
  /** What the card was sold at. */
  price: number;
}

export interface Voucher {
  id: number;
  /** Written on the card. */
  number: number;
  /** YYYY-MM-DD it was bought. */
  soldDay: string;
  /** YYYY-MM-DD, valid up to and including it. */
  expiresOn: string;
  /** Who it is for, or a phone. */
  holder: string | null;
  cards: VoucherCard[];
  amount: number;
  /** Its cards' sale was recorded by this screen (else an earlier sale was numbered). */
  soldHere: boolean;
  createdAt: string;
  createdBy: string | null;
  exchangeId: number | null;
  redeemedAt: string | null;
  redeemedBy: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
}

export type VoucherState = 'valid' | 'expired' | 'redeemed' | 'cancelled';

export const STATE_LABEL: Record<VoucherState, string> = {
  valid: 'важи',
  expired: 'истечен',
  redeemed: 'искористен',
  cancelled: 'поништен',
};

export function voucherState(v: Voucher, today: string): VoucherState {
  if (v.cancelledAt) return 'cancelled';
  if (v.redeemedAt) return 'redeemed';
  return today > v.expiresOn ? 'expired' : 'valid';
}

/** Still out: neither redeemed nor cancelled, whatever its term. */
export const isOut = (v: Voucher) => !v.redeemedAt && !v.cancelledAt;

const cents = (n: number) => Math.round((Number(n) || 0) * 100);
const key = (productId: string, day: string, price: number) => `${productId}|${day.slice(0, 10)}|${cents(price)}`;

/** A card sold on a day at a price, not yet under a number. */
export interface UnnumberedSale {
  productId: string;
  name: string;
  size: string;
  price: number;
  day: string;
  /** How many such cards. */
  count: number;
}

/**
 * Card sales in `sold[]` that no voucher still out covers, newest first, as
 * `voucher_unnumbered` (026) counts them: per card, day and price. The
 * vouchers sold before this screen, or sold in Firebase.
 */
export function unnumberedSales(cards: Product[], vouchers: Voucher[]): UnnumberedSale[] {
  const taken = new Map<string, number>();
  for (const v of vouchers) {
    if (!isOut(v)) continue;
    for (const c of v.cards) {
      const k = key(c.productId, v.soldDay, c.price);
      taken.set(k, (taken.get(k) ?? 0) + 1);
    }
  }
  const sales = new Map<string, UnnumberedSale>();
  for (const p of cards) {
    if (p.category !== VOUCHER_CATEGORY) continue;
    for (const s of p.sold ?? []) {
      const price = Number(s.price) || 0;
      if (price <= 0) continue;
      const day = String(s.soldDate).slice(0, 10);
      const k = key(p.id, day, price);
      const hit = sales.get(k);
      if (hit) hit.count += 1;
      else sales.set(k, { productId: p.id, name: p.name, size: String(s.size ?? '').trim(), price, day, count: 1 });
    }
  }
  const out: UnnumberedSale[] = [];
  for (const [k, s] of sales) {
    const left = s.count - (taken.get(k) ?? 0);
    if (left > 0) out.push({ ...s, count: left });
  }
  return out.sort((a, b) => b.day.localeCompare(a.day) || a.productId.localeCompare(b.productId));
}

/**
 * Vouchers still out whose sale is no longer in `sold[]`: redeemed or taken
 * back in Firebase and synced since. Redeeming one here is refused; the admin
 * cancels it.
 */
export function vouchersWithoutSale(cards: Product[], vouchers: Voucher[]): Set<number> {
  const sold = new Map<string, number>();
  for (const p of cards) {
    for (const s of p.sold ?? []) {
      const k = key(p.id, String(s.soldDate), Number(s.price) || 0);
      sold.set(k, (sold.get(k) ?? 0) + 1);
    }
  }
  const missing = new Set<number>();
  // Oldest numbers take the sales first: the newest are the ones left without.
  for (const v of [...vouchers].filter(isOut).sort((a, b) => a.number - b.number)) {
    for (const c of v.cards) {
      const k = key(c.productId, v.soldDay, c.price);
      const n = sold.get(k) ?? 0;
      if (n > 0) sold.set(k, n - 1);
      else missing.add(v.id);
    }
  }
  return missing;
}

/** A search for a voucher: its number, or words or digits of who it is for. */
export function voucherMatches(v: Voucher, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const n = q.replace(/^(бр\.?|#|в-?)\s*/i, '');
  if (/^\d+$/.test(n) && Number(n) === v.number) return true;
  const holder = (v.holder ?? '').toLowerCase();
  if (holder.includes(q)) return true;
  const digits = q.replace(/\D/g, '');
  return digits.length >= 3 && holder.replace(/\D/g, '').includes(digits);
}

const cardName = (c: Pick<VoucherCard, 'name' | 'size'>) => `${c.name}${c.size ? ' ' + c.size : ''}`;

/** What to enter in Firebase after selling a voucher here, while Firebase is still the source. */
export function sellFirebaseSteps(v: Voucher, fmtDay: (d: string) => string, fmtPrice: (n: number) => string): string[] {
  return v.cards.map((c) => `${cardName(c)}: продажба на ${fmtDay(v.soldDay)} по ${fmtPrice(c.price)}`);
}

/** What to enter in Firebase after cancelling a voucher sold here. */
export function cancelFirebaseSteps(v: Voucher, fmtDay: (d: string) => string, fmtPrice: (n: number) => string): string[] {
  if (!v.soldHere) return [];
  return v.cards.map((c) => `${cardName(c)}: избриши ја продажбата од ${fmtDay(v.soldDay)} по ${fmtPrice(c.price)} и врати ја картичката`);
}

/** An error from Supabase as the shop floor reads it. */
export function voucherErrorMessage(err: { message?: string; hint?: string | null; code?: string; details?: string | null } | null | undefined): string {
  const what = err?.details ? ` (${err.details})` : '';
  switch (err?.hint ?? '') {
    case 'novoucher':
      return 'Тоа не е картичка за ваучер.';
    case 'short':
      return `Нема таква картичка во фиоката${what}. Провери ја залихата на ваучерите.`;
    case 'nosale':
      return 'Таа продажба на ваучер ја нема во системот, или веќе има број. Освежи ја страната.';
    case 'nothing':
      return 'Тој ваучер не постои.';
    case 'used':
      return 'Ваучерот е веќе искористен или поништен.';
    case 'expired':
      return 'Ваучерот е истечен. Само админот може сепак да го искористи.';
    case 'unused':
      return 'Ваучерот не е искористен.';
  }
  return exchangeErrorMessage(err, '026');
}
