/**
 * The reorder plan (EPIC 4: tasks 4.1–4.3).
 *
 * Four screens already answer a piece of this. `/admin/velocity` says *which*
 * models have proven themselves; `/admin/season` says *whether the window is
 * open*; `/admin/sizes` says *which sizes are missing*; `/admin/capital` says
 * *whether there is any money*. None of them says "buy two L and one XL of this
 * shirt, for 1.400 den., and stop at the budget line". Four lists a person has
 * to join in their head is not a plan, and the joining is where the mistake
 * gets made.
 *
 * Three decisions carry the arithmetic.
 *
 * **The rate is measured over the selling life, not a fixed window.** A model
 * that sold five pieces and emptied has a rate of five over the days it
 * actually had stock — using the last ninety days instead would read zero for
 * anything that sold out in the spring, and a zero rate orders nothing, which
 * is precisely backwards. So the window runs from first receipt to the last
 * sale for a sold-out model, and to today for one still on the shelf.
 *
 * **The quantity is capped at the original buy.** Never reorder more in one go
 * than was bought the first time. A model that emptied in three weeks computes
 * a rate that would justify ten pieces, and ten pieces of anything is how a
 * shop with 14 months of stock got 14 months of stock. The cap is the cheapest
 * possible defence against being right about direction and wrong about size.
 *
 * **The size curve is honoured across the plan, not within a line.** A model
 * has five or six sales, far too few to shape a curve; its category has
 * hundreds, so the category mix is what gets bought against. But most lines are
 * a single piece, and one piece cannot express 28/22/22 — rounding each line on
 * its own hands every one of them to L and the plan comes out 23 L against 2
 * XL, which is how you fix a size gap by digging a new one. So the sizes are
 * apportioned once, across all the lines of a category at the same time, by
 * whichever size is furthest behind its target. Each line still receives whole
 * pieces; it is the plan that carries the curve.
 *
 * The measured curve is L > M > XL > XXL > S, not flat — see
 * `marshal-flat-size-curve` for why that matters here.
 */

import { Product } from '@/types';
import { markup } from './cost';
import { Month, monthOf, phaseOf, shouldBuyNow } from './seasons';
import {
  RESTOCK_RECENCY_DAYS, VelocityMetrics, isDecidable, velocityOf,
} from './velocity';

const DAY = 86_400_000;

/** Months of cover a restock aims for. */
export const TARGET_COVER_MONTHS = 2;
/** No single model gets more than this in one order, whatever the rate says. */
export const MAX_UNITS_PER_MODEL = 6;
/** Shares below this are dropped from a size curve as noise. */
export const SIZE_SHARE_FLOOR = 0.05;

/**
 * Size tokens that mean something. The `sold[]` data also contains values like
 * `KOLICINA` and `1000ML` — 97% of the accessories "sizes" — which are units of
 * measure that leaked into the field. Splitting an order across those would
 * produce confident nonsense, so a category left with no real sizes is ordered
 * as a single unsized line instead.
 */
const REAL_SIZE = /^(XS|S|M|L|XL|XXL|2XL|XXXL|3XL|4XL|[2-6]\d)$/;

const normSize = (s: unknown) => String(s).trim().toUpperCase();

/** Priced sales per size, per raw category, across all history. */
export function categorySizeMix(products: Product[]): Map<string, Map<string, number>> {
  const mix = new Map<string, Map<string, number>>();
  for (const p of products) {
    for (const s of p.sold ?? []) {
      if (!(Number(s.price) > 0)) continue;
      const key = normSize(s.size);
      if (!REAL_SIZE.test(key)) continue;
      const m = mix.get(p.category) ?? new Map<string, number>();
      m.set(key, (m.get(key) ?? 0) + 1);
      mix.set(p.category, m);
    }
  }
  return mix;
}

function normalise(counts: Map<string, number>): Map<string, number> {
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  const out = new Map<string, number>();
  if (total === 0) return out;
  for (const [k, v] of counts) {
    const share = v / total;
    if (share >= SIZE_SHARE_FLOOR) out.set(k, share);
  }
  // Renormalise after dropping the tail so the shares still sum to one.
  const kept = [...out.values()].reduce((a, b) => a + b, 0);
  if (kept === 0) return new Map();
  for (const [k, v] of out) out.set(k, v / kept);
  return out;
}

export interface ReorderLine {
  p: Product;
  m: VelocityMetrics;
  /** Days the model actually had stock to sell from. */
  sellingDays: number;
  /** Units a month across that selling life. */
  rate: number;
  /** What `TARGET_COVER_MONTHS` of cover would need, before caps. */
  wanted: number;
  /** After the caps, minus what is already on the shelf. */
  units: number;
  /** Why the quantity is not simply `wanted`. */
  capped: 'original-buy' | 'max-per-model' | null;
  sizes: Array<{ size: string; qty: number }>;
  unitCost: number;
  cost: number;
  /** Revenue if the whole line sells at the list price. */
  revenue: number;
  /** Gross profit per denar of cost — the ranking metric. */
  gmroi: number | null;
  score: number;
  /** False once the running total has passed the budget. */
  withinBudget: boolean;
}

export interface ReorderOptions {
  now?: number;
  month?: Month;
  /** Hard ceiling on the plan's cost. Lines past it are excluded, not hidden. */
  budget?: number;
  coverMonths?: number;
}

export interface ReorderPlan {
  lines: ReorderLine[];
  /** Cost of the lines that fit the budget. */
  cost: number;
  units: number;
  revenue: number;
  /** Cost of the lines the budget cut off. */
  blockedCost: number;
  blockedLines: number;
}

/**
 * Build the plan.
 *
 * Candidates are exactly the ones `/admin/velocity` calls buyable today: proven
 * demand, proof fresh within `RESTOCK_RECENCY_DAYS`, and a season window that
 * is open. The gates live in one place on purpose — a reorder list that
 * disagreed with the velocity screen about what qualifies would make both
 * useless.
 */
export function planReorder(products: Product[], opts: ReorderOptions = {}): ReorderPlan {
  const now = opts.now ?? Date.now();
  const month = opts.month ?? monthOf(now);
  const cover = opts.coverMonths ?? TARGET_COVER_MONTHS;
  const catMix = categorySizeMix(products);

  const lines: ReorderLine[] = [];

  for (const p of products) {
    const m = velocityOf(p, now, month);
    if (!isDecidable(m)) continue;
    if (m.klass !== 'soldout' && m.klass !== 'winner') continue;
    if (m.daysSinceLastSale === null || m.daysSinceLastSale > RESTOCK_RECENCY_DAYS) continue;
    if (!shouldBuyNow(phaseOf(p.category, month))) continue;

    // The selling life: from arrival to the last sale for something that has
    // emptied, to today for something still on the shelf. Floored at a month so
    // a model that emptied in days cannot produce a runaway rate.
    const start = p.firstReceivedAt ? p.firstReceivedAt.getTime() : null;
    const end = m.onHand === 0 && m.daysSinceLastSale !== null
      ? now - m.daysSinceLastSale * DAY
      : now;
    const sellingDays = start === null ? 365 : Math.max(30, (end - start) / DAY);
    const rate = m.soldEver / (sellingDays / 30);

    const wanted = Math.ceil(rate * cover);
    let units = wanted;
    let capped: ReorderLine['capped'] = null;

    // Never reorder more in one go than the first buy. Being right about the
    // direction and wrong about the size is how the shelves filled up.
    if (units > m.receivedEst) {
      units = m.receivedEst;
      capped = 'original-buy';
    }
    if (units > MAX_UNITS_PER_MODEL) {
      units = MAX_UNITS_PER_MODEL;
      capped = 'max-per-model';
    }

    units = Math.max(0, units - m.onHand);
    if (units === 0) continue;

    const unitCost = p.purchasePrice ?? 0;
    const gm = markup(p.price, p.purchasePrice);

    lines.push({
      p, m, sellingDays, rate, wanted, units, capped,
      // Filled by apportionSizes once every line is known — a single piece
      // cannot carry a curve, only the whole plan can.
      sizes: [],
      unitCost,
      cost: units * unitCost,
      revenue: units * p.price,
      gmroi: gm,
      // Return per denar tied up, discounted by how reliably the model clears.
      // Both halves matter: a fat margin that never sells is not a return.
      score: Math.max(0, gm ?? 0) * Math.max(0, m.sellThrough ?? 0),
      withinBudget: true,
    });
  }

  lines.sort((a, b) => b.score - a.score || b.revenue - a.revenue);

  apportionSizes(lines, catMix);

  // The budget is a hard line, applied down the ranking. Lines past it stay in
  // the result marked `withinBudget: false` rather than being dropped: a plan
  // that silently omitted what it could not afford would hide the size of the
  // gap between what the shop needs and what it can pay for.
  const budget = opts.budget;
  let running = 0;
  for (const l of lines) {
    if (budget === undefined) continue;
    if (running + l.cost <= budget) running += l.cost;
    else l.withinBudget = false;
  }

  const inb = lines.filter((l) => l.withinBudget);
  const out = lines.filter((l) => !l.withinBudget);

  return {
    lines,
    cost: inb.reduce((a, l) => a + l.cost, 0),
    units: inb.reduce((a, l) => a + l.units, 0),
    revenue: inb.reduce((a, l) => a + l.revenue, 0),
    blockedCost: out.reduce((a, l) => a + l.cost, 0),
    blockedLines: out.length,
  };
}

/**
 * Hand out sizes across the whole plan, one category at a time.
 *
 * Largest deficit wins each piece: for every category the target is its curve
 * times the pieces that category is getting, and each piece goes to the size
 * furthest below its own target. Ties break toward a size the model itself has
 * sold, since that is the only per-model signal thin enough to trust as a
 * tiebreak but not as a curve.
 *
 * Mutates `lines` in rank order, so the highest-ranked models get first pick
 * when a category's pieces do not divide evenly.
 */
function apportionSizes(
  lines: ReorderLine[],
  catMix: Map<string, Map<string, number>>
): void {
  const byCat = new Map<string, ReorderLine[]>();
  for (const l of lines) {
    const arr = byCat.get(l.p.category) ?? [];
    arr.push(l);
    byCat.set(l.p.category, arr);
  }

  for (const [category, group] of byCat) {
    const curve = normalise(catMix.get(category) ?? new Map());
    if (curve.size === 0) continue; // no real sizes — lines stay unsized

    const totalUnits = group.reduce((a, l) => a + l.units, 0);
    const target = new Map<string, number>();
    for (const [size, share] of curve) target.set(size, share * totalUnits);
    const given = new Map<string, number>();

    for (const l of group) {
      const own = new Set(
        (l.p.sold ?? [])
          .filter((s) => Number(s.price) > 0)
          .map((s) => normSize(s.size))
      );
      const picked = new Map<string, number>();

      for (let n = 0; n < l.units; n += 1) {
        let best: string | null = null;
        let bestDeficit = -Infinity;
        for (const size of curve.keys()) {
          const deficit = (target.get(size) ?? 0) - (given.get(size) ?? 0);
          const wins =
            deficit > bestDeficit + 1e-9 ||
            // Tie: prefer a size this very model has sold before.
            (Math.abs(deficit - bestDeficit) <= 1e-9 && best !== null &&
              own.has(size) && !own.has(best));
          if (wins) {
            best = size;
            bestDeficit = deficit;
          }
        }
        if (best === null) break;
        given.set(best, (given.get(best) ?? 0) + 1);
        picked.set(best, (picked.get(best) ?? 0) + 1);
      }

      l.sizes = [...picked.entries()]
        .sort((a, b) => (curve.get(b[0]) ?? 0) - (curve.get(a[0]) ?? 0))
        .map(([size, qty]) => ({ size, qty }));
    }
  }
}

export const CAP_LABEL: Record<NonNullable<ReorderLine['capped']>, string> = {
  'original-buy': 'ограничено на првата набавка',
  'max-per-model': `ограничено на ${MAX_UNITS_PER_MODEL} парчиња`,
};
