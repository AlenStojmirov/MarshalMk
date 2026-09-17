/**
 * The open-to-buy gate (Task 4.3).
 *
 * The question "how much may be spent on stock" comes before "on what", and it
 * is allowed to answer zero. At roughly fourteen months of supply against a
 * healthy three to four, it currently does.
 *
 * Two conditions, and both must hold:
 *
 *  - **Turnover clears the threshold.** Stock has to be moving before more is
 *    added. Below 2× a purchase buys a second copy of the existing problem.
 *  - **There is headroom under the ceiling.** The ceiling is a multiple of
 *    monthly cost of goods, so it grows with the business instead of being a
 *    number someone once picked.
 *
 * Extracted so the capital screen and the reorder plan cannot disagree about
 * where the line is. A budget computed two ways is a budget nobody trusts.
 */

import { Product } from '@/types';
import { NON_MERCHANDISE } from './seasons';

const DAY = 86_400_000;

/** Stock ceiling as a multiple of monthly cost of goods (docs/TURNAROUND.md). */
export const MAX_MONTHS_OF_STOCK = 2.5;
/** No general buying below this turnover — action A4. */
export const MIN_TURNOVER_TO_BUY = 2.0;

export interface OpenToBuy {
  /** Capital tied in stock, at cost. */
  totalCost: number;
  /** Cost of goods sold over the last year. */
  annualCogs: number;
  monthlyCogs: number;
  /** annualCogs / totalCost — how many times the stock turned over. */
  turnover: number;
  /** The healthy stock ceiling. */
  maxStock: number;
  /** maxStock − totalCost. Negative means over the ceiling. */
  headroom: number;
  /** Both conditions met. */
  canBuy: boolean;
  /** What may be spent: zero unless the gate is open. */
  budget: number;
}

export function openToBuy(products: Product[], now: number = Date.now()): OpenToBuy {
  let totalCost = 0;
  let annualCogs = 0;

  for (const p of products) {
    if (NON_MERCHANDISE.has(p.category)) continue;
    const cost = p.purchasePrice;

    const units = (p.sizes ?? []).reduce((a, s) => a + Math.max(0, Number(s.quantity) || 0), 0);
    if (units > 0 && cost !== undefined) totalCost += units * cost;

    for (const s of p.sold ?? []) {
      if (!(Number(s.price) > 0)) continue; // giveaways are not cost of sales
      if (Date.parse(String(s.soldDate)) < now - 365 * DAY) continue;
      if (cost !== undefined) annualCogs += cost;
    }
  }

  const monthlyCogs = annualCogs / 12;
  const turnover = totalCost > 0 ? annualCogs / totalCost : 0;
  const maxStock = monthlyCogs * MAX_MONTHS_OF_STOCK;
  const headroom = maxStock - totalCost;
  const canBuy = turnover >= MIN_TURNOVER_TO_BUY && headroom > 0;

  return {
    totalCost, annualCogs, monthlyCogs, turnover, maxStock, headroom,
    canBuy,
    budget: canBuy ? headroom : 0,
  };
}
