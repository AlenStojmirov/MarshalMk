import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { fail, requireUser } from '@/lib/account-server';
import { apiSay } from '@/lib/i18n/messages';
import type { CustomerOrder } from '@/lib/account';

/**
 * GET /api/account/orders — the signed-in customer's own orders (Task 13.9).
 *
 * Customers have no read on `orders` (it holds everyone's addresses), so the
 * server reads the ones placed with this account and hands back only what the
 * customer needs to see: number, date, status, what was bought and paid, and
 * the coupon and points on it. Never another customer's order, never an
 * internal note — and not `shipping`, which above the threshold holds the
 * courier cost absorbed into the prices (D-006), not what the customer paid.
 */

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ('res' in auth) return auth.res;
  const { data, error } = await getSupabaseAdmin().from('orders')
    .select('order_number, created_at, status, outcome, customer, items, total')
    .eq('customer->>userId', auth.user.id)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) {
    console.error(`[ACCOUNT_ORDERS_FAILED] user=${auth.user.id} ${error.message}`);
    return fail(500, apiSay(req)('account.ordersRead'));
  }
  const orders: CustomerOrder[] = (data ?? []).map((o) => ({
    orderNumber: o.order_number,
    createdAt: o.created_at,
    status: o.status,
    outcome: o.outcome ?? null,
    deliveryMethod: o.customer?.deliveryMethod === 'pickup' ? 'pickup' : 'courier',
    items: (o.items ?? []).map((i: Record<string, unknown>) => ({
      productId: String(i.productId ?? ''),
      productName: String(i.productName ?? ''),
      size: typeof i.size === 'string' ? i.size : null,
      quantity: Number(i.quantity) || 1,
      price: Number(i.price) || 0,
    })),
    total: Number(o.total) || 0,
    loyalty: o.customer?.loyalty ?? null,
  }));
  return NextResponse.json({ orders });
}
