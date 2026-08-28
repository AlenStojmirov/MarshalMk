/**
 * Pure money arithmetic for orders.
 *
 * Kept free of any Supabase import on purpose: this is the part that decides
 * what a customer is recorded as having paid, so it has to be checkable on its
 * own, without a client, a session or a network.
 */

import { Order } from '@/types';

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface CorrectionLine {
  productId: string;
  size?: string;
  quantity: number;
  oldPrice: number;
  newPrice: number;
}

export interface CorrectionPreview {
  items: CorrectionLine[];
  itemsTotal: number;
  shipping: number;
  /** What the order will actually be set to. */
  total: number;
  /** What was typed in. */
  requested: number;
  /** False when whole-denar prices cannot hit the requested total exactly. */
  exact: boolean;
}

/**
 * Per-item prices for a corrected collected amount.
 *
 * The difference is spread across the lines in proportion to their value, and
 * the last line absorbs the rounding so the parts add back up to the whole.
 */
export function previewCorrection(order: Order, collectedTotal: number): CorrectionPreview {
  const shipping = Number(order.shipping) || 0;
  const targetItems = Math.round(collectedTotal - shipping);

  const lines = order.items.map((i) => ({
    productId: i.productId,
    size: i.size,
    quantity: Math.max(1, Math.round(i.quantity || 1)),
    oldPrice: Number(i.price) || 0,
  }));
  const currentTotal = lines.reduce((a, l) => a + l.oldPrice * l.quantity, 0);
  const factor = currentTotal > 0 ? targetItems / currentTotal : 0;

  // Whole denars. The denar has no practical subunit in retail, and prices with
  // decimals would also be the one thing the shop cannot actually charge.
  const priced: CorrectionLine[] = lines.map((l) => ({
    ...l,
    newPrice: Math.max(0, Math.round(l.oldPrice * factor)),
  }));

  // The last line carries the remainder, in whole denars. Its quantity may not
  // divide the remainder evenly, so the achievable total can sit a denar or two
  // from what was asked for — `total` reports what is actually achievable and
  // `requested` keeps what was typed, so the UI can say so rather than quietly
  // booking a different number.
  if (priced.length > 0) {
    const last = priced[priced.length - 1];
    const others = priced.slice(0, -1).reduce((a, l) => a + l.newPrice * l.quantity, 0);
    last.newPrice = Math.max(0, Math.round((targetItems - others) / last.quantity));
  }

  const itemsTotal = priced.reduce((a, l) => a + l.newPrice * l.quantity, 0);
  return {
    items: priced,
    itemsTotal,
    shipping,
    total: round2(itemsTotal + shipping),
    requested: round2(collectedTotal),
    exact: Math.abs(itemsTotal + shipping - collectedTotal) < 0.005,
  };
}
