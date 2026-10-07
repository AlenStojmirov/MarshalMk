/**
 * Size series: how clothing is actually bought (D-029, Task 11.6).
 *
 * The owner (2026-10-07): a model is never bought by the size. Tops come as a
 * series — S, M, L, XL, XXL, one of each — and jeans as 30, 31, 32, 33, 34,
 * 36, 38; other runs exist (M–XXXL, S–XL, 29–36, 46–56 for jackets and suits).
 * "Buy only the L and the XL of this shirt" is not an order a supplier takes.
 * Measured the same day: 79 of 86 shirt models show S–XXL, 31 of 42 jeans
 * 30–38.
 *
 * So a restock is a whole series, and the question is whether the series pays,
 * not whether its best size does. A model whose L and XL fly while S and XXL
 * sit brings a new S and XXL with every series — that is the flat curve on the
 * shelves (`marshal-flat-size-curve`), and it comes from the series, not from a
 * choice the buyer could have made differently.
 *
 * The forecast, per size of the series, over the cover the plan aims for:
 *
 *   demand(size) = the model's pace × the size's share of it × months
 *   a new piece of a size sells if demand reaches past what is already on the
 *   shelf in that size — the pieces there sell first.
 *
 * Demand is taken as Poisson, so "reaches past" is a probability. The share
 * of a size is the model's own sales of it, steadied by its category's
 * (SHARE_PRIOR pseudo-sales): a model has five or six sales, its category
 * hundreds. The series is bought if at least MIN_SERIES_SELL_THROUGH of it is
 * expected to go within SERIES_HORIZON_MONTHS. What stays (usually S and XXL)
 * is what D-027 lets the till discount once a model is down to one or two sizes.
 *
 * Measured when this was written: at a two-month bar not one proven model
 * passed — a model here sells 0,2 to 1,6 pieces a month across all its sizes,
 * so a five-piece series takes four to ten months to empty. That is the
 * twelve months of stock, seen one model at a time.
 *
 * Pure: no database, no browser.
 */

import { Product } from '@/types';
import { canonicalSize } from './sizes';
import type { VelocityMetrics } from './velocity';

const DAY = 86_400_000;

/**
 * The horizon a series is judged over. Half of it in four months is the whole
 * series in about eight or nine — the turn the 720.000 stock target needs to
 * break even (about 1,3× a year, D-023, D-028). A series slower than that makes
 * the whole shelf slower; one faster pulls it the right way.
 */
export const SERIES_HORIZON_MONTHS = 4;
/** Fewer sizes than this and a model's own run is not trusted as its series. */
export const MIN_SERIES_SIZES = 3;
/** Share of a series that has to be expected to sell within the horizon for it to be bought. */
export const MIN_SERIES_SELL_THROUGH = 0.5;
/** No model gets more series than this in one order, whatever the pace says. */
export const MAX_SERIES_PER_MODEL = 2;
/** How many of the category's sales a model's own size history is weighed against. */
export const SHARE_PRIOR = 5;

/**
 * Size labels that are sizes. `sold[]` also holds units of measure that leaked
 * into the field (`1000ML`, `KOLICINA` → `ONE`): a model with nothing else is
 * sold by the piece. 2XL and 3XL are folded to XXL and XXXL before this test.
 */
const REAL_SIZE = /^(XS|S|M|L|XL|XXL|XXXL|4XL|[2-6]\d)$/;
const LETTERS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '4XL'];

/** Sizes in the order a run is written: letters small to large, then numbers. */
export function compareSizes(a: string, b: string): number {
  const ia = LETTERS.indexOf(a);
  const ib = LETTERS.indexOf(b);
  if (ia >= 0 && ib >= 0) return ia - ib;
  if (ia >= 0) return -1;
  if (ib >= 0) return 1;
  const na = Number(a);
  const nb = Number(b);
  if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
  return a.localeCompare(b);
}

/** "S, M, L, XL, XXL" → "S–XXL" when the run has no gaps worth naming. */
export function seriesLabel(series: string[]): string {
  if (series.length === 0) return 'по парче';
  if (series.length <= 2) return series.join(', ');
  return `${series[0]}–${series[series.length - 1]}`;
}

/** Every size a model has shown — on the shelf, emptied, or sold — canonical, real, in order. */
export function sizesSeen(p: Product): string[] {
  const seen = new Set<string>();
  for (const s of p.sizes ?? []) seen.add(canonicalSize(s.size));
  for (const s of p.sold ?? []) seen.add(canonicalSize(s.size));
  return [...seen].filter((s) => REAL_SIZE.test(s)).sort(compareSizes);
}

/** Priced sales per size, per raw category, across all history. */
export function categorySizeMix(products: Product[]): Map<string, Map<string, number>> {
  const mix = new Map<string, Map<string, number>>();
  for (const p of products) {
    for (const s of p.sold ?? []) {
      if (!(Number(s.price) > 0)) continue;
      const key = canonicalSize(s.size);
      if (!REAL_SIZE.test(key)) continue;
      const m = mix.get(p.category) ?? new Map<string, number>();
      m.set(key, (m.get(key) ?? 0) + 1);
      mix.set(p.category, m);
    }
  }
  return mix;
}

/** Per category, the series most of its models show. */
export function categorySeries(products: Product[]): Map<string, string[]> {
  const counts = new Map<string, Map<string, number>>();
  for (const p of products) {
    const seen = sizesSeen(p);
    if (seen.length < MIN_SERIES_SIZES) continue;
    const key = seen.join(',');
    const m = counts.get(p.category) ?? new Map<string, number>();
    m.set(key, (m.get(key) ?? 0) + 1);
    counts.set(p.category, m);
  }
  const out = new Map<string, string[]>();
  for (const [category, m] of counts) {
    const [best] = [...m.entries()].sort((a, b) => b[1] - a[1]);
    out.set(category, best[0].split(','));
  }
  return out;
}

/**
 * A model's series: its own run when it has shown enough sizes, otherwise its
 * category's usual series if that covers what the model has shown. Empty: the
 * model is sold by the piece (one size, accessories).
 */
export function seriesOf(p: Product, usual?: string[]): string[] {
  const own = sizesSeen(p);
  if (own.length >= MIN_SERIES_SIZES || !usual || usual.length === 0) return own;
  return own.every((s) => usual.includes(s)) ? usual : own;
}

/**
 * The model's pace, measured over its selling life: from arrival to the last
 * sale for something that has emptied, to today for something still on the
 * shelf, floored at a month so a model that emptied in days cannot run away.
 */
export function sellingRate(p: Product, m: VelocityMetrics, now: number): { sellingDays: number; rate: number } {
  const start = p.firstReceivedAt ? p.firstReceivedAt.getTime() : null;
  const end = m.onHand === 0 && m.daysSinceLastSale !== null ? now - m.daysSinceLastSale * DAY : now;
  const sellingDays = start === null ? 365 : Math.max(30, (end - start) / DAY);
  return { sellingDays, rate: m.soldEver / (sellingDays / 30) };
}

/** Each size's share of the model's demand: its own sales, steadied by its category's. */
export function sizeShares(
  series: string[],
  own: Map<string, number>,
  category: Map<string, number> | undefined
): Map<string, number> {
  const catTotal = series.reduce((a, s) => a + (category?.get(s) ?? 0), 0);
  const out = new Map<string, number>();
  let sum = 0;
  for (const s of series) {
    const prior = catTotal > 0 ? (category?.get(s) ?? 0) / catTotal : 1 / series.length;
    const w = (own.get(s) ?? 0) + SHARE_PRIOR * prior;
    out.set(s, w);
    sum += w;
  }
  for (const [s, w] of out) out.set(s, sum > 0 ? w / sum : 1 / series.length);
  return out;
}

/** P(X ≥ n) for X ~ Poisson(λ). */
function atLeast(n: number, lambda: number): number {
  if (n <= 0) return 1;
  if (!(lambda > 0)) return 0;
  let term = Math.exp(-lambda);
  let cdf = term;
  for (let i = 1; i < n; i++) {
    term *= lambda / i;
    cdf += term;
  }
  return Math.max(0, 1 - cdf);
}

export interface SizeForecast {
  /** '' for a model sold by the piece. */
  size: string;
  onHand: number;
  /** Expected sales of this size within the horizon. */
  demand: number;
  /** Chance the new piece of this size from the 1st, 2nd, … series sells within the horizon. */
  sell: number[];
}

export interface SeriesForecast {
  /** The series; empty for a model sold by the piece. */
  series: string[];
  /** Pieces in one series. */
  pieces: number;
  perSize: SizeForecast[];
  /** Expected pieces sold within the horizon, of the 1st, 2nd, … series bought now. */
  expected: number[];
  /** expected ÷ pieces, per series. */
  sellThrough: number[];
  rate: number;
  sellingDays: number;
}

export interface SeriesContext {
  usual: Map<string, string[]>;
  mix: Map<string, Map<string, number>>;
}

export function seriesContext(products: Product[]): SeriesContext {
  return { usual: categorySeries(products), mix: categorySizeMix(products) };
}

/** How the next series of a model would sell over `months`, one size at a time. */
export function forecastSeries(
  p: Product,
  m: VelocityMetrics,
  ctx: SeriesContext,
  now: number,
  months: number,
  upTo: number = MAX_SERIES_PER_MODEL
): SeriesForecast {
  const series = seriesOf(p, ctx.usual.get(p.category));
  const { sellingDays, rate } = sellingRate(p, m, now);

  const own = new Map<string, number>();
  for (const s of p.sold ?? []) {
    if (!(Number(s.price) > 0)) continue;
    const k = canonicalSize(s.size);
    own.set(k, (own.get(k) ?? 0) + 1);
  }
  const onHand = new Map<string, number>();
  let onHandTotal = 0;
  for (const s of p.sizes ?? []) {
    const q = Math.max(0, Number(s.quantity) || 0);
    if (q === 0) continue;
    const k = canonicalSize(s.size);
    onHand.set(k, (onHand.get(k) ?? 0) + q);
    onHandTotal += q;
  }

  const shares = sizeShares(series, own, ctx.mix.get(p.category));
  const sizes = series.length > 0 ? series : [''];
  const perSize: SizeForecast[] = sizes.map((size) => {
    const demand = rate * (size ? shares.get(size) ?? 0 : 1) * months;
    const have = size ? onHand.get(size) ?? 0 : onHandTotal;
    return {
      size,
      onHand: have,
      demand,
      sell: Array.from({ length: upTo }, (_, k) => atLeast(have + k + 1, demand)),
    };
  });
  const pieces = sizes.length;
  const expected = Array.from({ length: upTo }, (_, k) => perSize.reduce((a, s) => a + s.sell[k], 0));
  return { series, pieces, perSize, expected, sellThrough: expected.map((e) => e / pieces), rate, sellingDays };
}

/** Series worth buying now: each one, on its own, has to clear MIN_SERIES_SELL_THROUGH. */
export function seriesWorthBuying(f: SeriesForecast, cap: number): number {
  let k = 0;
  while (k < Math.min(cap, f.sellThrough.length) && f.sellThrough[k] >= MIN_SERIES_SELL_THROUGH) k++;
  return k;
}
