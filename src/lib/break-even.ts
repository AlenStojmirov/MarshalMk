/**
 * How far this month is from zero, and what marketing should do about it
 * (Task 10.5, EPIC 10).
 *
 * The owner (2026-09-27): zero is **65.000 den. of gross profit a month** — the
 * running costs — and everything above it is profit; marketing should balance
 * itself against how sales are going. With the advertising budget the month
 * has to earn that too, so the target is the costs plus what was spent on ads.
 *
 * Gross profit, not revenue: a sale at −50% moves revenue and barely moves the
 * month. It comes from the ledger (price and cost per unit sold), which only
 * the server reads for the marketing role (D-021) — see /api/marketing/pace.
 *
 * Pure: no database, no browser.
 */

import { OPEX_FALLBACK } from './open-to-buy';

/** The owner's monthly advertising budget (2026-09-27). */
export const AD_BUDGET = 3_000;
/**
 * The budget applies from this month on (owner, 2026-09-29). Until then the
 * "Маркетинг" lines hold the ads *and* the marketing employee's pay together,
 * so they are neither an ad spend to hold against 3.000 nor something the
 * marketing role should see (D-026). From November the pay goes under "Плати".
 */
export const AD_BUDGET_FROM = '2026-11';
export const adBudgetApplies = (period: string) => period >= AD_BUDGET_FROM;
/** Within this share of the expected pace a month is "on track". */
export const PACE_TOLERANCE = 0.05;

export type PaceStatus = 'ahead' | 'on' | 'behind';

export interface ExpenseLine {
  category: string;
  amount: number;
  isMonthlyTotal: boolean;
}

/**
 * A month's costs count as entered only when they look like a whole month: a
 * monthly total, or line items that hold at least the rent and the salaries.
 * Measured 2026-09-28: every month since November 2025 holds only the rent
 * (6.000 den.) — read as the month's costs, zero would sit at 6.000 instead of
 * about 65.000, and every screen would call a loss-making month a profit.
 */
export const REQUIRED_LINES = ['rent', 'salary'] as const;

export interface MonthCosts {
  /** What the month must earn in gross profit: costs plus advertising. */
  target: number;
  /** Costs without advertising. OPEX_FALLBACK when none were entered. */
  base: number;
  baseKnown: boolean;
  adSpend: number;
  /** A monthly total was entered: it already holds everything, ads included. */
  fromMonthlyTotal: boolean;
  /** Entered, but not a whole month yet: the fallback stands in (REQUIRED_LINES). */
  incomplete: boolean;
  /** What was entered without advertising, whole or not. */
  entered: number;
}

/**
 * The month's costs, the way expensesForPeriod reads them (a monthly total wins
 * over line items), with one difference: advertising entered as a line does
 * not stand in for the month's costs. A month holding only "Маркетинг 3.000"
 * would otherwise have a target of 3.000.
 */
export function monthCosts(lines: ExpenseLine[]): MonthCosts {
  const totals = lines.filter((l) => l.isMonthlyTotal);
  const items = lines.filter((l) => !l.isMonthlyTotal);
  const adSpend = items.filter((l) => l.category === 'marketing').reduce((a, l) => a + l.amount, 0);
  if (totals.length) {
    const total = totals.reduce((a, l) => a + l.amount, 0);
    return { target: total, base: total, baseKnown: true, adSpend, fromMonthlyTotal: true, incomplete: false, entered: total };
  }
  const costLines = items.filter((l) => l.category !== 'marketing' && l.amount > 0);
  const entered = costLines.reduce((a, l) => a + l.amount, 0);
  const whole = REQUIRED_LINES.every((c) => costLines.some((l) => l.category === c));
  const base = whole ? entered : OPEX_FALLBACK;
  return {
    target: base + adSpend, base, baseKnown: whole, adSpend, fromMonthlyTotal: false,
    incomplete: entered > 0 && !whole, entered,
  };
}

/**
 * The month's costs for open-to-buy (D-023): the entered figure when the month
 * is whole, otherwise undefined — which open-to-buy reads as OPEX_FALLBACK.
 * /admin/capital, /admin/reorder's budget and the dashboard use this, so a
 * half-entered month cannot move zero on one screen and not on another.
 */
export function knownOpex(lines: ExpenseLine[]): number | undefined {
  const c = monthCosts(lines);
  return c.baseKnown ? c.target : undefined;
}

export interface SaleLine {
  /** Local day, 'YYYY-MM-DD'. */
  day: string;
  qty: number;
  unitPrice: number;
  /** Null when no cost was recorded for the product. */
  unitCost: number | null;
}

export interface Pace {
  period: string;
  day: number;
  daysInMonth: number;
  daysLeft: number;
  costs: MonthCosts;
  revenue: number;
  gross: number;
  /** Units sold at a price this month. */
  units: number;
  /** Units whose gross was estimated from the year's margin (no cost recorded). */
  estimatedUnits: number;
  /** gross ÷ target. */
  progress: number;
  /** Where the month should be by today, as a share of the target. */
  expected: number;
  /** progress ÷ expected: 1 is exactly on pace. */
  pace: number;
  status: PaceStatus;
  /** Gross at today's pace by the end of the month. */
  projected: number;
  /** target − gross, never below zero. */
  gap: number;
  /** Average gross per unit this month, or over the year when the month is thin. */
  grossPerUnit: number;
  /** Units still needed to reach zero, at that average. */
  unitsToGo: number;
  /** Units an ad budget has to bring in to pay for itself. */
  adBreakEvenUnits: number;
  /** From AD_BUDGET_FROM: the "Маркетинг" lines are ads only, and held against AD_BUDGET. */
  adBudgetActive: boolean;
  advice: string;
}

export interface PaceInput {
  period: string;
  today: string;
  sales: SaleLine[];
  costs: MonthCosts;
  /** Gross margin over the last twelve months, for units without a cost. */
  yearMargin: number;
  /** Gross per unit over the last twelve months, for a month too young to average. */
  yearGrossPerUnit: number;
}

/** Below this many units a month's own average is noise; the year's stands in. */
const MIN_UNITS_FOR_AVERAGE = 10;

export const ADVICE: Record<PaceStatus, string> = {
  behind:
    'Месецот заостанува. Повеќе сторис (секој ден), уште еден reel неделава, и рекламата оди на објавата што оваа недела имала најмногу пораки.',
  on: 'Месецот оди по план. Продолжи по календарот; рекламата само на објава што веќе сама добро оди.',
  ahead:
    'Месецот е пред планот. Не трошиш на реклами овој месец: буџетот останува за месец што ќе заостанува. Продолжи по календарот.',
};

export function monthPace(input: PaceInput): Pace {
  const { period, today, costs, yearMargin, yearGrossPerUnit } = input;
  const [y, m] = period.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const day = today.startsWith(period) ? Number(today.slice(8, 10)) : today > period ? daysInMonth : 0;

  let revenue = 0;
  let gross = 0;
  let units = 0;
  let estimatedUnits = 0;
  for (const s of input.sales) {
    if (!s.day.startsWith(period) || !(s.unitPrice > 0)) continue;
    const qty = Math.max(0, s.qty || 0);
    revenue += s.unitPrice * qty;
    units += qty;
    if (s.unitCost === null) {
      gross += s.unitPrice * qty * yearMargin;
      estimatedUnits += qty;
    } else gross += (s.unitPrice - s.unitCost) * qty;
  }

  const target = costs.target;
  const progress = target > 0 ? gross / target : 0;
  const expected = daysInMonth > 0 ? day / daysInMonth : 0;
  const pace = expected > 0 ? progress / expected : 0;
  const status: PaceStatus = pace >= 1 + PACE_TOLERANCE ? 'ahead' : pace >= 1 - PACE_TOLERANCE ? 'on' : 'behind';
  const grossPerUnit = units >= MIN_UNITS_FOR_AVERAGE ? gross / units : yearGrossPerUnit;
  const gap = Math.max(0, target - gross);

  return {
    period, day, daysInMonth, daysLeft: Math.max(0, daysInMonth - day),
    costs, revenue, gross, units, estimatedUnits,
    progress, expected, pace, status,
    projected: day > 0 ? (gross / day) * daysInMonth : 0,
    gap,
    grossPerUnit,
    unitsToGo: grossPerUnit > 0 ? Math.ceil(gap / grossPerUnit) : 0,
    adBreakEvenUnits: grossPerUnit > 0 ? Math.ceil(AD_BUDGET / grossPerUnit) : 0,
    adBudgetActive: adBudgetApplies(period),
    advice: ADVICE[status],
  };
}

/** What the marketing role is shown: how the month goes, never what it earns (D-021). */
export interface PaceForMarketing {
  period: string;
  day: number;
  daysInMonth: number;
  progress: number;
  expected: number;
  status: PaceStatus;
  advice: string;
  /** Null before AD_BUDGET_FROM: those lines include a salary (D-026). */
  adBudget: number | null;
  adSpend: number | null;
}

export function forMarketing(p: Pace): PaceForMarketing {
  return {
    period: p.period, day: p.day, daysInMonth: p.daysInMonth,
    progress: p.progress, expected: p.expected, status: p.status, advice: p.advice,
    adBudget: p.adBudgetActive ? AD_BUDGET : null,
    adSpend: p.adBudgetActive ? p.costs.adSpend : null,
  };
}
