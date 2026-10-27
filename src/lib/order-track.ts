/**
 * Following an order without an account (Task 15.2): what anyone holding the
 * order number *and* the phone it was placed with may see, and how the
 * confirmation page finds its own order again.
 *
 * The number alone used to return the whole order — name, phone, e-mail,
 * address, notes, account, points — and the number travels: in the
 * confirmation link, in the shop's e-mail, on screenshots. Now the phone must
 * match too, and even then the answer carries nothing about the person: where
 * the order is, what was in it and what is to be paid.
 *
 * No price per line and no delivery charge, as on /account (13.9): above the
 * threshold the stored prices carry the courier absorbed into them (D-006), so
 * they would neither match what the customer saw at checkout nor add up to the
 * total. The total is what is collected, delivery included.
 */

import type { DeliveryMethod, OrderOutcome, OrderStatus } from '@/types';

export interface TrackedOrder {
  orderNumber: string;
  createdAt: string;
  status: OrderStatus;
  outcome: OrderOutcome | null;
  deliveryMethod: DeliveryMethod;
  items: Array<{
    productName: string;
    productImage: string;
    size: string | null;
    quantity: number;
    /** Bought on sale — a badge only; the amounts stay out (see above). */
    onSale: boolean;
  }>;
  /** What is collected, delivery included. */
  total: number;
}

/** Longest order number worth looking up; the shop's are under 20 characters. */
export const ORDER_NUMBER_MAX = 40;

/** An `orders` row as read for tracking, reduced to what may be shown. */
export function toTrackedOrder(row: {
  order_number: string;
  created_at: string;
  status: OrderStatus;
  outcome?: OrderOutcome | null;
  customer?: { deliveryMethod?: DeliveryMethod } | null;
  items?: Array<Record<string, unknown>> | null;
  total: number | string;
}): TrackedOrder {
  return {
    orderNumber: row.order_number,
    createdAt: row.created_at,
    status: row.status,
    outcome: row.outcome ?? null,
    // Absent on orders from before pickup existed, which were all couriers (D-011).
    deliveryMethod: row.customer?.deliveryMethod === 'pickup' ? 'pickup' : 'courier',
    items: (row.items ?? []).map((i) => ({
      productName: String(i.productName ?? ''),
      productImage: typeof i.productImage === 'string' ? i.productImage : '',
      size: typeof i.size === 'string' && i.size ? i.size : null,
      quantity: Number(i.quantity) || 1,
      onSale: typeof i.originalPrice === 'number' && i.originalPrice > Number(i.price),
    })),
    total: Number(row.total) || 0,
  };
}

// ---------------------------------------------------------------------------
// The confirmation page's own order, in this tab only
// ---------------------------------------------------------------------------

/**
 * What the checkout leaves for the confirmation page: the number and phone to
 * look the order up with, and the contact details the customer has just typed,
 * to show back to them. In `sessionStorage`, so it lives as long as the tab,
 * survives a refresh and is never sent anywhere; a link opened elsewhere
 * carries only the number, which shows nothing.
 */
export interface PlacedOrder {
  orderNumber: string;
  phone: string;
  firstName: string;
  lastName: string;
  email: string;
  address: string;
  city: string;
  notes: string;
}

const PLACED_KEY = 'marshal:placed-order';

export function rememberPlacedOrder(o: PlacedOrder): void {
  try {
    sessionStorage.setItem(PLACED_KEY, JSON.stringify(o));
  } catch {
    // Private mode or storage off: the confirmation falls back to the number.
  }
}

/** The order placed from this tab, if it is the one asked for. */
export function recallPlacedOrder(orderNumber: string): PlacedOrder | null {
  try {
    const o = JSON.parse(sessionStorage.getItem(PLACED_KEY) ?? 'null') as PlacedOrder | null;
    return o && o.orderNumber === orderNumber && typeof o.phone === 'string' ? o : null;
  } catch {
    return null;
  }
}

/** Look an order up by number and phone. A wrong pair reads exactly like a number that does not exist. */
export async function fetchTrackedOrder(
  orderNumber: string,
  phone: string
): Promise<{ order: TrackedOrder } | { error: 'not_found' | 'too_many' | 'failed' }> {
  try {
    const res = await fetch('/api/orders/track', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderNumber, phone }),
    });
    if (res.status === 404 || res.status === 400) return { error: 'not_found' };
    if (res.status === 429) return { error: 'too_many' };
    const data = await res.json().catch(() => null);
    return res.ok && data?.order ? { order: data.order as TrackedOrder } : { error: 'failed' };
  } catch {
    return { error: 'failed' };
  }
}
