import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { CUSTOMERS, fail, requireUser } from '@/lib/account-server';

/**
 * POST /api/account/tour — the customer has seen the dashboard tour (13.13).
 *
 * Kept on the account rather than in the browser, so the tour does not start
 * again on the customer's other phone. Only the first date is kept.
 */
export async function POST(req: NextRequest) {
  const auth = await requireUser(req);
  if ('res' in auth) return auth.res;
  const { error } = await getSupabaseAdmin().from(CUSTOMERS)
    .update({ tour_seen_at: new Date().toISOString() })
    .eq('user_id', auth.user.id).is('tour_seen_at', null);
  if (error) {
    console.error(`[ACCOUNT_TOUR_FAILED] user=${auth.user.id} ${error.message}`);
    return fail(500, 'Не е запишано.');
  }
  return NextResponse.json({ ok: true });
}
