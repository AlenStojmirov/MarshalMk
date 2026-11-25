'use client';

import { useEffect, useState } from 'react';
import { parseCampaign, type Campaign } from '@/lib/campaign';

/**
 * The campaign on now, for the till (D-051): `/api/campaign`, read once. Null
 * while it loads, when none holds, or when the read fails — the till then
 * starts at the product's own price, as before.
 */
export function useLiveCampaign(): Campaign | null {
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  useEffect(() => {
    let alive = true;
    fetch('/api/campaign', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        if (alive) setCampaign(parseCampaign(body?.campaign));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  return campaign;
}
