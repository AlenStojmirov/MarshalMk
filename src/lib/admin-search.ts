/**
 * Finding a product in the back office (Task 17.1).
 *
 * Measured 2026-11-09: 180 of 492 products are empty, every one of them sold
 * out. In a search they are noise. The shop floor looks for what is on the
 * shelf, and a sale can only take what is there. So a product list starts on
 * stock. The empty ones stay one click away, because a restock of a sold-out
 * model still begins by finding it.
 *
 * Pure: no database, no browser.
 */

import type { Product } from '@/types';
import { getProductDisplayName } from './product-display';

/** Something is on the shelf. `stock` is the sizes' total, and stock.ts keeps it so. */
export const onShelf = (p: Pick<Product, 'stock'>) => (Number(p.stock) || 0) > 0;

/** The product answers the search by its code, its id, or the name the shop reads. */
export function matchesSearch(
  p: Pick<Product, 'name' | 'id' | 'category' | 'brand'>,
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    p.name.toLowerCase().includes(q) ||
    p.id.toLowerCase().includes(q) ||
    getProductDisplayName(p.name, p.category, p.brand).toLowerCase().includes(q)
  );
}
