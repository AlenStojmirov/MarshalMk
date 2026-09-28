'use client';

/**
 * Online orders per calendar post, from /api/marketing/orders (Task 10.7).
 * The route counts them with the service-role key, because the marketing role
 * may not read orders (D-021); this is only the browser's side of the call.
 */

import { supabase } from './supabase';

export type CampaignOrders = Record<string, { orders: number; units: number; value?: number }>;

/** Orders since `since` ('YYYY-MM-DD'), by campaign. Empty on any failure: counts are a bonus, not a blocker. */
export async function fetchCampaignOrders(since: string): Promise<CampaignOrders> {
  try {
    const { data } = await supabase.auth.getSession();
    const res = await fetch(`/api/marketing/orders?since=${since}`, {
      headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` },
    });
    if (!res.ok) return {};
    const json = (await res.json()) as { byCampaign?: CampaignOrders };
    return json.byCampaign ?? {};
  } catch {
    return {};
  }
}
