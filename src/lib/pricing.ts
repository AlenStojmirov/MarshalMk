import type { Product, SaleCampaign } from '@/types';

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
 * The price struck through next to a reduced one. During a campaign that is the
 * lowest price before it (D-051), which for a piece already on sale is its sale
 * price, not the regular one; otherwise the regular price.
 */
export function getReferencePrice(product: Product): number {
  const ref = product.sale?.isActive ? product.sale.referencePrice : undefined;
  return typeof ref === 'number' && ref > 0 ? ref : product.price;
}

/** The campaign whose price this is (D-051), or undefined. */
export function campaignOf(product: Product): SaleCampaign | undefined {
  return product.sale?.isActive ? product.sale.campaign : undefined;
}

/**
 * Percentage discount off the price struck through, rounded to nearest
 * integer. Falls back to computed value if the stored percentage is missing.
 */
export function getPercentOff(product: Product): number {
  if (!isOnSale(product)) return 0;
  const stored = product.sale?.percentageOff;
  if (typeof stored === 'number' && stored > 0) return Math.round(stored);
  const ref = getReferencePrice(product);
  return Math.round(((ref - product.sale!.salePrice) / ref) * 100);
}
