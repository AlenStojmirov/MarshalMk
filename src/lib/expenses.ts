'use client';

/**
 * Operating expenses — the running costs of the shop, by month.
 *
 * Without these there is no net profit anywhere in the system, only gross. The
 * shop runs at roughly 65.000 den. a month and that figure lived nowhere.
 *
 * A month is recorded one of two ways, never both:
 *   monthly total  — "this month cost X", for when the detail is not to hand
 *   line items     — rent, salary, marketing… once the detail is available
 *
 * `expensesForPeriod` prefers the monthly total when one exists, so a month can
 * be filled in roughly now and broken down later without the two ever being
 * added together.
 */

import { supabase } from './supabase';

const TABLE = 'operating_expenses';

export const EXPENSE_CATEGORIES = [
  'rent',
  'salary',
  'utilities',
  'marketing',
  'delivery',
  'packaging',
  'fees',
  'tax',
  'other',
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export interface ExpenseRow {
  id: string;
  period: string;
  occurred_on: string | null;
  category: ExpenseCategory;
  amount: number | string;
  description: string | null;
  is_monthly_total: boolean;
  created_at: string;
}

export interface Expense {
  id: string;
  /** 'YYYY-MM' */
  period: string;
  occurredOn?: string;
  category: ExpenseCategory;
  amount: number;
  description?: string;
  isMonthlyTotal: boolean;
  createdAt: Date;
}

export function rowToExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    period: row.period,
    occurredOn: row.occurred_on ?? undefined,
    category: row.category,
    amount: Number(row.amount) || 0,
    description: row.description ?? undefined,
    isMonthlyTotal: row.is_monthly_total,
    createdAt: new Date(row.created_at),
  };
}

export async function getExpenses(): Promise<Expense[]> {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .order('period', { ascending: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data as ExpenseRow[] | null) ?? []).map(rowToExpense);
}

export interface NewExpense {
  period: string;
  category: ExpenseCategory;
  amount: number;
  description?: string;
  occurredOn?: string;
  isMonthlyTotal?: boolean;
}

export async function addExpense(input: NewExpense): Promise<void> {
  const { error } = await supabase.from(TABLE).insert({
    period: input.period,
    category: input.category,
    amount: Math.round(input.amount * 100) / 100,
    description: input.description?.trim() || null,
    occurred_on: input.occurredOn ?? null,
    is_monthly_total: input.isMonthlyTotal ?? false,
  });
  if (error) throw error;
}

export async function updateExpense(id: string, patch: Partial<NewExpense>): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.period !== undefined) row.period = patch.period;
  if (patch.category !== undefined) row.category = patch.category;
  if (patch.amount !== undefined) row.amount = Math.round(patch.amount * 100) / 100;
  if (patch.description !== undefined) row.description = patch.description?.trim() || null;
  if (patch.occurredOn !== undefined) row.occurred_on = patch.occurredOn ?? null;
  if (patch.isMonthlyTotal !== undefined) row.is_monthly_total = patch.isMonthlyTotal;

  const { error } = await supabase.from(TABLE).update(row).eq('id', id);
  if (error) throw error;
}

export async function deleteExpense(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

export interface PeriodExpenses {
  period: string;
  total: number;
  /** True when the figure comes from a single monthly-total row. */
  fromMonthlyTotal: boolean;
  /** Set when a month has both shapes — the totals would double up. */
  conflict: boolean;
  items: Expense[];
}

/**
 * The expense figure for one month.
 *
 * A monthly total wins over line items rather than adding to them, so a month
 * entered as a lump sum and later broken down cannot count twice. When both are
 * present that is reported, not silently resolved — it means one of them is
 * meant to be deleted.
 */
export function expensesForPeriod(all: Expense[], period: string): PeriodExpenses {
  const items = all.filter((e) => e.period === period);
  const totals = items.filter((e) => e.isMonthlyTotal);
  const lines = items.filter((e) => !e.isMonthlyTotal);

  if (totals.length > 0) {
    return {
      period,
      total: totals.reduce((a, e) => a + e.amount, 0),
      fromMonthlyTotal: true,
      conflict: lines.length > 0,
      items,
    };
  }

  return {
    period,
    total: lines.reduce((a, e) => a + e.amount, 0),
    fromMonthlyTotal: false,
    conflict: false,
    items,
  };
}

/** 'YYYY-MM' for a date. */
export function periodOf(d: Date): string {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

/** Every month from `from` to now, newest first. */
export function periodsSince(from: string): string[] {
  const [fy, fm] = from.split('-').map(Number);
  const out: string[] = [];
  const now = new Date();
  let y = now.getFullYear();
  let m = now.getMonth() + 1;
  while (y > fy || (y === fy && m >= fm)) {
    out.push(y + '-' + String(m).padStart(2, '0'));
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
  }
  return out;
}

const MONTHS_MK = [
  'јануари', 'февруари', 'март', 'април', 'мај', 'јуни',
  'јули', 'август', 'септември', 'октомври', 'ноември', 'декември',
];

export function periodLabel(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return (MONTHS_MK[m - 1] ?? period) + ' ' + y;
}

export const CATEGORY_LABELS_MK: Record<ExpenseCategory, string> = {
  rent: 'Кирија',
  salary: 'Плати',
  utilities: 'Режии',
  marketing: 'Маркетинг',
  delivery: 'Достава',
  packaging: 'Пакување',
  fees: 'Банкарски',
  tax: 'Даноци',
  other: 'Друго',
};
