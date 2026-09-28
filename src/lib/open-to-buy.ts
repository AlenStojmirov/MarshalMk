/**
 * Open-to-buy: how much may be spent on stock, and in which groups (D-023).
 *
 * The owner set the terms on 2026-09-28:
 *
 *  - **The shop keeps 600.000 den. of stock at cost.** That is the target, not a
 *    ceiling to fall under: stock that sells is replaced, so the shelf stays full.
 *  - **Costs of about 65.000 den. a month have to be earned as gross profit.**
 *    At a markup of 100% (a 500-den. piece sold for 1.000) that is 130.000 den.
 *    of sales. At the markup the shop actually achieves it is `opex / margin`.
 *
 * So the monthly budget is the classic retail open-to-buy: what the next thirty
 * days will take off the shelf, at cost, plus whatever the shop is below its
 * target (or minus what it is above). The next thirty days are read from the
 * same thirty days a year ago — sales here move with the season, and a yearly
 * average would buy jackets in June.
 *
 * The 600.000 is split between the groups in proportion to what each sold, at
 * cost, in the coming six months a year ago. Six, not twelve: a yearly share
 * would hold 78.000 den. of T-shirts through the winter and give knitwear a
 * third of what it sells from October to March. Six is also not three: the
 * target stock is about nine months of cost of goods, and a three-month window
 * would empty the shelf of whatever sells in spring before spring came. A group
 * above its share gets nothing, however well it sold, because the money it
 * would take is already on its shelf; the budget goes to the groups below their
 * share, in proportion to how far below.
 *
 * This replaced a gate that allowed 2,5 months of cost of goods and demanded a
 * turnover of 2× before any purchase — a ceiling of about 125.000 den., which a
 * shop that means to hold 600.000 can never meet, so it always answered zero.
 *
 * Used by /admin/capital, /admin/reorder and the dashboard, so the three can
 * never disagree about the number.
 */

import { Product } from '@/types';
import { NON_MERCHANDISE } from './seasons';

const DAY = 86_400_000;

/** The owner's stock target, at cost (2026-09-28). */
export const STOCK_TARGET_COST = 600_000;

/** Monthly operating costs when none are entered for the month — the owner's estimate. */
export const OPEX_FALLBACK = 65_000;

/** How far ahead one budget reaches. A month: orders arrive in 7–10 days. */
export const OTB_HORIZON_DAYS = 30;

/** The window, a year back, that sets each group's share of the target. */
export const SHARE_WINDOW_DAYS = 182;

/**
 * Raw categories folded into the groups a buyer thinks in. Shared with the
 * capital screen and the reorder plan, so a jacket is in the same group on both.
 */
export const CATEGORY_GROUPS: Record<string, string> = {
  tShirts: 'Маици & Поло', oversizeTshirts: 'Маици & Поло', polos: 'Маици & Поло',
  shirts: 'Кошули', shortSleevedShirt: 'Кошули', blouses: 'Кошули',
  cardigans: 'Плетиво', turtleNecks: 'Плетиво', halfZips: 'Плетиво', dzemper: 'Плетиво',
  hoodies: 'Дуксери', fullZips: 'Дуксери',
  jeans: 'Фармерки', shortsJeans: 'Фармерки',
  pants: 'Панталони', cargoTrousers: 'Панталони',
  jackets: 'Јакни & Мантили', coats: 'Јакни & Мантили', vests: 'Јакни & Мантили',
  suits: 'Свечено', blazers: 'Свечено', suitJackets: 'Свечено',
  belts: 'Аксесоари', accessories: 'Аксесоари',
};
export const groupOf = (category: string): string => CATEGORY_GROUPS[category] ?? category ?? '—';

export interface GroupCapital {
  name: string;
  /** Models with stock. */
  models: number;
  units: number;
  /** Stock at cost. */
  cost: number;
  /** Cost of what sold in the last twelve months. */
  cogs12: number;
  /** Cost of what sold in the coming six months, a year ago — sets the share. */
  cogsAhead: number;
  revenue12: number;
  gross12: number;
  /** Gross profit per denar of stock. */
  gmroi: number;
  /** Sold ÷ (sold + on hand) over the year — a proxy, receipts were never recorded. */
  sellThrough: number;
  /** Stock ÷ monthly cost of goods. */
  monthsOfSupply: number;
  /** This group's share of the target. */
  target: number;
  /** cost − target: above its share when positive. */
  overTarget: number;
  /** Cost of what the same thirty days a year ago took off the shelf. */
  expectedCogs: number;
  /** What would bring it back to its share after the next thirty days. */
  need: number;
  /** Its part of the budget. */
  buy: number;
}

export interface OpenToBuy {
  stockCost: number;
  target: number;
  /** stockCost − target. Positive: above target. */
  overTarget: number;

  cogs12: number;
  revenue12: number;
  gross12: number;
  monthlyRevenue: number;
  monthlyGross: number;
  /** Revenue ÷ cost of goods — 2.0 is "a 500-den. piece sold for 1.000". */
  markupMultiple: number;
  /** Gross profit as a share of revenue. */
  grossMargin: number;

  opex: number;
  opexKnown: boolean;
  /** Revenue a month that covers opex at the achieved margin. */
  breakEvenRevenue: number;
  /** The cost of goods that revenue takes off the shelf. */
  breakEvenCogs: number;
  /** breakEvenRevenue − monthlyRevenue: how far a month is from zero. */
  revenueGap: number;

  /** Cost of goods a year ÷ stock. */
  turnover: number;
  /** The turnover that breaks even holding the target stock. */
  breakEvenTurnover: number;
  /** Stock ÷ monthly cost of goods. */
  monthsOfSupply: number;

  /** Cost of what the next thirty days should take off the shelf. */
  expectedCogs: number;
  /** What may be spent in the next thirty days. Zero when that is the answer. */
  budget: number;
  groups: GroupCapital[];
  /** Budget per group, for the reorder plan. */
  groupBudget: Map<string, number>;
}

export interface OpenToBuyOptions {
  now?: number;
  /** This month's operating costs; OPEX_FALLBACK when not entered. */
  opex?: number;
  target?: number;
}

const unitsOf = (p: Product) =>
  (p.sizes ?? []).reduce((a, s) => a + Math.max(0, Number(s.quantity) || 0), 0);

export function openToBuy(products: Product[], opts: OpenToBuyOptions = {}): OpenToBuy {
  const now = opts.now ?? Date.now();
  const target = opts.target ?? STOCK_TARGET_COST;
  const opexKnown = opts.opex !== undefined && opts.opex > 0;
  const opex = opexKnown ? (opts.opex as number) : OPEX_FALLBACK;

  // The same thirty days, a year ago.
  const aheadFrom = now - 365 * DAY;
  const aheadTo = aheadFrom + OTB_HORIZON_DAYS * DAY;

  const byGroup = new Map<string, GroupCapital>();
  const groupFor = (name: string) => {
    let g = byGroup.get(name);
    if (!g) {
      g = {
        name, models: 0, units: 0, cost: 0, cogs12: 0, cogsAhead: 0, revenue12: 0, gross12: 0,
        gmroi: 0, sellThrough: 0, monthsOfSupply: 0, target: 0, overTarget: 0,
        expectedCogs: 0, need: 0, buy: 0,
      };
      byGroup.set(name, g);
    }
    return g;
  };

  const soldUnits12 = new Map<string, number>();

  for (const p of products) {
    if (NON_MERCHANDISE.has(p.category)) continue;
    const g = groupFor(groupOf(p.category));
    const cost = p.purchasePrice;

    const units = unitsOf(p);
    if (units > 0) {
      g.models += 1;
      g.units += units;
      if (cost !== undefined) g.cost += units * cost;
    }

    for (const s of p.sold ?? []) {
      const price = Number(s.price) || 0;
      if (price <= 0) continue; // giveaways are neither demand nor cost of sales
      const t = Date.parse(String(s.soldDate));
      if (!Number.isFinite(t)) continue;
      if (t >= now - 365 * DAY) {
        g.revenue12 += price;
        soldUnits12.set(g.name, (soldUnits12.get(g.name) ?? 0) + 1);
        if (cost !== undefined) {
          g.cogs12 += cost;
          g.gross12 += price - cost;
        }
      }
      if (cost !== undefined && t >= aheadFrom) {
        if (t < aheadTo) g.expectedCogs += cost;
        if (t < aheadFrom + SHARE_WINDOW_DAYS * DAY) g.cogsAhead += cost;
      }
    }
  }

  const groups = [...byGroup.values()].filter((g) => g.units > 0 || g.cogs12 > 0);
  const stockCost = groups.reduce((a, g) => a + g.cost, 0);
  const cogs12 = groups.reduce((a, g) => a + g.cogs12, 0);
  const revenue12 = groups.reduce((a, g) => a + g.revenue12, 0);
  const gross12 = revenue12 - cogs12;
  const expectedCogs = groups.reduce((a, g) => a + g.expectedCogs, 0);
  // Without a year of history the coming months cannot be read; fall back to
  // the yearly shares rather than to no shares at all.
  const aheadTotal = groups.reduce((a, g) => a + g.cogsAhead, 0);
  const shareOf = (g: GroupCapital) =>
    aheadTotal > 0 ? g.cogsAhead / aheadTotal : cogs12 > 0 ? g.cogs12 / cogs12 : 0;

  const markupMultiple = cogs12 > 0 ? revenue12 / cogs12 : 0;
  const grossMargin = revenue12 > 0 ? gross12 / revenue12 : 0;
  const breakEvenRevenue = grossMargin > 0 ? opex / grossMargin : Infinity;
  const breakEvenCogs = Number.isFinite(breakEvenRevenue) ? breakEvenRevenue - opex : Infinity;
  const monthlyRevenue = revenue12 / 12;

  const overTarget = stockCost - target;
  const budget = Math.max(0, expectedCogs - overTarget);

  for (const g of groups) {
    const units12 = soldUnits12.get(g.name) ?? 0;
    g.gmroi = g.cost > 0 ? g.gross12 / g.cost : 0;
    g.sellThrough = units12 + g.units > 0 ? units12 / (units12 + g.units) : 0;
    g.monthsOfSupply = g.cogs12 > 0 ? g.cost / (g.cogs12 / 12) : Infinity;
    g.target = target * shareOf(g);
    g.overTarget = g.cost - g.target;
    g.need = Math.max(0, g.expectedCogs - g.overTarget);
  }

  // The budget follows the need. It can never exceed the total need: groups
  // above target only subtract from the budget, never from the need.
  const totalNeed = groups.reduce((a, g) => a + g.need, 0);
  for (const g of groups) g.buy = totalNeed > 0 ? (budget * g.need) / totalNeed : 0;

  groups.sort((a, b) => b.buy - a.buy || a.overTarget - b.overTarget);

  return {
    stockCost, target, overTarget,
    cogs12, revenue12, gross12,
    monthlyRevenue, monthlyGross: gross12 / 12,
    markupMultiple, grossMargin,
    opex, opexKnown,
    breakEvenRevenue, breakEvenCogs,
    revenueGap: breakEvenRevenue - monthlyRevenue,
    turnover: stockCost > 0 ? cogs12 / stockCost : 0,
    breakEvenTurnover: target > 0 && Number.isFinite(breakEvenCogs) ? (12 * breakEvenCogs) / target : 0,
    monthsOfSupply: cogs12 > 0 ? stockCost / (cogs12 / 12) : Infinity,
    expectedCogs,
    budget,
    groups,
    groupBudget: new Map(groups.map((g) => [g.name, g.buy])),
  };
}
