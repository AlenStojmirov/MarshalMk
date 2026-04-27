import { Product } from '@/types';

/**
 * Returns the price to charge for a product, honoring an active sale.
 */
export function getEffectivePrice(product: Product): number {
  if (product.sale?.isActive && typeof product.sale.salePrice === 'number') {
    return product.sale.salePrice;
  }
  return product.price;
}

/**
 * True when a product has an active sale and the sale price is lower than the regular price.
 */
export function isOnSale(product: Product): boolean {
  return (
    !!product.sale?.isActive &&
    typeof product.sale.salePrice === 'number' &&
    product.sale.salePrice < product.price
  );
}

/**
 * Percentage discount, rounded to nearest integer. Falls back to computed value
 * if the stored percentage is missing.
 */
export function getPercentOff(product: Product): number {
  if (!isOnSale(product)) return 0;
  const stored = product.sale?.percentageOff;
  if (typeof stored === 'number' && stored > 0) return Math.round(stored);
  return Math.round(((product.price - product.sale!.salePrice) / product.price) * 100);
}
