import type { SupabaseClient } from '@supabase/supabase-js';
import { monthCosts, monthPace, type ExpenseLine, type Pace, type SaleLine } from './break-even';

/**
 * This month's pace from the ledger and the entered costs (Task 10.5).
 * Server only: it reads unit costs, so it takes the service-role client.
 * Days are counted in Skopje time — a sale at 00:30 on the 1st belongs to the
 * new month, whatever the server's clock says.
 */

const TZ = 'Europe/Skopje';
const localDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(d);
const DAY = 86_400_000;

export async function computePace(sb: SupabaseClient, now = new Date()): Promise<{ pace: Pace } | { error: string }> {
  const today = localDay(now);
  const period = today.slice(0, 7);

  // A year of sales: this month's pace, and the year's margin for units without a cost.
  const sales: SaleLine[] = [];
  const since = new Date(now.getTime() - 366 * DAY).toISOString();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from('sales_ledger')
      .select('occurred_at, qty, unit_price, unit_cost, reason')
      .eq('reason', 'sale')
      .gte('occurred_at', since)
      .order('occurred_at')
      .range(from, from + 999);
    if (error) return { error: error.message };
    for (const r of data ?? []) {
      sales.push({
        day: localDay(new Date(r.occurred_at as string)),
        qty: Number(r.qty) || 0,
        unitPrice: Number(r.unit_price) || 0,
        unitCost: r.unit_cost === null || r.unit_cost === undefined ? null : Number(r.unit_cost),
      });
    }
    if ((data ?? []).length < 1000) break;
  }

  let yearRevenue = 0;
  let yearGross = 0;
  let yearUnits = 0;
  for (const s of sales) {
    if (s.unitCost === null || !(s.unitPrice > 0) || s.day.startsWith(period)) continue;
    yearRevenue += s.unitPrice * s.qty;
    yearGross += (s.unitPrice - s.unitCost) * s.qty;
    yearUnits += s.qty;
  }

  const { data: expenses, error: expError } = await sb
    .from('operating_expenses')
    .select('category, amount, is_monthly_total')
    .eq('period', period);
  if (expError) return { error: expError.message };
  const lines: ExpenseLine[] = (expenses ?? []).map((e) => ({
    category: String(e.category),
    amount: Number(e.amount) || 0,
    isMonthlyTotal: !!e.is_monthly_total,
  }));

  const pace = monthPace({
    period,
    today,
    sales,
    costs: monthCosts(lines),
    yearMargin: yearRevenue > 0 ? yearGross / yearRevenue : 0,
    yearGrossPerUnit: yearUnits > 0 ? yearGross / yearUnits : 0,
  });

  return { pace };
}
