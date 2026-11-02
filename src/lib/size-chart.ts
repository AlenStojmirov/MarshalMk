/**
 * Standard size charts and "find my size" (Task 9.9, D-043).
 *
 * The shop cannot measure every garment (owner, 2026-11-01), so a product page
 * shows the body measurements a size stands for, the way the Turkish chains it
 * buys from publish them (DeFacto, LC Waikiki, Koton, Mavi, Colin's, Kiğılı,
 * read 2026-11-01). Body, not garment: that is what a customer can measure on
 * themselves with a tape. A product someone did measure in the shop shows its
 * own garment measurements beside this (`attributes.measurements`).
 *
 * Three ladders, decided per product from its size labels:
 * - letters (S…XXXL): chest, and waist for letter-sized trousers and shorts;
 * - waist numbers (28…42): the waist in inches; Turkish trousers sit a little
 *   wider than the number, so 2–4 cm on top of number × 2.54;
 * - European numbers (44…60, suits, coats, some jackets and trousers):
 *   chest ≈ number × 2, waist ≈ chest − 12.
 *
 * No chart has a slim version: none of those shops publishes one. A slim cut is
 * about 4 cm narrower in the chest — a whole size from S to L — so the cut
 * carries the advice instead ("between two, take the larger"), and a product's
 * own size advice, where staff filled it in, wins over the cut.
 *
 * The numbers below are the consensus of those charts, middle values where
 * they differ by a centimetre or two; the owner confirms them before they go
 * live. Change them here and nowhere else.
 */

import type { SizeAdvice } from '@/types';
import { templateOf } from './attributes';
import { canonicalSize, sortSizes } from './sizes';

export type BodyMeasure = 'chest' | 'waist';
export type SizeSystem = 'letter' | 'waist' | 'eu';
/** Centimetres, both ends included. */
export type Range = readonly [number, number];

export interface ChartRow {
  /** The size as the product stores it ("XXL", "32", "48"). */
  size: string;
  chest?: Range;
  waist?: Range;
}

export interface SizeChart {
  system: SizeSystem;
  /** What the customer measures to find a size: chest for tops, waist for trousers. */
  measure: BodyMeasure;
  /** The columns the table shows, `measure` first. */
  columns: BodyMeasure[];
  /** The product's own sizes, in order, each with what it stands for. */
  rows: ChartRow[];
  /** The whole ladder: a size is found on it even when this product lacks it. */
  ladder: ChartRow[];
}

/** Letters: chest from the Turkish charts, waist 14 cm under it (their drop). */
export const LETTER_CHART: readonly ChartRow[] = [
  { size: 'XS', chest: [88, 91], waist: [74, 77] },
  { size: 'S', chest: [92, 96], waist: [78, 82] },
  { size: 'M', chest: [97, 101], waist: [83, 87] },
  { size: 'L', chest: [102, 107], waist: [88, 93] },
  { size: 'XL', chest: [108, 113], waist: [94, 99] },
  { size: 'XXL', chest: [114, 120], waist: [100, 106] },
  { size: 'XXXL', chest: [121, 127], waist: [107, 113] },
  { size: '4XL', chest: [128, 134], waist: [114, 120] },
];

/** Waist numbers the shop sells (SIZE_PRESETS 'Половина'), and two beyond. */
const WAIST_NUMBERS = [28, 29, 30, 31, 32, 33, 34, 36, 38, 40, 42];
/** European numbers, suits and coats (SIZE_PRESETS 'Сако / одело'), and two beyond. */
const EU_NUMBERS = [42, 44, 46, 48, 50, 52, 54, 56, 58, 60];
/** From this number up, a size is European, not inches: no waist is 44 inches in this shop. */
const EU_FROM = 44;

/** Waist in inches → body waist in cm, with the 2–4 cm Turkish cuts add. */
export function waistRow(n: number): ChartRow {
  const cm = n * 2.54;
  return { size: String(n), waist: [Math.round(cm + 2), Math.round(cm + 4)] };
}

/** European number → chest about twice the number, waist 12 cm under the chest. */
export function euRow(n: number): ChartRow {
  return { size: String(n), chest: [n * 2 - 2, n * 2 + 1], waist: [n * 2 - 14, n * 2 - 11] };
}

/**
 * An inch is 2.54 cm, so whole-centimetre ranges of neighbouring waist numbers
 * share their end (31 → 81–83, 32 → 83–85). Each range ends a centimetre
 * before the next one starts; a gap where a number is skipped (35) stays.
 */
function untangle(ladder: ChartRow[]): ChartRow[] {
  return ladder.map((r, i) => {
    const next = ladder[i + 1]?.waist;
    if (!r.waist || !next || next[0] > r.waist[1]) return r;
    return { ...r, waist: [r.waist[0], Math.max(r.waist[0] + 1, next[0] - 1)] as const };
  });
}

const LETTERS = new Set(LETTER_CHART.map((r) => r.size));
const isNumber = (s: string) => /^\d{2}$/.test(s);

/** Chest for anything worn on top (a suit too), waist for trousers and shorts. None for a belt. */
export function measureOf(category: string): BodyMeasure | null {
  const m = templateOf(category).measures;
  if (m.includes('chest')) return 'chest';
  if (m.includes('waist')) return 'waist';
  return null;
}

/**
 * The chart for one product, from its category and the sizes it comes in
 * (sold-out ones too: the table answers "would M fit me?"). Null when there is
 * nothing to chart: a belt, one size, labels no ladder knows.
 */
export function sizeChartFor(category: string, sizes: readonly string[]): SizeChart | null {
  const measure = measureOf(category);
  if (!measure) return null;

  const labels = [...new Set(sizes.map((s) => canonicalSize(s)).filter(Boolean))];
  const letters = labels.filter((l) => LETTERS.has(l));
  const numbers = labels.filter(isNumber).map(Number);
  if (letters.length === 0 && numbers.length === 0) return null;

  let system: SizeSystem;
  let ladder: ChartRow[];
  if (letters.length >= numbers.length) {
    system = 'letter';
    ladder = [...LETTER_CHART];
  } else if (Math.max(...numbers) >= EU_FROM) {
    system = 'eu';
    ladder = [...new Set([...EU_NUMBERS, ...numbers])].sort((a, b) => a - b).map(euRow);
  } else {
    system = 'waist';
    ladder = untangle([...new Set([...WAIST_NUMBERS, ...numbers])].sort((a, b) => a - b).map(waistRow));
  }

  // A waist-number ladder has no chest: a top sized in inches is not charted.
  if (!ladder.every((r) => r[measure])) return null;

  const byLabel = new Map(ladder.map((r) => [r.size, r]));
  const rows = sortSizes(labels)
    .map((l) => byLabel.get(l))
    .filter((r): r is ChartRow => !!r);
  if (rows.length === 0) return null;

  const columns: BodyMeasure[] = measure === 'chest' ? ['chest', 'waist'] : ['waist'];
  return { system, measure, columns, rows, ladder };
}

// ---------------------------------------------------------------------------
// The cut, and what it means for picking a size
// ---------------------------------------------------------------------------

export type FitFeel = 'tight' | 'normal' | 'loose';

const TIGHT = new Set(['slim', 'skinny']);
const LOOSE = new Set(['oversize', 'relaxed', 'baggy', 'wide']);

export function fitFeel(fit?: string): FitFeel {
  if (fit && TIGHT.has(fit)) return 'tight';
  if (fit && LOOSE.has(fit)) return 'loose';
  return 'normal';
}

/**
 * The one line under the size buttons. A product's size advice, where staff
 * filled it in, says it all; otherwise the cut speaks, and a regular one has
 * nothing to add. Keys of `product.fitHint` in the translations.
 */
export type FitHint = 'adviceLarger' | 'adviceSmaller' | 'adviceTrue' | 'tight' | 'loose';

export function fitHint(fit?: string, advice?: SizeAdvice): FitHint | null {
  if (advice === 'larger') return 'adviceLarger';
  if (advice === 'smaller') return 'adviceSmaller';
  if (advice === 'true') return 'adviceTrue';
  const feel = fitFeel(fit);
  return feel === 'normal' ? null : feel;
}

// ---------------------------------------------------------------------------
// Find my size
// ---------------------------------------------------------------------------

/** How close to the line between two sizes counts as "between two" (cm, either side). */
export const BETWEEN_CM = 0.75;
/** How far past the ends of the ladder a measurement still gets its end size. */
const BEYOND_CM = 4;
/** What the finder accepts at all, in cm: anything else is a typo. */
export const MEASURE_LIMITS = { min: 50, max: 200 } as const;

export type SuggestionReason = 'adviceLarger' | 'adviceSmaller' | 'betweenTight' | 'betweenNormal' | 'betweenLoose' | 'fits';

export type SizeSuggestion =
  | { kind: 'size'; size: string; reason: SuggestionReason; alternative?: string }
  | { kind: 'below' }
  | { kind: 'above' };

/**
 * The size for a body measurement on this product's chart: where the
 * measurement falls on the ladder, then the product's size advice, else the
 * cut for someone between two sizes — a slim one takes the larger, a loose one
 * the smaller, a regular one the larger with the smaller offered.
 */
export function suggestSize(chart: SizeChart, cm: number, fit?: string, advice?: SizeAdvice): SizeSuggestion {
  const ladder = chart.ladder;
  const range = (i: number) => ladder[i][chart.measure]!;
  const last = ladder.length - 1;
  if (cm < range(0)[0] - BEYOND_CM) return { kind: 'below' };
  if (cm > range(last)[1] + BEYOND_CM) return { kind: 'above' };

  // The line between two sizes sits halfway across the gap between their ranges.
  const line = (i: number) => (range(i)[1] + range(i + 1)[0]) / 2;
  let base = 0;
  while (base < last && cm > line(base)) base++;

  // Between two: close to the line above base, or to the one below it.
  let pair: [number, number] | null = null;
  if (base < last && Math.abs(cm - line(base)) <= BETWEEN_CM) pair = [base, base + 1];
  else if (base > 0 && Math.abs(cm - line(base - 1)) <= BETWEEN_CM) pair = [base - 1, base];

  const at = (i: number) => ladder[Math.min(last, Math.max(0, i))].size;

  if (advice === 'larger') return { kind: 'size', size: at(pair ? pair[1] : base + 1), reason: 'adviceLarger' };
  if (advice === 'smaller') return { kind: 'size', size: at(pair ? pair[0] : base - 1), reason: 'adviceSmaller' };
  if (!pair) return { kind: 'size', size: at(base), reason: 'fits' };

  const feel = fitFeel(fit);
  if (feel === 'tight') return { kind: 'size', size: at(pair[1]), reason: 'betweenTight' };
  if (feel === 'loose') return { kind: 'size', size: at(pair[0]), reason: 'betweenLoose' };
  return { kind: 'size', size: at(pair[1]), reason: 'betweenNormal', alternative: at(pair[0]) };
}

/** "92–96" */
export const formatRange = (r: Range) => `${r[0]}–${r[1]}`;
