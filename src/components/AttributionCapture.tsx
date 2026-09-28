'use client';

import { useEffect } from 'react';
import { ATTRIBUTION_KEY, sourceFromUrl } from '@/lib/attribution';

/**
 * Remembers the link a visitor arrived by (Task 10.6): a page opened with
 * utm_source — the tracked link of a post — is kept in localStorage for the
 * attribution window, and the checkout sends it with the order. A later visit
 * from another tracked link replaces it (the last post is the one that brought
 * them back). Nothing else is stored, and nothing leaves the browser until an
 * order is placed.
 */
export default function AttributionCapture() {
  useEffect(() => {
    try {
      const s = sourceFromUrl(window.location.search, window.location.pathname);
      if (s) window.localStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(s));
    } catch {
      // Storage blocked (private mode): the order goes without it.
    }
  }, []);
  return null;
}
