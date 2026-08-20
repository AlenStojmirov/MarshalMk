/**
 * Cost and margin helpers.
 *
 * The Firebase RTDB inventory stores `purchasePrice` **doubled** — the real cost
 * of one unit is half the stored value. Confirmed by the store owner on
 * 2026-08-15; see `docs/DECISIONS.md` D-002.
 *
 * Rules:
 *  - Every read of a raw Firebase `purchasePrice` goes through `realPurchasePrice()`.
 *  - `products.purchase_price` in Supabase is already corrected at sync time and
 *    must NOT be divided again.
 */

/** Firebase stores the value doubled. Do not inline this number anywhere else. */
export const FIREBASE_PURCHASE_PRICE_DIVISOR = 2;

/**
 * Real unit cost from a raw Firebase `purchasePrice`.
 * Returns `undefined` when the source has no usable value, so callers can tell
 * "cost unknown" apart from "cost is zero".
 */
export function realPurchasePrice(
  rawFirebaseValue: number | string | null | undefined
): number | undefined {
  if (rawFirebaseValue === null || rawFirebaseValue === undefined || rawFirebaseValue === '') {
    return undefined;
  }
  const n = Number(rawFirebaseValue);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return n / FIREBASE_PURCHASE_PRICE_DIVISOR;
}

/**
 * Gross margin as a fraction of the selling price (0–1).
 *
 * This is the real margin — what share of each denar taken stays with the store.
 * Not to be confused with markup. Returns null when either side is unknown.
 */
export function grossMargin(price: number, cost: number | undefined): number | null {
  if (cost === undefined) return null;
  if (!Number.isFinite(price) || price <= 0) return null;
  if (!Number.isFinite(cost) || cost <= 0) return null;
  return (price - cost) / price;
}

/**
 * Markup as a fraction of cost (0–1+).
 *
 * Buying at 1.000 and selling at 2.000 is 100% markup but only 50% margin.
 * Both are shown in the admin so the two are never conflated.
 */
export function markup(price: number, cost: number | undefined): number | null {
  if (cost === undefined) return null;
  if (!Number.isFinite(price) || price <= 0) return null;
  if (!Number.isFinite(cost) || cost <= 0) return null;
  return (price - cost) / cost;
}
