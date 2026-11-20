/**
 * A selling price from what a piece really costs the shop (owner, 2026-11-20, D-049).
 *
 * The purchase price is only part of it. Rent, salaries, fees and the rest
 * are paid whatever sells, and advertising on top; a price that covers only
 * the purchase is a loss. So the suggestion adds to the purchase price:
 *
 *   - the shop's costs, shared out **by purchase price**: over the last twelve
 *     whole months the costs (without advertising) were X a month and the
 *     goods sold cost Y a month at purchase, so each denar of purchase carried
 *     X ÷ Y denars of costs. By purchase price, not by the piece: a share per
 *     piece (≈ 880 den. measured 2026-11-20) would double a 500-den. T-shirt
 *     and barely touch a 3.000-den. coat;
 *   - advertising, the same way: the monthly budget (AD_BUDGET, 3.000) ÷ Y;
 *   - then the profit, as a share of the price.
 *
 * Purchase + costs + advertising is the piece's full cost: below it, every
 * sale at the pace of the last year loses money. The shares fall as more is
 * sold — they are this shop at this pace, not a law. A month's costs count only
 * when the month is whole, else OPEX_FALLBACK stands in (D-024, monthCosts).
 *
 * Pure but for `fetchOverheadBasis`, which takes a client that may read the
 * ledger and the expenses: the admin's (the form shows this to the admin only)
 * or the service role.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { AD_BUDGET, monthCosts, type ExpenseLine } from './break-even';

/** Whole months the shares are measured over. */
export const SUGGEST_WINDOW_MONTHS = 12;
/** The profit the suggestion asks for by default, as a share of the price. */
export const SUGGEST_PROFIT_SHARE = 0.1;
/** Prices are rounded up to this: 486 of 495 end in 00 (measured 2026-11-20). */
export const SUGGEST_ROUND_TO = 100;
/** Highest profit share the panel takes; above it the price runs away. */
export const SUGGEST_PROFIT_MAX = 0.6;

const TZ = 'Europe/Skopje';
const localPeriod = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d).slice(0, 7);

export interface OverheadBasis {
  /** First and last month counted, 'YYYY-MM'. */
  from: string;
  to: string;
  months: number;
  /** The shop's costs a month, without advertising. */
  opexPerMonth: number;
  /** Months whose costs were not whole, where OPEX_FALLBACK stood in. */
  estimatedMonths: number;
  /** What the goods sold cost a month, at purchase price. */
  cogsPerMonth: number;
  unitsPerMonth: number;
  revenuePerMonth: number;
}

export interface ExpenseInput extends ExpenseLine {
  period: string;
}

export interface SaleInput {
  period: string;
  qty: number;
  unitPrice: number;
  /** Null when the product had no purchase price when it sold. */
  unitCost: number | null;
}

/** The last `n` whole months before `now`, oldest first. */
export function windowPeriods(now: Date, n = SUGGEST_WINDOW_MONTHS): string[] {
  const [y, m] = localPeriod(now).split('-').map(Number);
  const out: string[] = [];
  for (let i = n; i >= 1; i--) {
    const d = new Date(Date.UTC(y, m - 1 - i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

export function overheadBasis(periods: string[], expenses: ExpenseInput[], sales: SaleInput[]): OverheadBasis | null {
  if (!periods.length) return null;
  const inWindow = new Set(periods);

  let opex = 0;
  let estimatedMonths = 0;
  for (const p of periods) {
    const c = monthCosts(expenses.filter((e) => e.period === p));
    opex += c.base;
    if (!c.baseKnown) estimatedMonths++;
  }

  let units = 0, revenue = 0, cogs = 0, costedRevenue = 0, costedCogs = 0;
  const uncosted: SaleInput[] = [];
  for (const s of sales) {
    if (!inWindow.has(s.period) || !(s.unitPrice > 0)) continue;
    const q = Math.max(0, s.qty || 0);
    units += q;
    revenue += s.unitPrice * q;
    if (s.unitCost !== null && s.unitCost > 0) {
      cogs += s.unitCost * q;
      costedRevenue += s.unitPrice * q;
      costedCogs += s.unitCost * q;
    } else uncosted.push(s);
  }
  // A piece sold without a purchase price is costed at the year's own ratio.
  const ratio = costedRevenue > 0 ? costedCogs / costedRevenue : 0;
  for (const s of uncosted) cogs += s.unitPrice * Math.max(0, s.qty || 0) * ratio;

  const n = periods.length;
  return {
    from: periods[0],
    to: periods[n - 1],
    months: n,
    opexPerMonth: opex / n,
    estimatedMonths,
    cogsPerMonth: cogs / n,
    unitsPerMonth: units / n,
    revenuePerMonth: revenue / n,
  };
}

export interface SuggestOptions {
  /** Advertising a month. Default AD_BUDGET. */
  marketingPerMonth?: number;
  /** Profit as a share of the price, 0 to SUGGEST_PROFIT_MAX. Default SUGGEST_PROFIT_SHARE. */
  profitShare?: number;
}

export interface PriceSuggestion {
  cost: number;
  /** The shop's costs this piece carries. */
  overhead: number;
  /** The advertising it carries. */
  marketing: number;
  /** cost + overhead + marketing. */
  fullCost: number;
  /** The full cost rounded up: the lowest price that does not lose money at this pace. */
  breakEven: number;
  profitShare: number;
  /** The full cost with the profit on top, rounded up. */
  suggested: number;
  /** Gross margin at the suggested price (price − purchase) ÷ price. */
  marginAtSuggested: number;
  /** Denars of the shop's costs per denar of purchase. */
  overheadRate: number;
  marketingRate: number;
}

export const roundUpPrice = (n: number) => Math.ceil(n / SUGGEST_ROUND_TO - 1e-9) * SUGGEST_ROUND_TO;

export function suggestPrice(cost: number | undefined, basis: OverheadBasis | null, opts: SuggestOptions = {}): PriceSuggestion | null {
  if (cost === undefined || !Number.isFinite(cost) || cost <= 0) return null;
  if (!basis || !(basis.cogsPerMonth > 0)) return null;
  const marketingPerMonth = Math.max(0, opts.marketingPerMonth ?? AD_BUDGET);
  const profitShare = Math.min(SUGGEST_PROFIT_MAX, Math.max(0, opts.profitShare ?? SUGGEST_PROFIT_SHARE));

  const overheadRate = basis.opexPerMonth / basis.cogsPerMonth;
  const marketingRate = marketingPerMonth / basis.cogsPerMonth;
  const overhead = cost * overheadRate;
  const marketing = cost * marketingRate;
  const fullCost = cost + overhead + marketing;
  const suggested = roundUpPrice(fullCost / (1 - profitShare));
  return {
    cost, overhead, marketing, fullCost,
    breakEven: roundUpPrice(fullCost),
    profitShare,
    suggested,
    marginAtSuggested: (suggested - cost) / suggested,
    overheadRate, marketingRate,
  };
}

/** The basis from the database: the last twelve whole months of costs and sales. */
export async function fetchOverheadBasis(sb: SupabaseClient, now = new Date()): Promise<OverheadBasis | null> {
  const periods = windowPeriods(now);
  const from = periods[0];
  const to = periods[periods.length - 1];

  const { data: exp, error: expError } = await sb
    .from('operating_expenses')
    .select('period, category, amount, is_monthly_total')
    .gte('period', from)
    .lte('period', to);
  if (expError) throw new Error(expError.message);
  const expenses: ExpenseInput[] = (exp ?? []).map((e) => ({
    period: String(e.period),
    category: String(e.category),
    amount: Number(e.amount) || 0,
    isMonthlyTotal: !!e.is_monthly_total,
  }));

  // A day either side; each sale is placed in its month by Skopje time.
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  const since = new Date(Date.UTC(fy, fm - 1, 1) - 86_400_000).toISOString();
  const until = new Date(Date.UTC(ty, tm, 1) + 86_400_000).toISOString();
  const sales: SaleInput[] = [];
  for (let f = 0; ; f += 1000) {
    const { data, error } = await sb
      .from('sales_ledger')
      .select('occurred_at, qty, unit_price, unit_cost')
      .eq('reason', 'sale')
      .gte('occurred_at', since)
      .lt('occurred_at', until)
      .order('occurred_at')
      .range(f, f + 999);
    if (error) throw new Error(error.message);
    for (const r of data ?? []) {
      sales.push({
        period: localPeriod(new Date(r.occurred_at as string)),
        qty: Number(r.qty) || 0,
        unitPrice: Number(r.unit_price) || 0,
        unitCost: r.unit_cost === null || r.unit_cost === undefined ? null : Number(r.unit_cost),
      });
    }
    if ((data ?? []).length < 1000) break;
  }

  return overheadBasis(periods, expenses, sales);
}
