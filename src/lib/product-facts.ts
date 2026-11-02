/**
 * What the product page says about a garment (Task 9.9): the attributes first,
 * and the old free-text description for what they do not hold yet.
 *
 * Until Task 9.10 the description stays in `products` and is mostly a fibre
 * list ("100% - Памук"), sometimes a leg length or a cut. Shown as it is, it
 * repeated the composition the details already list, so the page shows only
 * what the description says beyond them — read with the same parser that
 * filled the attributes from it (9.3). Where the attributes lack something the
 * description has, the description's value stands in: 14 products had no
 * composition on 2026-11-02.
 */

import type { FiberShare, Product } from '@/types';
import { parseDescription } from './parse-description';

export interface ProductFacts {
  composition: FiberShare[];
  fit?: string;
  details: Record<string, string | number | boolean>;
  /** The description's own words, without what the lines above already say. Empty for most products. */
  rest: string;
}

export function productFacts(p: Product): ProductFacts {
  const a = p.attributes;
  const description = (p.description ?? '').trim();
  const parsed = parseDescription(description);
  const own = a?.composition ?? [];

  // A fibre list that does not add up is left out by the parser; with nothing
  // better to show, the description stays whole rather than losing it.
  const rest = !own.length && parsed.compositionErrors.length ? description : parsed.unparsed.join('\n');

  return {
    composition: own.length ? own : parsed.composition,
    fit: a?.fit ?? parsed.fit,
    details: { ...parsed.details, ...(a?.details ?? {}) },
    rest,
  };
}
