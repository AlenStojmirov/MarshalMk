export const SHIPPING_CONFIG = {
  /** Order total threshold for free shipping (in ден.) */
  freeShippingThreshold: 3000,
  /** Standard shipping cost (in ден.) */
  shippingCost: 170,
};

/**
 * Returns the shipping cost for a given order total.
 * Returns 0 if the total meets the free shipping threshold.
 */
export function getShippingCost(orderTotal: number): number {
  return orderTotal < SHIPPING_CONFIG.freeShippingThreshold
    ? SHIPPING_CONFIG.shippingCost
    : 0;
}

/**
 * Returns a formatted shipping label (e.g. "170 ден." or the free translation).
 */
export function getShippingLabel(orderTotal: number, freeText: string): string {
  const cost = getShippingCost(orderTotal);
  return cost > 0 ? `${cost} ден.` : freeText;
}
