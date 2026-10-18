/**
 * The basket's money under the loyalty programme (EPIC 13, Task 13.2, D-032).
 *
 * Pure, like order-math.ts: no Supabase, no session, no network. The server
 * builds the lines from the database (price, sale, purchase price) and the
 * customer's balance, and this decides what a coupon takes off, what points
 * may pay, what delivery costs and what the order will earn. Nothing here is
 * ever computed in the browser; the browser only shows `publicQuote`.
 *
 * The order is fixed: sale price → coupon → points → the limits. The limits
 * are per line: sale, coupon and points together never take more than
 * `maxTotalDiscountPct` off the regular price, and never go below the floor
 * (purchase price × MARKDOWN_FLOOR). A line already priced below its lowest
 * stays where it is: nothing here ever raises a price.
 *
 * Money is whole denars. Every amount taken off is rounded down, so a
 * rounding never gives away a denar the rules did not.
 */

import type { DeliveryMethod } from '@/types';
import { SHIPPING_CONFIG, customerShippingFor } from '@/config/shipping';
import { markdownFloorPrice } from './cost';
import { DiscountBand, LoyaltySettings, discountBand, earnRatePctFor, redeemCapPctFor } from './loyalty-settings';

export interface BasketLine {
  productId: string;
  category: string;
  quantity: number;
  /** Regular price per unit. Every band and limit is measured against it. */
  regularPrice: number;
  /** What the shop asks per unit before any coupon: the sale price while a sale is on, else the regular price. */
  price: number;
  /** Purchase price per unit. Server only: it sets the floor and must never reach the browser. */
  cost?: number;
}

export type CouponKind = 'percent' | 'fixed' | 'free_shipping';

/**
 * A coupon as the arithmetic needs it. Whether it may be used at all (dates,
 * how often, whose it is) is decided against the database before this (13.4).
 * A "category discount" is a percent or fixed coupon with `includeCategories`.
 */
export interface BasketCoupon {
  code: string;
  kind: CouponKind;
  /** Percent for 'percent', denars for 'fixed'. Unused for 'free_shipping'. */
  value: number;
  /** Denars; caps a percent coupon. */
  maxDiscount?: number;
  /** Denars; the basket at its sale prices, before the coupon. */
  minBasket?: number;
  includeCategories?: string[];
  excludeCategories?: string[];
  includeProducts?: string[];
  excludeProducts?: string[];
}

export type CouponRefusal = 'min_basket' | 'no_items' | 'no_room' | 'pickup' | 'already_free';
export type PointsRefusal = 'balance' | 'order' | 'no_room';

export interface QuoteLine {
  productId: string;
  quantity: number;
  regularPrice: number;
  price: number;
  /** The product's own discount against its regular price; the coupon does not move it. */
  band: DiscountBand;
  /** price × quantity */
  goods: number;
  couponDiscount: number;
  pointsUsed: number;
  /** goods − coupon − points: what the customer pays for this line. */
  toPay: number;
  /** The least this line may cost: the overall limit and the floor, × quantity. Server only. */
  lowest: number;
  /** The most points this line could take. Server only (with `lowest` it outlines the floor). */
  maxPoints: number;
}

export interface BasketQuote {
  lines: QuoteLine[];
  /** The basket at its sale prices. */
  goods: number;
  coupon: null | {
    code: string;
    kind: CouponKind;
    applied: boolean;
    refusal?: CouponRefusal;
    /** What the coupon took off the goods. */
    discount: number;
    /** What the coupon would have taken but the limits held back. */
    held: number;
  };
  /** Goods after the coupon. The free-delivery threshold and the minimum order for points are measured here. */
  afterCoupon: number;
  /** What the customer pays for delivery. */
  shipping: number;
  freeShipping: 'pickup' | 'threshold' | 'coupon' | null;
  /** Denars still missing for free delivery by courier; 0 when it is free. */
  toFreeShipping: number;
  points: {
    balance: number;
    /** The slider's upper end. */
    maxUsable: number;
    used: number;
    refusal?: PointsRefusal;
  };
  /** Goods after the coupon and the points. */
  toPay: number;
  /** toPay + shipping: what is collected. */
  total: number;
  /** Points this order earns, once delivered, paid and past the waiting period. */
  earn: number;
}

export interface QuoteInput {
  lines: BasketLine[];
  method: DeliveryMethod;
  settings: LoyaltySettings;
  coupon?: BasketCoupon | null;
  /** Active points on the account. 0 for a guest. */
  pointsBalance?: number;
  /** What the customer chose on the slider; held to what is allowed. */
  pointsRequested?: number;
}

const whole = (n: number) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

/**
 * Split `total` whole denars across lines in proportion to `weights`, never
 * above a line's `cap`. Lines that would pass their cap are filled to it and
 * the rest is shared among the others, so the full amount lands wherever
 * there is room. The last denars go by largest remainder. The result sums to
 * `total`, or to every cap together if that is less.
 */
export function allocate(total: number, weights: number[], caps: number[]): number[] {
  const out = weights.map(() => 0);
  const cap = caps.map(whole);
  let remaining = Math.min(whole(total), cap.reduce((a, c) => a + c, 0));
  let open = weights.map((_, i) => i).filter((i) => weights[i] > 0 && cap[i] > 0);

  while (remaining > 0 && open.length) {
    const w = open.reduce((a, i) => a + weights[i], 0);
    const full = open.filter((i) => (remaining * weights[i]) / w >= cap[i]);
    if (full.length === 0) break;
    for (const i of full) { remaining -= cap[i]; out[i] = cap[i]; }
    open = open.filter((i) => !full.includes(i));
  }
  if (remaining > 0 && open.length) {
    const w = open.reduce((a, i) => a + weights[i], 0);
    const shares = open.map((i) => ({ i, share: (remaining * weights[i]) / w }));
    for (const s of shares) out[s.i] = Math.floor(s.share);
    let left = remaining - shares.reduce((a, s) => a + Math.floor(s.share), 0);
    // Every open share is below its cap, so one more denar always fits.
    shares.sort((a, b) => (b.share % 1) - (a.share % 1) || weights[b.i] - weights[a.i] || a.i - b.i);
    for (const s of shares) { if (left <= 0) break; out[s.i] += 1; left -= 1; }
  }
  return out;
}

/** The least a unit may sell for: the overall limit against the regular price, and the floor. */
export function lowestUnitPrice(regularPrice: number, cost: number | undefined, s: LoyaltySettings): number {
  const limit = regularPrice > 0 ? Math.ceil((regularPrice * (100 - s.maxTotalDiscountPct)) / 100) : 0;
  return Math.max(limit, markdownFloorPrice(cost) ?? 0);
}

function couponCovers(c: BasketCoupon, l: BasketLine): boolean {
  const incCats = c.includeCategories ?? [];
  const incProds = c.includeProducts ?? [];
  const included = (incCats.length === 0 && incProds.length === 0) || incCats.includes(l.category) || incProds.includes(l.productId);
  const excluded = (c.excludeCategories ?? []).includes(l.category) || (c.excludeProducts ?? []).includes(l.productId);
  return included && !excluded;
}

export function quoteBasket(input: QuoteInput): BasketQuote {
  const s = input.settings;
  const lines: QuoteLine[] = input.lines.map((l) => {
    const quantity = Math.max(1, Math.floor(l.quantity));
    const price = Math.max(0, l.price);
    const goods = whole(price * quantity);
    return {
      productId: l.productId,
      quantity,
      regularPrice: l.regularPrice,
      price,
      band: discountBand(l.regularPrice, price, s),
      goods,
      couponDiscount: 0,
      pointsUsed: 0,
      toPay: goods,
      lowest: lowestUnitPrice(l.regularPrice, l.cost, s) * quantity,
      maxPoints: 0,
    };
  });
  const room = (q: QuoteLine) => Math.max(0, q.toPay - q.lowest);
  const goods = lines.reduce((a, q) => a + q.goods, 0);

  // ── Coupon ────────────────────────────────────────────────────────────
  let coupon: BasketQuote['coupon'] = null;
  let couponFreeShipping = false;
  const c = input.coupon;
  if (c) {
    const refuse = (refusal: CouponRefusal) => ({ code: c.code, kind: c.kind, applied: false, refusal, discount: 0, held: 0 });
    const covered = input.lines.map((l) => couponCovers(c, l));
    if (c.minBasket && goods < c.minBasket) {
      coupon = refuse('min_basket');
    } else if (c.kind === 'free_shipping') {
      // Refused rather than spent for nothing, so the customer keeps it.
      if (input.method === 'pickup') coupon = refuse('pickup');
      else if (goods >= SHIPPING_CONFIG.freeShippingThreshold) coupon = refuse('already_free');
      else {
        coupon = { code: c.code, kind: c.kind, applied: true, discount: 0, held: 0 };
        couponFreeShipping = true;
      }
    } else if (!covered.some(Boolean)) {
      coupon = refuse('no_items');
    } else {
      const eligible = lines.reduce((a, q, i) => a + (covered[i] ? q.goods : 0), 0);
      let wanted = c.kind === 'percent' ? Math.floor((eligible * Math.max(0, c.value)) / 100) : Math.min(whole(c.value), eligible);
      if (c.kind === 'percent' && c.maxDiscount !== undefined) wanted = Math.min(wanted, whole(c.maxDiscount));
      const split = allocate(
        wanted,
        lines.map((q, i) => (covered[i] ? q.goods : 0)),
        lines.map((q, i) => (covered[i] ? room(q) : 0)),
      );
      const given = split.reduce((a, n) => a + n, 0);
      if (given === 0 && wanted > 0) {
        coupon = refuse('no_room');
      } else {
        lines.forEach((q, i) => { q.couponDiscount = split[i]; q.toPay -= split[i]; });
        coupon = { code: c.code, kind: c.kind, applied: true, discount: given, held: wanted - given };
      }
    }
  }
  const afterCoupon = lines.reduce((a, q) => a + q.toPay, 0);

  // ── Delivery: after the coupon, before the points ─────────────────────
  // Points are a way to pay for the basket, not a cut in its value, so using
  // them never brings the delivery charge back (owner, 2026-10-18).
  let shipping: number;
  let freeShipping: BasketQuote['freeShipping'];
  if (input.method === 'pickup') { shipping = 0; freeShipping = 'pickup'; }
  else if (couponFreeShipping) { shipping = 0; freeShipping = 'coupon'; }
  else {
    shipping = customerShippingFor('courier', afterCoupon);
    freeShipping = shipping === 0 ? 'threshold' : null;
  }
  const toFreeShipping = freeShipping === null ? Math.max(0, SHIPPING_CONFIG.freeShippingThreshold - afterCoupon) : 0;

  // ── Points ────────────────────────────────────────────────────────────
  const balance = whole(input.pointsBalance ?? 0);
  for (const q of lines) {
    q.maxPoints = Math.min(Math.floor((q.toPay * redeemCapPctFor(q.band, s)) / 100), room(q));
  }
  let refusal: PointsRefusal | undefined;
  let maxUsable = 0;
  if (balance < s.minPointsToRedeem) refusal = 'balance';
  else if (afterCoupon < s.minOrderForRedeem) refusal = 'order';
  else {
    const basketCap = Math.floor((afterCoupon * s.maxRedeemBasketPct) / 100);
    maxUsable = Math.min(balance, lines.reduce((a, q) => a + q.maxPoints, 0), basketCap);
    if (maxUsable === 0) refusal = 'no_room';
  }
  const used = Math.min(whole(input.pointsRequested ?? 0), maxUsable);
  const pointSplit = allocate(used, lines.map((q) => q.maxPoints), lines.map((q) => q.maxPoints));
  lines.forEach((q, i) => { q.pointsUsed = pointSplit[i]; q.toPay -= pointSplit[i]; });
  const toPay = lines.reduce((a, q) => a + q.toPay, 0);

  // ── Earned: on what was paid in money, per line by its band, rounded down once ──
  // The epsilon keeps 24,0000000001 and 23,9999999999 from deciding a point.
  const earnExact = lines.reduce((a, q) => a + (q.toPay * earnRatePctFor(q.band, s)) / 100, 0);
  const earn = Math.floor(earnExact + 1e-9);

  return {
    lines,
    goods,
    coupon,
    afterCoupon,
    shipping,
    freeShipping,
    toFreeShipping,
    points: { balance, maxUsable, used, refusal },
    toPay,
    total: toPay + shipping,
    earn,
  };
}

/**
 * The quote as the browser may see it: without each line's lowest price and
 * point ceiling, which together outline the purchase price. The slider's
 * maximum can still hint at a floor on a one-product basket; that is the price
 * of having a floor at all, and it is never shown as a number of its own.
 */
export type PublicQuoteLine = Omit<QuoteLine, 'lowest' | 'maxPoints'>;
export type PublicBasketQuote = Omit<BasketQuote, 'lines'> & { lines: PublicQuoteLine[] };

export function publicQuote(q: BasketQuote): PublicBasketQuote {
  return {
    ...q,
    lines: q.lines.map((l) => ({
      productId: l.productId, quantity: l.quantity, regularPrice: l.regularPrice, price: l.price, band: l.band,
      goods: l.goods, couponDiscount: l.couponDiscount, pointsUsed: l.pointsUsed, toPay: l.toPay,
    })),
  };
}

const den = (n: number) => `${Math.round(n).toLocaleString('mk-MK')} ден.`;

/** Why a coupon did not apply, in the customer's words. */
export function couponRefusalText(r: CouponRefusal, c?: Pick<BasketCoupon, 'minBasket'>): string {
  switch (r) {
    case 'min_basket': return `Купонот важи за кошничка од најмалку ${den(c?.minBasket ?? 0)}`;
    case 'no_items': return 'Купонот не важи за производите во кошничката.';
    case 'no_room': return 'Производите во кошничката се веќе на најниската цена, па купонот не носи попуст. Зачуван е за друга нарачка.';
    case 'pickup': return 'При подигање во продавница достава нема, па купонот е зачуван за друга нарачка.';
    case 'already_free': return 'Доставата е веќе бесплатна за оваа кошничка, па купонот е зачуван за друга нарачка.';
  }
}

/** Why points cannot be used on this basket, in the customer's words. */
export function pointsRefusalText(r: PointsRefusal, s: LoyaltySettings): string {
  switch (r) {
    case 'balance': return `Поените се трошат кога ќе собереш најмалку ${s.minPointsToRedeem.toLocaleString('mk-MK')}.`;
    case 'order': return `Поени се трошат на нарачка од најмалку ${den(s.minOrderForRedeem)}`;
    case 'no_room': return 'Производите во кошничката не може да се платат со поени (голем попуст или најниска цена).';
  }
}
