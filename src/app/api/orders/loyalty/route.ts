import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { roleOf } from '@/lib/roles';
import { fail, requireUser } from '@/lib/account-server';
import { syncAllOrderLoyalty, syncOrderLoyalty } from '@/lib/order-loyalty-server';

/**
 * POST /api/orders/loyalty — bring an order's points and coupon in line with
 * how the order now stands (Task 13.8).
 *
 *   { orderId }   after a status or outcome change; the admin and the staff
 *   { all: true } every order placed with an account; the admin only
 *
 * The orders screen calls it after every change it makes. It is a sync, so a
 * repeat does nothing new.
 */

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ('res' in auth) return auth.res;
  const role = roleOf(auth.user);
  if (role !== 'admin' && role !== 'staff') return fail(403, 'Само за админ и магацин.');

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail(400, 'Неважечко барање.');
  }

  const sb = getSupabaseAdmin();
  try {
    if (body.all === true) {
      if (role !== 'admin') return fail(403, 'Само за админ.');
      const results = await syncAllOrderLoyalty(sb);
      return NextResponse.json({ results: results.filter((r) => r.done.length || r.problems.length), checked: results.length });
    }
    if (typeof body.orderId !== 'string' || !body.orderId) return fail(400, 'Нема нарачка.');
    return NextResponse.json(await syncOrderLoyalty(sb, body.orderId));
  } catch (e) {
    console.error(`[ORDER_LOYALTY_SYNC_FAILED] ${(e as Error).message}`);
    return fail(500, 'Поените не се усогласени. Пробај повторно.');
  }
}
