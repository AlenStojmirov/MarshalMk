import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { isBackOffice, roleOf } from '@/lib/roles';
import { fail, readCustomer, requireUser } from '@/lib/account-server';
import type { CheckoutDetails } from '@/lib/account';

/**
 * GET /api/account/checkout — what the checkout fills in for a signed-in
 * customer (Task 14.9): the name and phone from the profile, the account's
 * e-mail, and the address of their last order with delivery, since the profile
 * holds no address. Read with the service role: customers have no read on
 * `orders`, and only this account's own orders are looked at.
 *
 * A back-office account is never a customer (D-033), so nothing is filled.
 */

const NOTHING: CheckoutDetails = { firstName: '', lastName: '', email: '', phone: '', address: '', city: '' };

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if ('res' in auth) return auth.res;
  const { user } = auth;
  if (isBackOffice(roleOf(user))) return NextResponse.json(NOTHING);

  try {
    const row = await readCustomer(user.id);
    const { data, error } = await getSupabaseAdmin().from('orders')
      .select('customer')
      .eq('customer->>userId', user.id)
      .order('created_at', { ascending: false })
      .limit(10);
    if (error) throw new Error(error.message);
    // Pickup orders keep the address empty, so this is the last one delivered to.
    const last = (data ?? []).map((o) => o.customer as { address?: string; city?: string } | null).find((c) => c?.address && c?.city);

    const details: CheckoutDetails = {
      firstName: row?.first_name ?? '',
      lastName: row?.last_name ?? '',
      email: user.email ?? '',
      phone: row?.phone ?? '',
      address: last?.address ?? '',
      city: last?.city ?? '',
    };
    return NextResponse.json(details);
  } catch (e) {
    console.error(`[ACCOUNT_CHECKOUT_FAILED] user=${user.id} ${(e as Error).message}`);
    return fail(500, 'Податоците од профилот не можат да се прочитаат во моментов.');
  }
}
