/**
 * A new campaign and the prices suggested for it (D-051), for the admin's
 * campaign screen. Pure. Apart from campaign.ts so the shop's pages, which
 * only need the dates and the prices, do not carry the discount rule.
 */

import type { Product } from '@/types';
import { markdownFloorPrice } from './cost';
import { discountVerdict, type DiscountKind } from './discount-rule';
import { DEFAULT_TEASER_DAYS, standingPrice, type Campaign } from './campaign';

const DAY = 86_400_000;
/** Campaign prices end in 0 or 50, like the shop's own. */
const PRICE_STEP = 50;

/** Black Friday: the day after the fourth Thursday of November, as Y-M-D. */
export function blackFridayDay(year: number): { y: number; m: number; d: number } {
  const first = new Date(Date.UTC(year, 10, 1)).getUTCDay();
  const thursday = 1 + ((4 - first + 7) % 7) + 21;
  return { y: year, m: 11, d: thursday + 1 };
}

/**
 * Black Friday of a year: Friday 00:00 to Sunday 23:59 in the browser's own
 * time (the owner's, in Macedonia), counting down two days before. The words
 * of an earlier campaign carry over when given, the prices never do: they are
 * suggested again from that day's shelf.
 */
export function newBlackFriday(year: number, from?: Campaign): Campaign {
  const { y, m, d } = blackFridayDay(year);
  const start = new Date(y, m - 1, d, 0, 0, 0);
  const end = new Date(y, m - 1, d + 2, 23, 59, 59);
  const teaser = new Date(start.getTime() - DEFAULT_TEASER_DAYS * DAY);
  return {
    id: `black-friday-${year}`,
    name: from?.name ?? 'Black Friday',
    startsAt: start.toISOString(),
    endsAt: end.toISOString(),
    teaserFrom: teaser.toISOString(),
    headline: from?.headline ?? { mk: 'Јакни, кошули, фармерки и плетиво по намалени цени', en: 'Jackets, shirts, jeans and knitwear at reduced prices' },
    intro: from?.intro ?? true,
    items: [],
  };
}

/** The cut suggested for each kind of stock, in % off the price it sells at now. */
export type SuggestRule = Record<DiscountKind, number>;

/**
 * The shop's rule (D-027) applied to a weekend: dead stock goes deepest —
 * it is cash standing still; a model with one or two sizes left may be cut;
 * last season's leftovers wait for their pre-season, and full series in
 * season keep their price. The owner changes any of it on the screen.
 */
export const DEFAULT_SUGGEST_RULE: SuggestRule = {
  dead: 40,
  sizes: 30,
  preseason: 20,
  wait: 0,
  full: 0,
};

/**
 * A cut smaller than this is no campaign offer: a piece already on sale that
 * the floor keeps from going much lower ("−8%" next to "до −40%") stays out,
 * at its own sale price.
 */
export const MIN_CAMPAIGN_CUT = 15;

export interface Suggestion {
  product: Product;
  kind: DiscountKind;
  reason: string;
  /** What it sells at now: the reference if it goes in. */
  before: number;
  /** The suggested campaign price; null when the rule leaves it out. */
  price: number | null;
  /** The floor (cost + 15%) held the price above the cut asked for. */
  clamped: boolean;
  /** The floor leaves less than MIN_CAMPAIGN_CUT off what it sells at now: left out. */
  atFloor: boolean;
}

/** `pct` off `before`, to the shop's step, never under the floor. */
export function campaignPriceFor(before: number, pct: number, cost?: number): { price: number; clamped: boolean } {
  const wanted = Math.max(PRICE_STEP, Math.round((before * (1 - pct / 100)) / PRICE_STEP) * PRICE_STEP);
  const floor = markdownFloorPrice(cost);
  if (floor !== null && wanted < floor) return { price: Math.ceil(floor / 10) * 10, clamped: true };
  return { price: wanted, clamped: false };
}

/** A suggestion for every product on the shelf, deepest first. */
export function suggestCampaign(products: Product[], rule: SuggestRule, now: number = Date.now()): Suggestion[] {
  return products
    .filter((p) => p.isVisible !== false && p.sizes?.some((s) => s.quantity >= 1))
    .map((product) => {
      const v = discountVerdict(product, now);
      const before = standingPrice(product);
      const pct = rule[v.kind] ?? 0;
      if (!(pct > 0)) return { product, kind: v.kind, reason: v.reason, before, price: null, clamped: false, atFloor: false };
      const { price, clamped } = campaignPriceFor(before, pct, product.purchasePrice);
      const atFloor = price > before * (1 - MIN_CAMPAIGN_CUT / 100);
      return { product, kind: v.kind, reason: v.reason, before, price: atFloor ? null : price, clamped, atFloor };
    });
}
