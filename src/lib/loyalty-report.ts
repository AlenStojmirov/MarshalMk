/**
 * What the loyalty programme owes and what it cost (Task 13.12, D-031).
 *
 * Points spent and coupons are already in the margin: D-031 books them as a
 * discount on the unit, so a member order's gross here is after them. What
 * this adds is the price of the programme next to that gross — and the
 * liability: points earned and not yet spent, the denars the shop may still
 * give away. Points earned are not a cost until they are spent.
 *
 * Pure: the server reads the rows (service role), this adds them up, so the
 * arithmetic is checked without a database.
 */

import { PointsRow, isCredit, rowToMovement, summarizePoints } from './points';
import type { OrderLoyalty, OrderOutcome, OrderStatus } from '@/types';
import type { CouponSource } from './coupons';

export interface ReportInput {
  now: Date;
  points: PointsRow[];
  coupons: Array<{ id: string; source: CouponSource; created_at: string }>;
  uses: Array<{ coupon_id: string; discount: number; shipping_waived: number; created_at: string; released_at: string | null }>;
  spins: Array<{ prize_label: string; prize_kind: string; prize_value: number; coupon_id: string | null; created_at: string; user_id: string }>;
  /** Orders placed with an account. */
  orders: Array<{ id: string; user_id: string; created_at: string; status: OrderStatus; outcome: OrderOutcome | null; total: number; loyalty: OrderLoyalty | null }>;
  /** Ledger rows of those orders. */
  ledger: Array<{ order_id: string; qty: number; unit_price: number; unit_cost: number | null }>;
  customers: Array<{ user_id: string; created_at: string }>;
  /** Accounts that signed up from the wheel (`signup_source`). */
  fromWheel: Set<string>;
}

export interface ReportMonth {
  month: string;
  memberOrders: number;
  memberRevenue: number;
  /** After the programme's discounts (D-031). Lines without a cost are left out of it. */
  memberGross: number;
  pointsSpent: number;
  couponDiscount: number;
  shippingWaived: number;
  /** What the programme gave away this month: points spent, coupons, delivery. */
  cost: number;
  /** Cost as a share of the gross before it: what part of the margin the programme took. */
  costShare: number | null;
  pointsEarned: number;
  pointsExpired: number;
  registrations: number;
  registrationsFromWheel: number;
  wheelSpins: number;
}

export interface LoyaltyReport {
  generatedAt: string;
  liability: { active: number; pending: number; expiringSoon: number; nextExpiry: string | null };
  members: { total: number; withOrders: number; fromWheel: number };
  months: ReportMonth[];
  coupons: Array<{ source: CouponSource; issued: number; used: number; discount: number; shippingWaived: number }>;
  wheel: {
    spins: number;
    spinsThisMonth: number;
    byPrize: Array<{ label: string; total: number; thisMonth: number }>;
    pointsGiven: number;
    couponsGiven: number;
    couponsUsed: number;
  };
}

const month = (iso: string) => iso.slice(0, 7);
const cancelled = (o: ReportInput['orders'][number]) => o.status === 'cancelled' || (!!o.outcome && o.outcome !== 'delivered');

export function buildReport(i: ReportInput): LoyaltyReport {
  const now = i.now;
  const thisMonth = now.toISOString().slice(0, 7);
  const moves = i.points.map(rowToMovement);
  const s = summarizePoints(moves, now, 30);
  const voided = new Set(i.points.filter((p) => p.kind === 'cancel').map((p) => p.related_id));
  const liveUses = i.uses.filter((u) => !u.released_at);
  const liveOrders = i.orders.filter((o) => !cancelled(o));

  // Every month from the first record to now.
  const firsts = [
    ...i.points.map((p) => p.created_at), ...i.orders.map((o) => o.created_at),
    ...i.customers.map((c) => c.created_at), ...i.spins.map((w) => w.created_at),
  ].map(month).sort();
  const months: string[] = [];
  if (firsts.length) {
    const d = new Date(`${firsts[0]}-01T00:00:00Z`);
    while (d.toISOString().slice(0, 7) <= thisMonth) {
      months.push(d.toISOString().slice(0, 7));
      d.setUTCMonth(d.getUTCMonth() + 1);
    }
  } else {
    months.push(thisMonth);
  }

  const grossOf = new Map<string, number>();
  for (const l of i.ledger) {
    if (l.unit_cost === null || l.unit_cost === undefined) continue;
    grossOf.set(l.order_id, (grossOf.get(l.order_id) ?? 0) + (Number(l.unit_price) - Number(l.unit_cost)) * (Number(l.qty) || 1));
  }

  const rows: ReportMonth[] = months.map((m) => {
    const orders = liveOrders.filter((o) => month(o.created_at) === m);
    const uses = liveUses.filter((u) => month(u.created_at) === m);
    const pointsSpent = i.points.filter((p) => p.kind === 'redeem' && !p.reversed_at && month(p.created_at) === m).reduce((a, p) => a + p.points, 0);
    const couponDiscount = uses.reduce((a, u) => a + Number(u.discount), 0);
    const shippingWaived = uses.reduce((a, u) => a + Number(u.shipping_waived), 0);
    const cost = pointsSpent + couponDiscount + shippingWaived;
    const memberGross = orders.reduce((a, o) => a + (grossOf.get(o.id) ?? 0), 0);
    const signups = i.customers.filter((c) => month(c.created_at) === m);
    return {
      month: m,
      memberOrders: orders.length,
      memberRevenue: orders.reduce((a, o) => a + Number(o.total), 0),
      memberGross,
      pointsSpent,
      couponDiscount,
      shippingWaived,
      cost,
      costShare: memberGross + cost > 0 ? cost / (memberGross + cost) : null,
      pointsEarned: i.points.filter((p) => ['earn', 'bonus', 'wheel'].includes(p.kind) && !voided.has(p.id) && month(p.created_at) === m)
        .reduce((a, p) => a + p.points, 0),
      pointsExpired: moves.filter((p) => isCredit(p.kind) && p.expiresAt && p.expiresAt <= now && (p.remaining ?? 0) > 0
        && p.expiresAt.toISOString().slice(0, 7) === m).reduce((a, p) => a + (p.remaining ?? 0), 0),
      registrations: signups.length,
      registrationsFromWheel: signups.filter((c) => i.fromWheel.has(c.user_id)).length,
      wheelSpins: i.spins.filter((w) => month(w.created_at) === m).length,
    };
  });

  const sourceOf = new Map(i.coupons.map((c) => [c.id, c.source]));
  const sources = [...new Set(i.coupons.map((c) => c.source))];
  const coupons = sources.map((source) => {
    const used = liveUses.filter((u) => sourceOf.get(u.coupon_id) === source);
    return {
      source,
      issued: i.coupons.filter((c) => c.source === source).length,
      used: used.length,
      discount: used.reduce((a, u) => a + Number(u.discount), 0),
      shippingWaived: used.reduce((a, u) => a + Number(u.shipping_waived), 0),
    };
  }).sort((a, b) => b.issued - a.issued);

  const labels = [...new Set(i.spins.map((w) => w.prize_label))];
  const wheelCoupons = new Set(i.spins.map((w) => w.coupon_id).filter((x): x is string => !!x));

  return {
    generatedAt: now.toISOString(),
    liability: { active: s.active, pending: s.pending, expiringSoon: s.expiringSoon, nextExpiry: s.nextExpiry ? s.nextExpiry.toISOString() : null },
    members: {
      total: i.customers.length,
      withOrders: new Set(liveOrders.map((o) => o.user_id)).size,
      fromWheel: i.customers.filter((c) => i.fromWheel.has(c.user_id)).length,
    },
    months: rows,
    coupons,
    wheel: {
      spins: i.spins.length,
      spinsThisMonth: i.spins.filter((w) => month(w.created_at) === thisMonth).length,
      byPrize: labels.map((label) => ({
        label,
        total: i.spins.filter((w) => w.prize_label === label).length,
        thisMonth: i.spins.filter((w) => w.prize_label === label && month(w.created_at) === thisMonth).length,
      })).sort((a, b) => b.total - a.total),
      pointsGiven: i.spins.filter((w) => w.prize_kind === 'points').reduce((a, w) => a + Number(w.prize_value), 0),
      couponsGiven: wheelCoupons.size,
      couponsUsed: liveUses.filter((u) => wheelCoupons.has(u.coupon_id)).length,
    },
  };
}
