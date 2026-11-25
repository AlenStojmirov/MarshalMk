'use client';

import { useEffect, useState } from 'react';
import { campaignPhase, type CampaignDates, type CampaignPhase } from '@/lib/campaign';

/**
 * The campaign's phase by the visitor's clock, and the time for a countdown
 * (D-051). The first render keeps the phase the server drew, and no time at
 * all, so the page hydrates as it was sent; the clock starts after that.
 * A page cached before the start turns itself over at the start.
 */
export function useCampaignClock(c: CampaignDates | null, initialPhase: CampaignPhase, tickMs = 1000): { now: number | null; phase: CampaignPhase } {
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    if (!c) return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const id = setInterval(tick, tickMs);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [c, tickMs]);

  const phase = c && now !== null ? campaignPhase(c, now) : initialPhase;
  return { now, phase };
}
