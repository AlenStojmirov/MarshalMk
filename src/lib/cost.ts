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
 * Margin bands, shared so every screen draws the same lines.
 *
 * Below `MARGIN_LOW` a sale barely covers the handling; below `MARGIN_WATCH` it
 * contributes but not enough to carry its share of the shop. Neither is the
 * break-even margin — that depends on revenue and is computed where it is
 * shown, because at 104.000 den. a month against 65.000 of costs it sits above
 * 60% and quoting it as a fixed number would go stale the moment revenue moves.
 */
export const MARGIN_LOW = 0.25;
export const MARGIN_WATCH = 0.4;

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
 * Absolute gross profit on one unit, or null when the cost is unknown.
 *
 * The percentage answers "is this worth selling"; the denar figure answers
 * "how much does one sale actually bring". A 40% margin on a 500-den. shirt and
 * on a 5.000-den. coat are the same number and very different sales.
 */
export function unitProfit(price: number, cost: number | undefined): number | null {
  if (cost === undefined) return null;
  if (!Number.isFinite(price) || !Number.isFinite(cost)) return null;
  return price - cost;
}

/**
 * The lowest a markdown should ever go: cost plus 15%.
 *
 * Below this a sale stops recovering capital and starts destroying it — the
 * pieces leave, the money does not come back, and the shelf space was paid for
 * twice. Shared so the clearance tool and the price form cannot drift apart on
 * where the line sits (docs/TURNAROUND.md).
 */
export const MARKDOWN_FLOOR = 1.15;

/** The floor as an actual price, rounded up so it is never short. */
export function markdownFloorPrice(cost: number | undefined): number | null {
  if (cost === undefined || !Number.isFinite(cost) || cost <= 0) return null;
  return Math.ceil(cost * MARKDOWN_FLOOR);
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
