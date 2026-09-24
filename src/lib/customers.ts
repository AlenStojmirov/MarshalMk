/**
 * Online customers and how their orders ended (Tasks 7.1, 7.2, 7.4).
 *
 * There is no customers table and none is needed at this size: a person is
 * their phone number. Email is optional to fake and names are typed however
 * someone feels that day, but a courier has to reach a phone, so it is the one
 * field a real customer gets right. Numbers are normalised first, because
 * "+389 70 123 456", "070123456" and "70 123 456" are the same person.
 *
 * Only online orders are covered. The shop counter records sales, not who made
 * them, so an in-store regular is invisible here — the repeat rate is the
 * online repeat rate and says so wherever it is shown.
 */

import { Order, OrderOutcome } from '@/types';
import { SHIPPING_CONFIG } from '@/config/shipping';

/**
 * A Macedonian number in one canonical local form: `0` + 8 digits, e.g.
 * `070123456`. Country code (+389 / 00389 / 389) and punctuation are stripped;
 * a number missing its leading zero gets one. Anything that still does not look
 * like a local number is kept as its bare digits rather than guessed at, so two
 * foreign numbers never collapse into one.
 */
export function normalizePhone(raw: string | undefined | null): string {
  let d = String(raw ?? '').replace(/\D+/g, '');
  if (d.startsWith('00389')) d = d.slice(5);
  else if (d.startsWith('389') && d.length >= 11) d = d.slice(3);
  if (d.length === 8 && /^[2-9]/.test(d)) d = '0' + d;
  return d;
}

/**
 * `cancelled` is an order the shop called off itself — spam, a duplicate, a
 * change of mind before dispatch. It never reached the customer, so it is
 * neither paid nor refused and stays out of every rate.
 */
export type OutcomeOrOpen = OrderOutcome | 'open' | 'cancelled';

/** How an order stands: its recorded outcome, or open / cancelled if none. */
export function outcomeOf(o: Order): OutcomeOrOpen {
  if (o.outcome) return o.outcome;
  // Delivered before outcomes existed: that status meant paid.
  if (o.status === 'delivered') return 'delivered';
  if (o.status === 'cancelled') return 'cancelled';
  return 'open';
}

export interface Customer {
  phone: string;
  name: string;
  email: string;
  city: string;
  orders: Order[];
  /** Orders that ended paid. */
  paid: number;
  /** Orders that ended refused, returned or uncollected. */
  failed: number;
  /** Money actually taken — paid orders only, product revenue (subtotal). */
  paidRevenue: number;
  firstAt: Date;
  lastAt: Date;
}

/** Everyone who ever ordered, newest activity first. Cancelled-by-us orders count as neither paid nor failed. */
export function buildCustomers(orders: Order[]): Customer[] {
  const byPhone = new Map<string, Customer>();

  for (const o of [...orders].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    const phone = normalizePhone(o.customer.phone);
    if (!phone) continue;
    const c = byPhone.get(phone) ?? {
      phone, name: '', email: '', city: '', orders: [], paid: 0, failed: 0,
      paidRevenue: 0, firstAt: o.createdAt, lastAt: o.createdAt,
    };
    c.orders.push(o);
    // The latest order has the freshest name and address.
    c.name = `${o.customer.firstName} ${o.customer.lastName}`.trim() || c.name;
    c.email = o.customer.email || c.email;
    c.city = o.customer.city || c.city;
    c.lastAt = o.createdAt;

    const out = outcomeOf(o);
    if (out === 'delivered') {
      c.paid += 1;
      c.paidRevenue += o.subtotal;
    } else if (out !== 'open' && out !== 'cancelled') {
      c.failed += 1;
    }
    byPhone.set(phone, c);
  }

  return [...byPhone.values()].sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime());
}

export interface RepeatStats {
  customers: number;
  /** Customers with two or more orders in the window. */
  repeat: number;
  repeatRate: number | null;
  /** Paid revenue per customer, over everyone who ever paid. */
  ltv: number | null;
}

/**
 * The share of customers in the last `days` who ordered more than once.
 *
 * Counted on orders placed, not paid: someone who ordered twice and refused
 * once still came back, which is what the rate is asking about.
 */
export function repeatStats(customers: Customer[], now: number, days = 365): RepeatStats {
  const cutoff = now - days * 86_400_000;
  const active = customers.filter((c) => c.lastAt.getTime() >= cutoff);
  const repeat = active.filter((c) => c.orders.filter((o) => o.createdAt.getTime() >= cutoff).length >= 2).length;
  const payers = customers.filter((c) => c.paid > 0);
  return {
    customers: active.length,
    repeat,
    repeatRate: active.length > 0 ? repeat / active.length : null,
    ltv: payers.length > 0 ? payers.reduce((a, c) => a + c.paidRevenue, 0) / payers.length : null,
  };
}

export interface OutcomeBucket {
  label: string;
  closed: number;
  failed: number;
  /** failed / closed, or null when nothing has closed yet. */
  rate: number | null;
}

export interface OutcomeStats {
  counts: Record<OutcomeOrOpen, number>;
  closed: number;
  failed: number;
  failRate: number | null;
  /**
   * What refusals cost in courier fees — an estimate, and labelled as one. A
   * refused courier parcel is paid out and paid back; the real tariff is the
   * courier's, this uses the checkout shipping price for both legs. Pickup
   * orders that are never collected cost nothing but the shelf time.
   */
  estimatedCost: number;
  byMethod: OutcomeBucket[];
  byValue: OutcomeBucket[];
  byCity: OutcomeBucket[];
  byCustomer: OutcomeBucket[];
}

const FAILED: OrderOutcome[] = ['refused', 'returned', 'not_collected'];

function bucket(label: string, orders: Order[]): OutcomeBucket {
  const closed = orders.filter((o) => outcomeOf(o) !== 'open' && outcomeOf(o) !== 'cancelled');
  const failed = closed.filter((o) => FAILED.includes(outcomeOf(o) as OrderOutcome)).length;
  return { label, closed: closed.length, failed, rate: closed.length > 0 ? failed / closed.length : null };
}

/** Refusal analytics (Task 7.2): rate overall and along the four cuts the card asked for. */
export function outcomeStats(orders: Order[]): OutcomeStats {
  const counts: Record<OutcomeOrOpen, number> = {
    delivered: 0, refused: 0, returned: 0, not_collected: 0, open: 0, cancelled: 0,
  };
  for (const o of orders) counts[outcomeOf(o)] += 1;

  const closed = orders.length - counts.open - counts.cancelled;
  const failed = counts.refused + counts.returned + counts.not_collected;
  const courierLeg = SHIPPING_CONFIG.shippingCost;
  const estimatedCost = (counts.refused + counts.returned) * courierLeg * 2;

  const courier = orders.filter((o) => o.customer.deliveryMethod !== 'pickup');
  const pickup = orders.filter((o) => o.customer.deliveryMethod === 'pickup');
  const threshold = SHIPPING_CONFIG.freeShippingThreshold;

  const cities = new Map<string, Order[]>();
  for (const o of courier) {
    const city = (o.customer.city || '—').trim();
    cities.set(city, [...(cities.get(city) ?? []), o]);
  }

  // New vs returning, judged per order: was this the phone's first order?
  const seen = new Set<string>();
  const first: Order[] = [];
  const again: Order[] = [];
  for (const o of [...orders].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())) {
    const p = normalizePhone(o.customer.phone);
    (seen.has(p) ? again : first).push(o);
    seen.add(p);
  }

  return {
    counts, closed, failed,
    failRate: closed > 0 ? failed / closed : null,
    estimatedCost,
    byMethod: [bucket('Курир', courier), bucket('Подигање', pickup)],
    byValue: [
      bucket(`Под ${threshold.toLocaleString('mk-MK')} ден.`, orders.filter((o) => o.subtotal < threshold)),
      bucket(`${threshold.toLocaleString('mk-MK')}+ ден.`, orders.filter((o) => o.subtotal >= threshold)),
    ],
    byCity: [...cities.entries()]
      .map(([city, os]) => bucket(city, os))
      .sort((a, b) => b.closed - a.closed)
      .slice(0, 8),
    byCustomer: [bucket('Прва нарачка', first), bucket('Повторна', again)],
  };
}
