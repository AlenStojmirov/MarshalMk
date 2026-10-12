/**
 * Open-to-buy: how much may be spent on stock, and in which categories (D-023, D-028, D-030).
 *
 * The owner set the terms on 2026-09-28:
 *
 *  - **The shop keeps 720.000 den. of stock at cost** (600.000 until 2026-09-29,
 *    raised with the owner's own money for November–January, D-028). That is the
 *    target, not a ceiling to fall under: stock that sells is replaced, so the
 *    shelf stays full.
 *  - **Costs of about 65.000 den. a month have to be earned as gross profit.**
 *    At a markup of 100% (a 500-den. piece sold for 1.000) that is 130.000 den.
 *    of sales. At the markup the shop actually achieves it is `opex / margin`.
 *
 * So the monthly budget is the classic retail open-to-buy: what the next thirty
 * days will take off the shelf, at cost, plus whatever the shop is below its
 * target (or minus what it is above). Below target, only a third of the
 * shortfall is released a month (TARGET_FILL_MONTHS): raised to 720.000 the
 * shelf was 86.000 short, and the whole of it on top of a month's sales would
 * have been 148.000 to spend in October — before a single new piece had shown
 * it sells. Above target the excess is subtracted at once, as before: money
 * already on the shelf is not spent twice. The next thirty days are read from the
 * same thirty days a year ago — sales here move with the season, and a yearly
 * average would buy jackets in June.
 *
 * The target is split between the categories in proportion to what each sold,
 * at cost, in the coming six months a year ago. Six, not twelve: a yearly share
 * would hold 78.000 den. of T-shirts through the winter and give knitwear a
 * third of what it sells from October to March. Six is also not three: the
 * target stock is about nine months of cost of goods, and a three-month window
 * would empty the shelf of whatever sells in spring before spring came. A
 * category above its share gets nothing, however well it sold, because the
 * money it would take is already on its shelf; the budget goes to the
 * categories below their share, in proportion to how far below.
 *
 * **By raw category, not by group (D-030).** The split was first made over the
 * nine reporting groups, and inside a group one category's excess paid for
 * another's shortfall: 43.716 den. of summer shorts counted as the jeans the
 * winter would ask for, suits as blazers, turtlenecks as half-zips. The shelf
 * does not trade like that — a man who came for jeans in December does not
 * leave with shorts — and the categories have not been merged (Task 2.4), so a
 * buyer buys by category. The groups stay as headings over the categories.
 * A category whose share rests on fewer than MIN_SHARE_SALES sales is an
 * estimate and says so; it keeps its own figure rather than being pooled into
 * its group, which would hide it again (the owner's call, 2026-10-12).
 *
 * This replaced a gate that allowed 2,5 months of cost of goods and demanded a
 * turnover of 2× before any purchase — a ceiling of about 125.000 den., which a
 * shop that means to hold 600.000 or more can never meet, so it always answered zero.
 *
 * Used by /admin/capital, /admin/reorder and the dashboard, so the three can
 * never disagree about the number.
 */

import { Product } from '@/types';
import { NON_MERCHANDISE } from './seasons';

const DAY = 86_400_000;

/** The owner's stock target, at cost: 600.000 on 2026-09-28, 720.000 from 2026-09-29 (D-028). */
export const STOCK_TARGET_COST = 720_000;

/**
 * Below target, the shortfall is closed over this many months, not in one
 * (D-028). Each month's purchase is then small enough to be judged by what it
 * sold before the next one is placed.
 */
export const TARGET_FILL_MONTHS = 3;

/**
 * What the distance from target changes in one month's budget: all of an
 * excess (it is subtracted), a TARGET_FILL_MONTHS-th of a shortfall (added).
 * `over` is stock − target, positive above target.
 */
export const overThisMonth = (over: number, held = false) =>
  over >= 0 ? over : held ? 0 : over / TARGET_FILL_MONTHS;

/**
 * The stop rule for the new money (D-028, Task 11.4). The fill toward the
 * target goes on only while what it bought sells: a model that arrived from
 * FILL_FROM on and has been on the shelf STOP_CHECK_DAYS is judged, and when at
 * least STOP_MIN_MODELS are judged and together they have sold less than
 * STOP_SELL_THROUGH of what came in, the next third is held. What sells is
 * still replaced — only the fill stops.
 *
 * Measured on new models, by `first_received_at`, which a product added in the
 * admin gets on the day it is entered. A restock of an existing model is
 * entered as a count and leaves no arrival behind (D-015), so it is not judged.
 */
const unitsOf = (p: Product) =>
  (p.sizes ?? []).reduce((a, s) => a + Math.max(0, Number(s.quantity) || 0), 0);

export const FILL_FROM = '2026-10-01';
export const STOP_CHECK_DAYS = 45;
export const STOP_SELL_THROUGH = 1 / 3;
export const STOP_MIN_MODELS = 3;

export interface NewStockModel {
  id: string;
  name: string;
  category: string;
  ageDays: number;
  sold: number;
  onHand: number;
  /** sold ÷ (sold + on hand). */
  sellThrough: number;
  /** On the shelf long enough to be judged. */
  judged: boolean;
}

export interface NewStockCheck {
  models: NewStockModel[];
  judged: number;
  /** Over the judged models; null when none are. */
  sellThrough: number | null;
  /** The fill is held this month. */
  held: boolean;
}

export function newStockCheck(products: Product[], now: number = Date.now()): NewStockCheck {
  const from = Date.parse(FILL_FROM);
  const models: NewStockModel[] = [];
  for (const p of products) {
    if (NON_MERCHANDISE.has(p.category) || !p.firstReceivedAt || p.firstReceivedEstimated) continue;
    const arrived = new Date(p.firstReceivedAt).getTime();
    if (!(arrived >= from)) continue;
    const sold = (p.sold ?? []).filter(
      (s) => (Number(s.price) || 0) > 0 && Date.parse(String(s.soldDate)) >= arrived
    ).length;
    const onHand = unitsOf(p);
    const ageDays = Math.floor((now - arrived) / DAY);
    models.push({
      id: p.id, name: p.name, category: p.category, ageDays, sold, onHand,
      sellThrough: sold + onHand > 0 ? sold / (sold + onHand) : 0,
      judged: ageDays >= STOP_CHECK_DAYS,
    });
  }
  const judged = models.filter((m) => m.judged);
  const sold = judged.reduce((a, m) => a + m.sold, 0);
  const came = judged.reduce((a, m) => a + m.sold + m.onHand, 0);
  const sellThrough = came > 0 ? sold / came : null;
  const held = judged.length >= STOP_MIN_MODELS && sellThrough !== null && sellThrough < STOP_SELL_THROUGH;
  models.sort((a, b) => Number(b.judged) - Number(a.judged) || a.sellThrough - b.sellThrough);
  return { models, judged: judged.length, sellThrough, held };
}

/** Monthly operating costs when none are entered for the month — the owner's estimate. */
export const OPEX_FALLBACK = 65_000;

/** How far ahead one budget reaches. A month: orders arrive in 7–10 days. */
export const OTB_HORIZON_DAYS = 30;

/** The window, a year back, that sets each category's share of the target. */
export const SHARE_WINDOW_DAYS = 182;

/**
 * Below this many priced sales in the window that sets its share, a category's
 * share is a judgement, not a measurement — the same bar as `CONFIDENCE_MIN`
 * for the seasons. Measured 2026-10-09: jeans 96, shirts 93, blouses 69; vests
 * 7, blazers 6, cardigans 6, dzemper 3.
 */
export const MIN_SHARE_SALES = 20;

/**
 * Raw categories under the nine headings of the proposed merge (Task 2.4).
 * Headings only since D-030: the money is split by raw category, and a group's
 * figures are the sums of its categories.
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

/** The figures a category has, and a group sums. */
export interface StockLine {
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
  /** Priced pieces sold in the last twelve months. */
  sold12: number;
  /** Gross profit per denar of stock. */
  gmroi: number;
  /** Sold ÷ (sold + on hand) over the year — a proxy, receipts were never recorded. */
  sellThrough: number;
  /** Stock ÷ monthly cost of goods. */
  monthsOfSupply: number;
  /** This line's share of the target. */
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

/** A raw category — the level the money is split at (D-030). `name` is the raw key. */
export interface CategoryCapital extends StockLine {
  group: string;
  /** Priced pieces behind its share: sold in the share window, or in the year when there is no window yet. */
  shareSales: number;
  /** Fewer than MIN_SHARE_SALES behind the share: a judgement, shown as one. */
  estimate: boolean;
}

/** A heading over its categories; every figure is their sum. */
export interface GroupCapital extends StockLine {
  categories: CategoryCapital[];
}

export interface OpenToBuy {
  stockCost: number;
  target: number;
  /** stockCost − target. Positive: above target. */
  overTarget: number;
  /** Below target: the part of the shortfall this month's budget fills. Zero above it. */
  fillThisMonth: number;
  /** The stop rule on what the new money bought. */
  newStock: NewStockCheck;

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
  /** Where the money goes, most first. */
  categories: CategoryCapital[];
  /** The same categories under their group headings. */
  groups: GroupCapital[];
  /** Budget per raw category, for the reorder plan. */
  categoryBudget: Map<string, number>;
}

export interface OpenToBuyOptions {
  now?: number;
  /** This month's operating costs; OPEX_FALLBACK when not entered. */
  opex?: number;
  target?: number;
}


const emptyLine = (name: string): StockLine => ({
  name, models: 0, units: 0, cost: 0, cogs12: 0, cogsAhead: 0, revenue12: 0, gross12: 0, sold12: 0,
  gmroi: 0, sellThrough: 0, monthsOfSupply: 0, target: 0, overTarget: 0,
  expectedCogs: 0, need: 0, buy: 0,
});

/** What a group adds up from its categories; the ratios are worked out again from the sums. */
const SUMMED = [
  'models', 'units', 'cost', 'cogs12', 'cogsAhead', 'revenue12', 'gross12', 'sold12',
  'target', 'expectedCogs', 'need', 'buy',
] as const;

function derive(l: StockLine) {
  l.gmroi = l.cost > 0 ? l.gross12 / l.cost : 0;
  l.sellThrough = l.sold12 + l.units > 0 ? l.sold12 / (l.sold12 + l.units) : 0;
  l.monthsOfSupply = l.cogs12 > 0 ? l.cost / (l.cogs12 / 12) : Infinity;
}

const mostFirst = (a: StockLine, b: StockLine) => b.buy - a.buy || a.overTarget - b.overTarget;

export function openToBuy(products: Product[], opts: OpenToBuyOptions = {}): OpenToBuy {
  const now = opts.now ?? Date.now();
  const target = opts.target ?? STOCK_TARGET_COST;
  const opexKnown = opts.opex !== undefined && opts.opex > 0;
  const opex = opexKnown ? (opts.opex as number) : OPEX_FALLBACK;

  // The same thirty days, a year ago.
  const aheadFrom = now - 365 * DAY;
  const aheadTo = aheadFrom + OTB_HORIZON_DAYS * DAY;

  const byCategory = new Map<string, CategoryCapital>();
  const aheadSales = new Map<string, number>();
  const categoryFor = (name: string) => {
    let c = byCategory.get(name);
    if (!c) {
      c = { ...emptyLine(name), group: groupOf(name), shareSales: 0, estimate: false };
      byCategory.set(name, c);
    }
    return c;
  };

  for (const p of products) {
    if (NON_MERCHANDISE.has(p.category)) continue;
    const c = categoryFor(p.category);
    const cost = p.purchasePrice;

    const units = unitsOf(p);
    if (units > 0) {
      c.models += 1;
      c.units += units;
      if (cost !== undefined) c.cost += units * cost;
    }

    for (const s of p.sold ?? []) {
      const price = Number(s.price) || 0;
      if (price <= 0) continue; // giveaways are neither demand nor cost of sales
      const t = Date.parse(String(s.soldDate));
      if (!Number.isFinite(t)) continue;
      if (t >= now - 365 * DAY) {
        c.revenue12 += price;
        c.sold12 += 1;
        if (cost !== undefined) {
          c.cogs12 += cost;
          c.gross12 += price - cost;
        }
      }
      if (t >= aheadFrom && t < aheadFrom + SHARE_WINDOW_DAYS * DAY) {
        aheadSales.set(c.name, (aheadSales.get(c.name) ?? 0) + 1);
      }
      if (cost !== undefined && t >= aheadFrom) {
        if (t < aheadTo) c.expectedCogs += cost;
        if (t < aheadFrom + SHARE_WINDOW_DAYS * DAY) c.cogsAhead += cost;
      }
    }
  }

  const categories = [...byCategory.values()].filter((c) => c.units > 0 || c.cogs12 > 0);
  const stockCost = categories.reduce((a, c) => a + c.cost, 0);
  const cogs12 = categories.reduce((a, c) => a + c.cogs12, 0);
  const revenue12 = categories.reduce((a, c) => a + c.revenue12, 0);
  const gross12 = revenue12 - cogs12;
  const expectedCogs = categories.reduce((a, c) => a + c.expectedCogs, 0);
  // Without a year of history the coming months cannot be read; fall back to
  // the yearly shares rather than to no shares at all.
  const aheadTotal = categories.reduce((a, c) => a + c.cogsAhead, 0);
  const shareOf = (c: CategoryCapital) =>
    aheadTotal > 0 ? c.cogsAhead / aheadTotal : cogs12 > 0 ? c.cogs12 / cogs12 : 0;

  const markupMultiple = cogs12 > 0 ? revenue12 / cogs12 : 0;
  const grossMargin = revenue12 > 0 ? gross12 / revenue12 : 0;
  const breakEvenRevenue = grossMargin > 0 ? opex / grossMargin : Infinity;
  const breakEvenCogs = Number.isFinite(breakEvenRevenue) ? breakEvenRevenue - opex : Infinity;
  const monthlyRevenue = revenue12 / 12;

  const overTarget = stockCost - target;
  const newStock = newStockCheck(products, now);
  let budget = Math.max(0, expectedCogs - overThisMonth(overTarget, newStock.held));

  for (const c of categories) {
    derive(c);
    c.target = target * shareOf(c);
    c.overTarget = c.cost - c.target;
    c.need = Math.max(0, c.expectedCogs - overThisMonth(c.overTarget, newStock.held));
    c.shareSales = aheadTotal > 0 ? aheadSales.get(c.name) ?? 0 : c.sold12;
    c.estimate = c.shareSales < MIN_SHARE_SALES;
  }

  // The budget follows the need, and never exceeds it. Categories above target
  // subtract their whole excess from their own need, but only a third of it
  // from the shop's shortfall — without the cap the difference would be money
  // no category is short of. Measured by group, the cap bit first: one
  // category's excess cancelled its neighbour's need (D-030).
  const totalNeed = categories.reduce((a, c) => a + c.need, 0);
  budget = Math.min(budget, totalNeed);
  const fillThisMonth = Math.max(0, budget - expectedCogs);
  for (const c of categories) c.buy = totalNeed > 0 ? (budget * c.need) / totalNeed : 0;

  categories.sort(mostFirst);

  const byGroup = new Map<string, GroupCapital>();
  for (const c of categories) {
    let g = byGroup.get(c.group);
    if (!g) {
      g = { ...emptyLine(c.group), categories: [] };
      byGroup.set(c.group, g);
    }
    g.categories.push(c);
    for (const k of SUMMED) g[k] += c[k];
  }
  const groups = [...byGroup.values()];
  for (const g of groups) {
    derive(g);
    g.overTarget = g.cost - g.target;
  }
  groups.sort(mostFirst);

  return {
    stockCost, target, overTarget, fillThisMonth, newStock,
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
    categories,
    groups,
    categoryBudget: new Map(categories.map((c) => [c.name, c.buy])),
  };
}
