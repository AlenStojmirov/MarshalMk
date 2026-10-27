import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { roleOf } from '@/lib/roles';
import { fail, requireUser } from '@/lib/account-server';
import { confirmOrderToCustomer, notifyShopOfOrder, type OrderNotifyResult } from '@/lib/order-notify-server';
import type { NewOrderMail } from '@/lib/email/templates';

/**
 * POST /api/admin/order-email-test — "Прати пробна" on /admin/settings (Task 14.2).
 * Sends a made-up order, marked as a test, to the saved addresses, so the owner
 * sees what a new order looks like and that it arrives. The owner only.
 *
 * Each address that got the shop's e-mail also gets the customer's copy (14.5),
 * never the made-up customer's address: the owner sees both without an order.
 */
const SAMPLE: NewOrderMail = {
  test: true,
  orderNumber: 'ORD-PROBA',
  customer: {
    firstName: 'Петар', lastName: 'Петровски', email: 'kupuvac@primer.mk', phone: '070 123 456',
    address: 'ул. Пример 1', city: 'Скопје', notes: 'Да се јави пред доставата.', deliveryMethod: 'courier',
    loyalty: { couponCode: 'DOBREDOJDE', couponDiscount: 150, pointsUsed: 100 },
  },
  items: [
    { productName: 'Кошула - #BF020', size: 'L', quantity: 1, price: 1350 },
    { productName: 'Фармерки - #DY006', size: '32', quantity: 1, price: 1500 },
  ],
  subtotal: 2850,
  shipping: 170,
  total: 3020,
  member: true,
};

export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ('res' in auth) return auth.res;
  if (roleOf(auth.user) !== 'admin') return fail(403, 'Само за админ.');

  const shop = await notifyShopOfOrder(getSupabaseAdmin(), SAMPLE);
  const copies = await Promise.all(shop.sent.map(async (email) => ({ email, r: await confirmOrderToCustomer(SAMPLE, email) })));
  const r: OrderNotifyResult = {
    ...shop,
    failed: [
      ...shop.failed,
      ...copies.filter((c) => c.r.error).map((c) => `${c.email} (пораката до купувачот): ${c.r.error}`),
    ],
  };
  return NextResponse.json(r);
}
