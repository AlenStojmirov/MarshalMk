'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { fetchTopUps, type TopUp } from '@/lib/exchange-db';

/**
 * Exchange top-ups still standing (Task 18.1, D-047): money taken in on the
 * day of an exchange, without a piece of its own. The sales screens add them
 * to that day; until 025 runs the list is empty. A failed read is logged and
 * leaves the list empty: the sales themselves still show.
 */
export function useTopUps(enabled = true): TopUp[] {
  const [list, setList] = useState<TopUp[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    fetchTopUps(supabase).then(
      (l) => { if (live) setList(l); },
      (err) => console.warn('[TOP_UPS_READ_FAILED]', err),
    );
    return () => { live = false; };
  }, [enabled]);
  return list;
}
