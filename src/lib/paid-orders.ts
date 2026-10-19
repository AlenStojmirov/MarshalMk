/**
 * Has this account an order that was delivered and paid? Server only.
 *
 * Read the way the order sync reads it (13.8): outcome delivered, or delivered
 * from before outcomes existed. Bonuses wait for the first such order (D-032),
 * so the sign-up bonuses (13.6) and the birthday bonus (13.11) both ask.
 */

import { getSupabaseAdmin } from './supabase-admin';

export async function hasPaidOrder(userId: string): Promise<boolean> {
  const { data } = await getSupabaseAdmin().from('orders').select('id, status, outcome')
    .eq('customer->>userId', userId).or('outcome.eq.delivered,and(outcome.is.null,status.eq.delivered)').limit(1);
  return (data ?? []).length > 0;
}
