/**
 * The listing filters a product's attributes give (Task 9.9): colour, material
 * and cut, on every page that lists products (groups, new, sale).
 *
 * Colour filters by family, not by shade: staff pick "тегет" or "петрол" for
 * the title, a customer ticks "Сина" and never has to choose between them
 * (COLOR_FAMILIES). Material is what a garment is mostly made of — the fibre
 * with half or more, or the largest share — so "Памук" does not list a jumper
 * that is 60% polyester. A product without the attribute is simply not in that
 * filter's results; it still lists when the filter is off.
 *
 * Pure, and shared: the server filters and counts with it, the sidebar labels
 * with it.
 */

import type { FacetParam, FiberShare, Product } from '@/types';
import { COLOR_FAMILIES, COLORS, FIBERS, FITS, sortComposition } from './attributes';

export const FACETS: readonly FacetParam[] = ['color', 'material', 'fit'];

/** The fibres a garment is mostly made of: any with half or more, else the largest. */
export function mainFibers(composition: readonly FiberShare[]): string[] {
  if (composition.length === 0) return [];
  const half = composition.filter((f) => f.pct >= 50).map((f) => f.fiber);
  return half.length ? half : [sortComposition([...composition])[0].fiber];
}

/** The values one product has for a filter: at most one colour and one cut, one or two materials. */
export function facetValues(p: Product, facet: FacetParam): string[] {
  const a = p.attributes;
  if (!a) return [];
  if (facet === 'color') {
    const family = a.color ? COLORS[a.color]?.family : undefined;
    return family ? [family] : [];
  }
  if (facet === 'material') return mainFibers(a.composition).filter((f) => FIBERS[f]);
  return a.fit && FITS[a.fit] ? [a.fit] : [];
}

/** The order a filter lists its values in: the vocabulary's, so colours read light to dark as defined. */
const ORDER: Record<FacetParam, string[]> = {
  color: Object.keys(COLOR_FAMILIES),
  material: Object.keys(FIBERS),
  fit: Object.keys(FITS),
};

export function sortFacet<T extends { value: string; count: number }>(facet: FacetParam, values: T[]): T[] {
  // Materials by how many products have them (cotton first); colours and cuts in their own order.
  if (facet === 'material') return [...values].sort((a, b) => b.count - a.count);
  const rank = (v: string) => {
    const i = ORDER[facet].indexOf(v);
    return i < 0 ? Infinity : i;
  };
  return [...values].sort((a, b) => rank(a.value) - rank(b.value));
}

const cap = (s: string) => (s ? s[0].toLocaleUpperCase('mk') + s.slice(1) : s);

/** "Сина", "Памук", "Слим" — or "Blue", "Cotton", "Slim fit". */
export function facetLabel(facet: FacetParam, value: string, lang: 'mk' | 'en'): string {
  if (facet === 'color') return COLOR_FAMILIES[value]?.[lang] ?? value;
  if (facet === 'material') return cap(FIBERS[value]?.[lang] ?? value);
  return cap(FITS[value]?.[lang] ?? value);
}

/** The swatch for a colour family. */
export const facetSwatch = (facet: FacetParam, value: string): string | undefined =>
  facet === 'color' ? COLOR_FAMILIES[value]?.hex : undefined;
