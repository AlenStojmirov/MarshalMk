import { NextRequest, NextResponse } from 'next/server';
import { isBackOffice, roleOf } from '@/lib/roles';
import { fail, readCustomer, requireUser } from '@/lib/account-server';
import { apiSay } from '@/lib/i18n/messages';
import type { CheckoutDetails } from '@/lib/account';

/**
 * GET /api/account/checkout — what the checkout fills in for a signed-in
 * customer (Task 14.9): the account's e-mail and everything else from the
 * profile, the address included (migration 021).
 *
 * Never from an earlier order: a customer may send one to someone else, under
 * another name, as a gift, and the next checkout would then offer that
 * person's address as their own. Every field stays the customer's to change,
 * and a change at checkout is for that order only.
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
    const details: CheckoutDetails = {
      firstName: row?.first_name ?? '',
      lastName: row?.last_name ?? '',
      email: user.email ?? '',
      phone: row?.phone ?? '',
      address: row?.address ?? '',
      city: row?.city ?? '',
    };
    return NextResponse.json(details);
  } catch (e) {
    console.error(`[ACCOUNT_CHECKOUT_FAILED] user=${user.id} ${(e as Error).message}`);
    return fail(500, apiSay(req)('account.checkoutRead'));
  }
}
