import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@/lib/supabase-admin';
import { roleOf } from '@/lib/roles';

/**
 * Online orders per calendar post (Task 10.7). Admin and marketing.
 *
 * An order placed after a post's tracked link carries the post in
 * `customer.source.utmCampaign` (D-025). The marketing role may not read
 * orders — they hold names, phones and addresses (D-021) — so this counts them
 * with the service-role key and hands back numbers only: orders and pieces per
 * campaign, and for the admin the value as well.
 *
 *   GET ?since=YYYY-MM-DD  → { byCampaign: { 'p-1a2b3c4d': { orders, units, value? } } }
 *
 * Cancelled orders do not count, and neither do ones refused, returned or not
 * collected (D-014): a post that brought a parcel nobody paid for did not sell.
 */

function fail(status: number, error: string) {
  return NextResponse.json({ error }, { status });
}

export async function GET(req: NextRequest) {
  const token = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return fail(401, 'Не си најавен.');
  const sb = getSupabaseAdmin();
  const { data: auth, error: authError } = await sb.auth.getUser(token);
  if (authError || !auth.user) return fail(401, 'Најавата е истечена. Најави се повторно.');
  const role = roleOf(auth.user);
  if (role !== 'admin' && role !== 'marketing') return fail(403, 'Нема пристап.');

  const since = req.nextUrl.searchParams.get('since') ?? '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) return fail(400, 'since=YYYY-MM-DD');

  const byCampaign: Record<string, { orders: number; units: number; value?: number }> = {};
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from('orders')
      .select('customer, items, subtotal, status, outcome')
      .gte('created_at', since)
      .range(from, from + 999);
    if (error) return fail(500, error.message);
    for (const o of data ?? []) {
      if (o.status === 'cancelled' || (o.outcome && o.outcome !== 'delivered')) continue;
      const campaign = (o.customer as { source?: { utmCampaign?: string } } | null)?.source?.utmCampaign;
      if (!campaign) continue;
      const c = (byCampaign[campaign] ??= { orders: 0, units: 0, ...(role === 'admin' ? { value: 0 } : {}) });
      c.orders += 1;
      c.units += ((o.items as Array<{ quantity?: number }>) ?? []).reduce((a, i) => a + (Number(i.quantity) || 0), 0);
      if (role === 'admin') c.value = (c.value ?? 0) + (Number(o.subtotal) || 0);
    }
    if ((data ?? []).length < 1000) break;
  }
  return NextResponse.json({ byCampaign });
}
