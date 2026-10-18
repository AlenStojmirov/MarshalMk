/**
 * The customer's coupons, sorted the way the dashboard shows them (Task 13.9):
 * the ones about to lapse first, then the rest that work, then the history —
 * used, lapsed, switched off.
 *
 * A customer sees their personal coupons (RLS, 016) and their own uses, which
 * keep a copy of the code — so a public code they used appears in the history
 * even though public codes are never listed to them. Pure: the dashboard reads
 * the rows, this only sorts them.
 */

import type { Coupon, Redemption } from './coupons';

/** A coupon lapsing within this many days is shown first, with a warning. */
export const COUPON_SOON_DAYS = 7;

export type CustomerCouponState = 'soon' | 'active' | 'upcoming' | 'used' | 'expired' | 'off';

export interface CustomerCoupon {
  key: string;
  code: string;
  coupon?: Coupon;
  state: CustomerCouponState;
  /** The order it was used on, for the history. */
  usedOn?: { orderNumber?: string; at: Date };
  /** Whole days left, for "истекува за N дена". */
  daysLeft?: number;
}

const DAY = 86_400_000;

export function sortCustomerCoupons(coupons: Coupon[], uses: Redemption[], now: Date) {
  const live = uses.filter((u) => !u.releasedAt);
  const out: CustomerCoupon[] = coupons.map((c) => {
    const mine = live.filter((u) => u.couponId === c.id);
    const last = mine.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0];
    const daysLeft = c.endsAt ? Math.ceil((c.endsAt.getTime() - now.getTime()) / DAY) : undefined;
    let state: CustomerCouponState;
    if (c.maxUsesPerUser !== undefined && mine.length >= c.maxUsesPerUser) state = 'used';
    else if (!c.active) state = 'off';
    else if (c.endsAt && c.endsAt <= now) state = 'expired';
    else if (c.startsAt > now) state = 'upcoming';
    else if (daysLeft !== undefined && daysLeft <= COUPON_SOON_DAYS) state = 'soon';
    else state = 'active';
    return { key: c.id ?? c.code, code: c.code, coupon: c, state, daysLeft, usedOn: last ? { orderNumber: last.orderNumber, at: last.createdAt } : undefined };
  });
  // Public codes used by this customer: history only, from the copy kept on the use.
  const known = new Set(coupons.map((c) => c.id));
  for (const u of live) {
    if (!known.has(u.couponId)) out.push({ key: u.id, code: u.code, state: 'used', usedOn: { orderNumber: u.orderNumber, at: u.createdAt } });
  }

  const byEnd = (a: CustomerCoupon, b: CustomerCoupon) =>
    (a.coupon?.endsAt?.getTime() ?? Infinity) - (b.coupon?.endsAt?.getTime() ?? Infinity);
  const byRecent = (a: CustomerCoupon, b: CustomerCoupon) =>
    (b.usedOn?.at.getTime() ?? b.coupon?.endsAt?.getTime() ?? 0) - (a.usedOn?.at.getTime() ?? a.coupon?.endsAt?.getTime() ?? 0);
  return {
    soon: out.filter((c) => c.state === 'soon').sort(byEnd),
    active: out.filter((c) => c.state === 'active' || c.state === 'upcoming').sort(byEnd),
    history: out.filter((c) => c.state === 'used' || c.state === 'expired' || c.state === 'off').sort(byRecent),
  };
}
