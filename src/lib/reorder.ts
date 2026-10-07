/**
 * The reorder plan (EPIC 4: tasks 4.1–4.3; whole series since Task 11.6).
 *
 * Four screens already answer a piece of this. `/admin/velocity` says *which*
 * models have proven themselves; `/admin/season` says *whether the window is
 * open*; `/admin/sizes` says *which runs are broken*; `/admin/capital` says
 * *whether there is any money*. None of them says "buy one series of this
 * shirt, S to XXL, for 2.750 den., and stop at the budget line". Four lists a
 * person has to join in their head is not a plan, and the joining is where the
 * mistake gets made.
 *
 * Three decisions carry the arithmetic.
 *
 * **The rate is measured over the selling life, not a fixed window.** A model
 * that sold five pieces and emptied has a rate of five over the days it
 * actually had stock — using the last ninety days instead would read zero for
 * anything that sold out in the spring, and a zero rate orders nothing, which
 * is precisely backwards. (`sellingRate` in series.ts.)
 *
 * **A model is bought in whole series (D-029).** Suppliers sell S–XXL or
 * 30–38, one of each; "only the L and the XL" is not an order. So each series
 * is judged as a whole: size by size, how much of it would sell within
 * SERIES_HORIZON_MONTHS, with what is already on the shelf selling first. A
 * series is bought when at least half of it is expected to go; a second one
 * only if it clears the same bar on its own. A proven model whose series does
 * not pay stays on the plan, marked, with the reason — its best sizes sell, the
 * rest would sit.
 *
 * **The number of series is capped** at what the model has ever had, and at
 * MAX_SERIES_PER_MODEL. A model that emptied in three weeks computes a pace
 * that would justify three series, and that is how a shop with 14 months of
 * stock got 14 months of stock.
 */

import { Product } from '@/types';
import { markup } from './cost';
import { groupOf } from './open-to-buy';
import { Month, monthOf, phaseOf, shouldBuyNow } from './seasons';
import {
  MAX_SERIES_PER_MODEL, MIN_SERIES_SELL_THROUGH, SERIES_HORIZON_MONTHS, forecastSeries, seriesContext,
  seriesWorthBuying,
} from './series';
import {
  RESTOCK_RECENCY_DAYS, VelocityMetrics, isDecidable, velocityOf,
} from './velocity';

/**
 * Days from placing an order to having the goods in the shop (Q2, answered
 * 2026-09-25): 7 to 10. The upper end is used — ordering a day early costs
 * nothing, running empty for a day costs the sales of that day.
 *
 * It sets the urgency — a model whose shelf will be empty before a reorder
 * could arrive has to be ordered today, not whenever.
 */
export const LEAD_TIME_DAYS = 10;

export interface ReorderLine {
  p: Product;
  m: VelocityMetrics;
  /** Days the model actually had stock to sell from. */
  sellingDays: number;
  /** Units a month across that selling life. */
  rate: number;
  /** Units the horizon would take at that pace, all sizes together. */
  wanted: number;
  /** The model's size series; empty when it is sold by the piece. */
  series: string[];
  /** Pieces in one series. */
  piecesPerSeries: number;
  /** Series bought: 0 when even one does not pay (`blockedBy: 'series'`). */
  seriesCount: number;
  /** Pieces this line buys — or, for a series that does not pay, what one would be. */
  units: number;
  /** Why fewer series than the forecast would take. */
  capped: 'original-buy' | 'max-per-model' | null;
  /**
   * The shelf will be empty before a reorder placed today could arrive — or is
   * empty already. Order these first: every day of delay is a day of lost sales.
   */
  urgent: boolean;
  /** Each size of the series, at the number of series bought. */
  sizes: Array<{ size: string; qty: number }>;
  unitCost: number;
  cost: number;
  /** Revenue if the whole line sells at the list price. */
  revenue: number;
  /** Pieces expected to sell within the horizon. */
  expectedSold: number;
  /** Of the first series, the share expected to sell within the horizon. */
  expectedSellThrough: number;
  /** Gross profit expected within the horizon. */
  expectedGross: number;
  /** Markup on cost, as before. */
  gmroi: number | null;
  /** Expected gross within the horizon per denar spent — the ranking metric. */
  score: number;
  /** False once the running total has passed the budget, or the series does not pay. */
  withinBudget: boolean;
  /**
   * Why a line is out: the whole budget is spent, its group has used its share
   * of it (open-to-buy, D-023), or a whole series would not sell (D-029).
   */
  blockedBy: 'total' | 'group' | 'series' | null;
}

export interface ReorderOptions {
  now?: number;
  month?: Month;
  /** Hard ceiling on the plan's cost. Lines past it are excluded, not hidden. */
  budget?: number;
  /**
   * Budget per group (`groupOf`), from open-to-buy. When given, a line also
   * has to fit what is left of its group's share.
   */
  groupBudgets?: Map<string, number>;
  /** Months a series is judged over; SERIES_HORIZON_MONTHS by default. */
  horizonMonths?: number;
}

export interface ReorderPlan {
  lines: ReorderLine[];
  /** Cost of the lines that fit the budget. */
  cost: number;
  units: number;
  revenue: number;
  /** Of those lines, what is expected within the horizon. */
  expectedRevenue: number;
  expectedGross: number;
  /** Cost of the lines the budget cut off. */
  blockedCost: number;
  blockedLines: number;
  /** Of those, the lines cut because their group is at its share. */
  blockedByGroup: number;
  /** Proven models whose whole series would not sell within the horizon. */
  notWorthSeries: number;
}

/**
 * Build the plan.
 *
 * Candidates are exactly the ones `/admin/velocity` calls buyable today: proven
 * demand, proof fresh within `RESTOCK_RECENCY_DAYS`, and a season window that
 * is open. The gates live in one place on purpose — a reorder list that
 * disagreed with the velocity screen about what qualifies would make both
 * useless.
 *
 * Passing a `month` other than today's plans for that month instead (Task 6.2):
 * the season gate moves, so in September you can see what February will want and
 * order it with the six weeks of lead time it needs. The sales measurements stay
 * anchored to today, because that is when they were taken — pretending the clock
 * had moved would shrink every window and quietly drop the evidence. The screen
 * says which month it is planning for, so the two dates are never confused.
 */
export function planReorder(products: Product[], opts: ReorderOptions = {}): ReorderPlan {
  const now = opts.now ?? Date.now();
  const month = opts.month ?? monthOf(now);
  const horizon = opts.horizonMonths ?? SERIES_HORIZON_MONTHS;
  const ctx = seriesContext(products);

  const lines: ReorderLine[] = [];

  for (const p of products) {
    // The owner's word overrides the sales history: a line the supplier dropped
    // or a style that has passed can still look like a winner on paper.
    if (p.noReorder) continue;
    const m = velocityOf(p, now, month);
    if (!isDecidable(m)) continue;
    if (m.klass !== 'soldout' && m.klass !== 'winner') continue;
    if (m.daysSinceLastSale === null || m.daysSinceLastSale > RESTOCK_RECENCY_DAYS) continue;
    if (!shouldBuyNow(phaseOf(p.category, month))) continue;

    // One more series than the cap, so a cap that binds can be said out loud.
    const f = forecastSeries(p, m, ctx, now, horizon, MAX_SERIES_PER_MODEL + 1);
    const everSeries = Math.max(1, Math.round(m.receivedEst / f.pieces));
    const cap = Math.min(MAX_SERIES_PER_MODEL, everSeries);
    const free = seriesWorthBuying(f, MAX_SERIES_PER_MODEL + 1);
    const count = Math.min(free, cap);
    const capped: ReorderLine['capped'] =
      free > count ? (everSeries < MAX_SERIES_PER_MODEL ? 'original-buy' : 'max-per-model') : null;

    // A series that does not pay is still priced at one, so the screen can say what it would be.
    const shown = Math.max(1, count);
    const units = shown * f.pieces;
    const unitCost = p.purchasePrice ?? 0;
    const cost = units * unitCost;
    const expectedSold = f.expected.slice(0, shown).reduce((a, e) => a + e, 0);
    const expectedGross = expectedSold * (p.price - unitCost);
    const daysLeft = f.rate > 0 ? (m.onHand / f.rate) * 30 : Infinity;

    lines.push({
      p, m,
      sellingDays: f.sellingDays,
      rate: f.rate,
      wanted: Math.ceil(f.rate * horizon),
      series: f.series,
      piecesPerSeries: f.pieces,
      seriesCount: count,
      units,
      capped,
      urgent: m.onHand === 0 || daysLeft < LEAD_TIME_DAYS,
      sizes: f.series.map((size) => ({ size, qty: shown })),
      unitCost,
      cost,
      revenue: units * p.price,
      expectedSold,
      expectedSellThrough: f.sellThrough[0],
      expectedGross,
      gmroi: markup(p.price, p.purchasePrice),
      score: cost > 0 ? expectedGross / cost : 0,
      withinBudget: count > 0,
      blockedBy: count > 0 ? null : 'series',
    });
  }

  lines.sort((a, b) => b.score - a.score || b.expectedGross - a.expectedGross);

  // The budget is a hard line, applied down the ranking. Lines past it stay in
  // the result marked `withinBudget: false` rather than being dropped: a plan
  // that silently omitted what it could not afford would hide the size of the
  // gap between what the shop needs and what it can pay for.
  const budget = opts.budget;
  const groupBudgets = opts.groupBudgets;
  let running = 0;
  const spent = new Map<string, number>();
  for (const l of lines) {
    if (l.blockedBy === 'series') continue;
    const g = groupOf(l.p.category);
    if (budget !== undefined && running + l.cost > budget) {
      l.withinBudget = false;
      l.blockedBy = 'total';
      continue;
    }
    if (groupBudgets && (spent.get(g) ?? 0) + l.cost > (groupBudgets.get(g) ?? 0)) {
      l.withinBudget = false;
      l.blockedBy = 'group';
      continue;
    }
    running += l.cost;
    spent.set(g, (spent.get(g) ?? 0) + l.cost);
  }

  // What fits first, in rank order; then what the money cut off, so the line
  // where it runs out is one line on screen; then the series that do not pay,
  // closest to paying first.
  const rank = (l: ReorderLine) => (l.withinBudget ? 0 : l.blockedBy === 'series' ? 2 : 1);
  lines.sort((a, b) => rank(a) - rank(b) || (rank(a) === 2 ? b.expectedSellThrough - a.expectedSellThrough : 0));

  const inb = lines.filter((l) => l.withinBudget);
  const cut = lines.filter((l) => l.blockedBy === 'total' || l.blockedBy === 'group');

  return {
    lines,
    cost: inb.reduce((a, l) => a + l.cost, 0),
    units: inb.reduce((a, l) => a + l.units, 0),
    revenue: inb.reduce((a, l) => a + l.revenue, 0),
    expectedRevenue: inb.reduce((a, l) => a + l.expectedSold * l.p.price, 0),
    expectedGross: inb.reduce((a, l) => a + l.expectedGross, 0),
    blockedCost: cut.reduce((a, l) => a + l.cost, 0),
    blockedLines: cut.length,
    blockedByGroup: cut.filter((l) => l.blockedBy === 'group').length,
    notWorthSeries: lines.filter((l) => l.blockedBy === 'series').length,
  };
}

export const CAP_LABEL: Record<NonNullable<ReorderLine['capped']>, string> = {
  'original-buy': 'ограничено на сериите што моделот досега ги имал',
  'max-per-model': `ограничено на ${MAX_SERIES_PER_MODEL} серии`,
};

/** Re-exported for the screens that speak about the rule. */
export { MAX_SERIES_PER_MODEL, MIN_SERIES_SELL_THROUGH, SERIES_HORIZON_MONTHS };
