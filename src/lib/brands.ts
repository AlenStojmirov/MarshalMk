/**
 * The supplier brand, for the back office only — the storefront never shows it
 * (product-display.ts). Every product has one, and it is even the prefix of its
 * id, which stands in for any product that would come without.
 */
export const brandOf = (p: { brand?: string; id: string }): string =>
  (p.brand && p.brand.trim()) || p.id.split('-')[0];

/** The brands among these products, A–Z, for a filter. */
export function brandsOf(products: ReadonlyArray<{ brand?: string; id: string }>): string[] {
  return [...new Set(products.map(brandOf))].sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: 'base' }));
}
