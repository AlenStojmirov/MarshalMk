/**
 * Turning a requested discount into prices that are safe to write.
 *
 * Two screens now put stock on sale in bulk — the clearance list in
 * `/admin/aging` and the season list in `/admin/season` — and they must agree
 * exactly on where the floor sits and what a clamp does. The layout of each
 * page is its own business; this arithmetic is not.
 *
 * The rule: a requested cut that would land below cost + MARKDOWN_FLOOR is
 * clamped there rather than refused, and the clamp is reported so the caller
 * can say so. A price that quietly ignored the instruction would be worse than
 * one that argues with it.
 */

import { MARKDOWN_FLOOR, markdownFloorPrice } from './cost';

export interface MarkdownTarget {
  id: string;
  /** List price — always the pre-discount price, never an already-reduced one. */
  listPrice: number;
  /** Real unit cost, or undefined when it was never recorded. */
  cost?: number;
  /** Pieces on the shelf, for the cash-back estimate. */
  units: number;
}

export interface PricedMarkdown {
  id: string;
  listPrice: number;
  salePrice: number;
  /** True when the floor held the price above what was asked for. */
  clamped: boolean;
  /** The discount actually achieved, which is what gets stored. */
  effectivePct: number;
  /** Cash back if every piece sells at the new price. */
  cash: number;
  units: number;
}

/**
 * Price a set of targets at `pct` off.
 *
 * A target with no recorded cost has no floor to clamp against, so it takes the
 * requested cut in full — there is nothing to protect it with, and refusing to
 * price it would quietly drop rows the caller selected.
 */
export function priceMarkdown(targets: MarkdownTarget[], pct: number): PricedMarkdown[] {
  return targets.map((t) => {
    const wanted = Math.round(t.listPrice * (1 - pct / 100));
    const floor = markdownFloorPrice(t.cost) ?? 0;
    const salePrice = Math.max(wanted, floor);
    return {
      id: t.id,
      listPrice: t.listPrice,
      salePrice,
      clamped: salePrice > wanted,
      effectivePct: t.listPrice > 0 ? Math.round((1 - salePrice / t.listPrice) * 100) : 0,
      cash: salePrice * t.units,
      units: t.units,
    };
  });
}

export interface MarkdownTotals {
  models: number;
  units: number;
  /** Cash back if everything sells at the new prices. */
  cash: number;
  clamped: number;
}

export function markdownTotals(priced: PricedMarkdown[]): MarkdownTotals {
  return {
    models: priced.length,
    units: priced.reduce((a, p) => a + p.units, 0),
    cash: priced.reduce((a, p) => a + p.cash, 0),
    clamped: priced.filter((p) => p.clamped).length,
  };
}

/** The floor as a percentage above cost, for use in copy. */
export const FLOOR_PCT = Math.round((MARKDOWN_FLOOR - 1) * 100);
