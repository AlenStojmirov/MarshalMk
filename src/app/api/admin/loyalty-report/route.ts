import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { roleOf } from '@/lib/roles';
import { fail, requireUser } from '@/lib/account-server';
import { ReportInput, buildReport } from '@/lib/loyalty-report';
import type { PointsRow } from '@/lib/points';

/**
 * GET /api/admin/loyalty-report — the loyalty programme in numbers (Task 13.12).
 * The owner only: it reads every account's points, coupons, spins and orders,
 * and the sign-up source kept on the accounts, which only the service role sees.
 */

/** Every row of a table, a thousand at a time. `accountOrders`: only orders placed with an account. */
async function all<T>(sb: SupabaseClient, table: string, cols: string, accountOrders = false): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from(table).select(cols);
    if (accountOrders) q = q.not('customer->>userId', 'is', null);
    const { data, error } = await q.range(from, from + 999);
    if (error) {
      // A table from a migration not run yet (the wheel): nothing to count.
      if (/does not exist|schema cache/i.test(error.message)) return [];
      throw new Error(`${table}: ${error.message}`);
    }
    out.push(...((data ?? []) as T[]));
    if ((data ?? []).length < 1000) break;
  }
  return out;
}

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ('res' in auth) return auth.res;
  if (roleOf(auth.user) !== 'admin') return fail(403, 'Само за админ.');

  const sb = getSupabaseAdmin();
  try {
    const [points, coupons, uses, spins, orderRows, customers] = await Promise.all([
      all<PointsRow>(sb, 'points_ledger', '*'),
      all<ReportInput['coupons'][number]>(sb, 'coupons', 'id, source, created_at'),
      all<ReportInput['uses'][number]>(sb, 'coupon_redemptions', 'coupon_id, discount, shipping_waived, created_at, released_at'),
      all<ReportInput['spins'][number]>(sb, 'wheel_spins', 'prize_label, prize_kind, prize_value, coupon_id, created_at, user_id'),
      all<{ id: string; created_at: string; status: ReportInput['orders'][number]['status']; outcome: ReportInput['orders'][number]['outcome']; total: number; customer: { userId?: string; loyalty?: ReportInput['orders'][number]['loyalty'] } }>(
        sb, 'orders', 'id, created_at, status, outcome, total, customer', true,
      ),
      all<ReportInput['customers'][number]>(sb, 'customers', 'user_id, created_at'),
    ]);
    const orders = orderRows.map((o) => ({
      id: o.id, user_id: o.customer?.userId ?? '', created_at: o.created_at, status: o.status, outcome: o.outcome ?? null,
      total: Number(o.total) || 0, loyalty: o.customer?.loyalty ?? null,
    }));

    const ledger: ReportInput['ledger'] = [];
    const ids = orders.map((o) => o.id);
    for (let k = 0; k < ids.length; k += 200) {
      const { data, error } = await sb.from('sales_ledger').select('order_id, qty, unit_price, unit_cost')
        .in('order_id', ids.slice(k, k + 200)).eq('reason', 'sale');
      if (error) throw new Error(`sales_ledger: ${error.message}`);
      ledger.push(...((data ?? []) as ReportInput['ledger']));
    }

    const fromWheel = new Set<string>();
    for (let page = 1; ; page++) {
      const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) throw new Error(`users: ${error.message}`);
      for (const u of data.users) if (u.user_metadata?.signup_source === 'trkalo') fromWheel.add(u.id);
      if (data.users.length < 1000) break;
    }

    return NextResponse.json(buildReport({ now: new Date(), points, coupons, uses, spins, orders, ledger, customers, fromWheel }));
  } catch (e) {
    console.error(`[LOYALTY_REPORT_FAILED] ${(e as Error).message}`);
    return fail(500, 'Извештајот не може да се направи во моментов.');
  }
}
