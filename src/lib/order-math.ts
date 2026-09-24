/**
 * Pure money arithmetic for orders.
 *
 * Kept free of any Supabase import on purpose: this is the part that decides
 * what a customer is recorded as having paid, so it has to be checkable on its
 * own, without a client, a session or a network.
 */

import { DeliveryMethod, Order } from '@/types';
import { customerShippingFor, shippingAbsorptionPerUnit } from '@/config/shipping';

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface PricedLine {
  price: number;
  quantity: number;
}

export interface OrderPricing<T extends PricedLine> {
  /** What the customer agreed to pay for the goods, before any absorption. */
  grossSubtotal: number;
  /** The lines as they will be stored — prices reduced when shipping is absorbed. */
  items: T[];
  /** Courier cost taken out of the item prices (D-006). Zero for pickup. */
  absorbed: number;
  shipping: number;
  /** Product revenue: what belongs to the goods, net of any absorption. */
  subtotal: number;
  /** What is collected. Always subtotal + shipping. */
  total: number;
}

/**
 * The money on an order, by how it reaches the customer.
 *
 * Moved out of the order route so it can be checked on its own: this decides
 * what a customer pays and what each product is recorded as having sold for,
 * and a route that writes to the database is the wrong place to find out it is
 * off by 170.
 *
 * Three branches, and they are not two:
 *  - courier below the threshold: customer pays shipping on top, prices stand.
 *  - courier above it: shipping free to the customer, but the courier is still
 *    paid, so the cost comes out of the item prices (D-006).
 *  - pickup: no courier at all, so nothing is absorbed and the prices stand
 *    exactly as sold. Its zero is not the same zero as free delivery (D-011).
 */
export function priceOrder<T extends PricedLine>(
  lines: T[],
  method: DeliveryMethod
): OrderPricing<T> {
  const grossSubtotal = round2(
    lines.reduce((sum, l) => sum + Number(l.price) * Number(l.quantity), 0)
  );
  const customerShipping = customerShippingFor(method, grossSubtotal);

  let items = lines;
  let absorbed = 0;

  if (customerShipping === 0 && method === 'courier') {
    const totalUnits = lines.reduce((sum, l) => sum + Number(l.quantity), 0);
    const perUnit = shippingAbsorptionPerUnit(totalUnits);
    items = lines.map((l) => {
      // Clamp so a cheap line can never go negative; `absorbed` tracks what
      // was actually taken either way, so the order still reconciles.
      const reduction = Math.min(perUnit, Number(l.price));
      absorbed += reduction * Number(l.quantity);
      return { ...l, price: round2(Number(l.price) - reduction) };
    });
    absorbed = round2(absorbed);
  }

  const shipping = customerShipping === 0 ? absorbed : customerShipping;
  const subtotal = round2(grossSubtotal - absorbed);
  return { grossSubtotal, items, absorbed, shipping, subtotal, total: round2(subtotal + shipping) };
}

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
