/**
 * Who may get a discount, and who pays full price (D-027, Task 11.3).
 *
 * The owner (2026-09-29): a discount only on models with one or two sizes left
 * on the shelf. Dead stock may go down the ladder, never below the floor.
 * Other leftovers are not discounted now — they are offered in their season's
 * pre-season, when their buyer comes back. Everything else sells at full price.
 *
 * Discounts in the shop are agreed at the till, so this rule cannot be enforced
 * by software; it has to be visible at the moment of sale. That is what the
 * badge is for (`DiscountBadge`), and the same verdict drives /admin/discounts,
 * where the site's sale prices are brought in line.
 *
 * Reads no cost to decide, only sizes, age, sales and season — so staff, who
 * see no purchase price (D-018), get the same verdict. The floor price is
 * returned only when the cost is known, i.e. only to the admin.
 *
 * Pure: no database, no browser.
 */

import { Product } from '@/types';
import { markdownFloorPrice } from './cost';
import { NON_MERCHANDISE, monthOf, phaseOf, SeasonPhase, seasonOf } from './seasons';

const DAY = 86_400_000;

/** At most this many sizes on the shelf and the model may be discounted. */
export const MAX_SIZES_FOR_DISCOUNT = 2;
/** Older than this, a model has been through a season and is a leftover. */
export const LEFTOVER_AGE_DAYS = 180;
/** Dead stock: a leftover with no priced sale in this many days (as /admin/aging). */
export const DEAD_NO_SALE_DAYS = 365;
/** The ladder for dead stock (TURNAROUND.md, A2): one step every week or two. */
export const DEAD_LADDER = [20, 35, 50] as const;

/**
 *  sizes      — one or two sizes left: may be discounted
 *  dead       — dead stock: down the ladder, never below the floor
 *  preseason  — a leftover from last year in its season's pre-season: may be discounted now
 *  wait       — out of season: full price now, a discount in its pre-season
 *  full       — full price
 */
export type DiscountKind = 'sizes' | 'dead' | 'preseason' | 'wait' | 'full';

export interface DiscountVerdict {
  kind: DiscountKind;
  /** A discount is allowed today. */
  allowed: boolean;
  /** One line for the badge's tooltip and the list. */
  reason: string;
  /** Sizes with at least one piece. */
  liveSizes: number;
  ageDays: number | null;
  /** Lowest price a discount may reach; null when the cost is unknown (staff). */
  floorPrice: number | null;
}

const PRESEASON_LABEL: Record<string, string> = {
  SS: 'фев–мар',
  AW: 'авг–сеп',
};

const FULL_REASON: Partial<Record<SeasonPhase, string>> = {
  always: 'целогодишна стока, цела серија',
  inseason: 'во сезона, цела серија',
  preseason: 'сезоната почнува, цела серија',
};

const MARKDOWN_PHASES: SeasonPhase[] = ['late', 'endofseason', 'offseason'];

export function liveSizesOf(p: Product): number {
  return (p.sizes ?? []).filter((s) => (Number(s.quantity) || 0) >= 1).length;
}

function lastPricedSale(p: Product): number | null {
  let last: number | null = null;
  for (const s of p.sold ?? []) {
    if (!((Number(s.price) || 0) > 0)) continue;
    const t = Date.parse(String(s.soldDate));
    if (Number.isFinite(t) && (last === null || t > last)) last = t;
  }
  return last;
}

export function discountVerdict(p: Product, now: number = Date.now()): DiscountVerdict {
  const month = monthOf(now);
  const liveSizes = liveSizesOf(p);
  const received = p.firstReceivedAt ? new Date(p.firstReceivedAt).getTime() : NaN;
  const ageDays = Number.isFinite(received) ? Math.floor((now - received) / DAY) : null;
  const floorPrice = markdownFloorPrice(p.purchasePrice);
  const base = { liveSizes, ageDays, floorPrice };

  if (NON_MERCHANDISE.has(p.category)) {
    return { ...base, kind: 'full', allowed: false, reason: 'не е стока' };
  }

  const leftover = ageDays !== null && ageDays > LEFTOVER_AGE_DAYS;
  const last = lastPricedSale(p);
  if (leftover && (last === null || now - last > DEAD_NO_SALE_DAYS * DAY)) {
    return { ...base, kind: 'dead', allowed: true, reason: 'мртва стока: година без продажба' };
  }

  if (liveSizes >= 1 && liveSizes <= MAX_SIZES_FOR_DISCOUNT) {
    return {
      ...base, kind: 'sizes', allowed: true,
      reason: liveSizes === 1 ? 'останала една големина' : 'останаа две големини',
    };
  }

  const phase = phaseOf(p.category, month);
  if (leftover && phase === 'preseason') {
    return { ...base, kind: 'preseason', allowed: true, reason: 'остаток од лани, пред-сезона' };
  }
  // Out of season is a leftover whatever its age: shorts bought in May are
  // leftovers in October, and their buyer, too, comes back in spring.
  if (MARKDOWN_PHASES.includes(phase)) {
    return {
      ...base, kind: 'wait', allowed: false,
      reason: `остаток надвор од сезона: попуст во пред-сезона (${PRESEASON_LABEL[seasonOf(p.category)?.season ?? ''] ?? 'пред сезоната'})`,
    };
  }

  return {
    ...base, kind: 'full', allowed: false,
    reason: FULL_REASON[phase] ?? 'цела серија',
  };
}

export const KIND_LABEL: Record<DiscountKind, string> = {
  sizes: 'Може попуст',
  dead: 'Може попуст',
  preseason: 'Може попуст',
  wait: 'Полна цена',
  full: 'Полна цена',
};
