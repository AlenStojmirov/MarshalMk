/**
 * Sell-through and velocity per model (Task 3.3).
 *
 * The honest difficulty here is size. With one to five pieces per model, a
 * per-model *rate* is mostly noise: a model with two pieces that sold one in
 * ninety days has a "velocity" of 0,33 units a month, and the next sale would
 * double it. Quoting that to three decimals would dress a coin flip as a
 * measurement.
 *
 * What survives small numbers is **sell-through** — the share of what was
 * bought that has actually left. It is scale-free: three of four pieces gone is
 * 75% whether the buy was four pieces or four hundred, and it answers the only
 * question a reorder needs to answer. So sell-through leads, rates are shown
 * with a thinness flag, and months-of-supply is treated as an order of
 * magnitude rather than a number.
 *
 * Two joins make the verdict trustworthy:
 *
 *  - **Season.** A winter coat with no sales in July is not slow, it is out of
 *    window. Calling it dead would market down stock three months before its
 *    season opens. But a season is only an excuse once: something that has sat
 *    through a full year without selling has already had its window.
 *  - **Age.** A model that arrived three weeks ago has not had time to prove
 *    anything, and judging it is how good stock gets cleared by accident.
 */

import { Product } from '@/types';
import { phaseOf, monthOf, Month } from './seasons';

const DAY = 86_400_000;

export type VelocityClass =
  /** Too new to judge. */
  | 'new'
  /** Nothing left and it sold within the year — the strongest reorder signal. */
  | 'soldout'
  /** Selling well and running out — the reorder candidates. */
  | 'winner'
  /** Moving at a reasonable pace. */
  | 'healthy'
  /** Sells, but far too slowly for the stock held. */
  | 'slow'
  /** Its season is shut; the verdict waits. */
  | 'offseason'
  /** A year on the shelf with nothing sold. */
  | 'dead';

export interface VelocityMetrics {
  /** Pieces on the shelf now. */
  onHand: number;
  /** Priced sales — demand. Giveaways and personal use are not demand (D-005). */
  soldEver: number;
  sold30: number;
  sold90: number;
  sold365: number;
  /**
   * Pieces that left for any reason, priced or not. Used for the received
   * estimate, because a giveaway still emptied the shelf.
   */
  departures: number;
  /**
   * Estimated pieces ever received: what is here plus what left. A lower bound
   * — anything written off without a `sold[]` entry is missing, which
   * understates the buy and therefore overstates sell-through.
   */
  receivedEst: number;
  /** soldEver / receivedEst, or null when nothing was ever received. */
  sellThrough: number | null;
  /** Units a month over the last 90 days. Noisy at these quantities. */
  perMonth: number;
  /** onHand / perMonth. Null when nothing sold in 90 days — not "infinite". */
  monthsSupply: number | null;
  daysSinceLastSale: number | null;
  ageDays: number | null;
  /**
   * True when the buy was so small that every ratio moves in big jumps. Three
   * pieces or fewer: one sale is a third of the signal.
   */
  thin: boolean;
  klass: VelocityClass;
}

/** Below this the model has not had time to prove anything. */
export const MIN_AGE_TO_JUDGE = 45;
/** Sell-through at or above this, while still selling, is a winner. */
export const WINNER_SELL_THROUGH = 0.6;
/** Months of supply at or below this counts as running out. */
export const WINNER_MONTHS = 3;
/** Above this, the stock held is out of proportion to the pace. */
export const SLOW_MONTHS = 6;
/** A buy this small or smaller makes every ratio jumpy. */
export const THIN_RECEIVED = 3;
/**
 * How fresh the proof has to be before an empty shelf is a reason to reorder.
 *
 * A model that sold out eleven months ago is not a restock signal, it is a
 * discontinued line: nobody has missed it enough to notice in a year, the
 * supplier may not carry it, and the fashion behind it has moved. The class
 * still records the demand — it happened — but the buy list is filtered on
 * this, because a list of seventy-eight items where half proved themselves last
 * autumn is not a list anybody can act on.
 */
export const RESTOCK_RECENCY_DAYS = 180;

function unitsOnHand(p: Product): number {
  return (p.sizes ?? []).reduce((a, s) => a + Math.max(0, Number(s.quantity) || 0), 0);
}

/**
 * Metrics for one model.
 *
 * `now` and `month` are passed in rather than read from the clock so a whole
 * page computes against one instant, and so this stays a pure function.
 */
export function velocityOf(
  p: Product,
  now: number = Date.now(),
  month: Month = monthOf(now)
): VelocityMetrics {
  const onHand = unitsOnHand(p);

  let departures = 0;
  let soldEver = 0;
  let sold30 = 0;
  let sold90 = 0;
  let sold365 = 0;
  let lastSale: number | null = null;

  for (const s of p.sold ?? []) {
    const t = Date.parse(String(s.soldDate));
    if (!Number.isFinite(t)) continue;
    departures += 1;

    if (!(Number(s.price) > 0)) continue; // left the shelf, but not demand
    soldEver += 1;
    const ageOfSale = now - t;
    if (ageOfSale <= 30 * DAY) sold30 += 1;
    if (ageOfSale <= 90 * DAY) sold90 += 1;
    if (ageOfSale <= 365 * DAY) sold365 += 1;
    if (lastSale === null || t > lastSale) lastSale = t;
  }

  const receivedEst = onHand + departures;
  const sellThrough = receivedEst > 0 ? soldEver / receivedEst : null;
  const perMonth = sold90 / 3;
  const monthsSupply = perMonth > 0 ? onHand / perMonth : null;
  const daysSinceLastSale = lastSale === null ? null : Math.floor((now - lastSale) / DAY);
  const ageDays = p.firstReceivedAt
    ? Math.floor((now - p.firstReceivedAt.getTime()) / DAY)
    : null;

  const phase = phaseOf(p.category, month);
  const windowShut = phase === 'offseason' || phase === 'preseason';

  let klass: VelocityClass;
  if (onHand === 0 && sold365 > 0) {
    // Empty shelf with demand inside the year. This is a stronger buy signal
    // than any "running out" — but it is NOT a winner: a winner still has
    // stock, and calling nought pieces "under three months of supply" would be
    // arithmetic standing in for a fact.
    klass = 'soldout';
  } else if (ageDays !== null && ageDays < MIN_AGE_TO_JUDGE) {
    klass = 'new';
  } else if (sold365 === 0 && (ageDays === null || ageDays > 365)) {
    // A full year with nothing sold has already included this model's season.
    // No window can excuse that, so the season check deliberately sits after it.
    klass = 'dead';
  } else if (windowShut && sold365 === 0) {
    klass = 'offseason';
  } else if (sold365 === 0) {
    klass = 'dead';
  } else if (
    sold90 > 0 &&
    sellThrough !== null &&
    sellThrough >= WINNER_SELL_THROUGH &&
    monthsSupply !== null &&
    monthsSupply <= WINNER_MONTHS
  ) {
    klass = 'winner';
  } else if (monthsSupply !== null && monthsSupply <= SLOW_MONTHS) {
    klass = 'healthy';
  } else if (windowShut) {
    // Sold within the year but nothing lately, and its window is shut: that is
    // the calendar, not a verdict.
    klass = 'offseason';
  } else {
    klass = 'slow';
  }

  return {
    onHand, soldEver, sold30, sold90, sold365, departures, receivedEst,
    sellThrough, perMonth, monthsSupply, daysSinceLastSale, ageDays,
    thin: receivedEst <= THIN_RECEIVED,
    klass,
  };
}

export const CLASS_LABEL: Record<VelocityClass, string> = {
  new: 'Нова',
  soldout: 'Распродадена',
  winner: 'Победник',
  healthy: 'Здрава',
  slow: 'Бавна',
  offseason: 'Чека сезона',
  dead: 'Мртва',
};

export const CLASS_ACTION: Record<VelocityClass, string> = {
  new: `Под ${MIN_AGE_TO_JUDGE} дена на полица — уште нема што да се суди.`,
  soldout: 'Нула на полица, а се продавала во последната година. Најјасниот сигнал за дополнување.',
  winner: 'Се продава и се празни. Заслужува нова набавка заедно со распродадените.',
  healthy: 'Темпото е во ред за количината што стои. Остави ја на мира.',
  slow: 'Се продава, но количината е несразмерна на темпото. Намали или не дополнувај.',
  offseason: 'Прозорецот е затворен — тишината е календар, не пресуда. Одлуката чека сезона.',
  dead: 'Цела година на полица без ниту една продажба. Веќе ја имаше својата сезона.',
};

/** Most urgent first, for sorting lists and stacking summaries. */
export const CLASS_ORDER: VelocityClass[] = [
  'soldout', 'winner', 'dead', 'slow', 'offseason', 'healthy', 'new',
];

/**
 * A model worth showing at all.
 *
 * Nothing on the shelf and nothing sold within the year is a closed record, not
 * a decision — there is no stock to clear and no demand to serve. Counting such
 * rows as "dead stock" would inflate the dead-capital figure with models that
 * tie up no capital at all.
 */
export function isDecidable(m: VelocityMetrics): boolean {
  if (m.onHand > 0) return true;
  return m.sold365 > 0;
}

export interface CategoryVelocity {
  category: string;
  models: number;
  onHand: number;
  cost: number;
  sold90: number;
  sold365: number;
  /** Units a month over 90 days, summed — reliable at this level, unlike per model. */
  perMonth: number;
  monthsSupply: number | null;
  /**
   * Units a month across the whole year. For a category whose window is shut,
   * a 90-day rate measures the dead part of its year and months-of-supply then
   * reads in the hundreds — true arithmetic, useless as a fact. The annual rate
   * spans at least one real season, so it is the honest denominator there.
   */
  perMonthAnnual: number;
  monthsSupplyAnnual: number | null;
  sellThrough: number | null;
}

/**
 * Velocity aggregated per raw category, which is where the rates actually mean
 * something: forty models of noise add up to a usable pace, and a category is
 * the level a buying decision is taken at anyway.
 */
export function velocityByCategory(
  entries: Array<{ p: Product; m: VelocityMetrics }>
): CategoryVelocity[] {
  const byCat = new Map<string, CategoryVelocity & { soldEver: number; receivedEst: number }>();

  for (const { p, m } of entries) {
    const c = byCat.get(p.category) ?? {
      category: p.category, models: 0, onHand: 0, cost: 0, sold90: 0, sold365: 0,
      perMonth: 0, monthsSupply: null, perMonthAnnual: 0, monthsSupplyAnnual: null,
      sellThrough: null, soldEver: 0, receivedEst: 0,
    };
    c.models += 1;
    c.onHand += m.onHand;
    c.cost += m.onHand * (p.purchasePrice ?? 0);
    c.sold90 += m.sold90;
    c.sold365 += m.sold365;
    c.soldEver += m.soldEver;
    c.receivedEst += m.receivedEst;
    byCat.set(p.category, c);
  }

  return [...byCat.values()]
    .map((c) => {
      const perMonth = c.sold90 / 3;
      const perMonthAnnual = c.sold365 / 12;
      return {
        category: c.category,
        models: c.models,
        onHand: c.onHand,
        cost: c.cost,
        sold90: c.sold90,
        sold365: c.sold365,
        perMonth,
        monthsSupply: perMonth > 0 ? c.onHand / perMonth : null,
        perMonthAnnual,
        monthsSupplyAnnual: perMonthAnnual > 0 ? c.onHand / perMonthAnnual : null,
        sellThrough: c.receivedEst > 0 ? c.soldEver / c.receivedEst : null,
      };
    })
    .sort((a, b) => b.cost - a.cost);
}
