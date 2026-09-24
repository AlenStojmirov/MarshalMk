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
 * What the customer pays for getting the goods, by how they get them.
 *
 * Pickup is not "free shipping" — there is no shipping. That distinction is
 * why it has its own function rather than a zero passed into the courier one:
 * above the threshold a courier order still costs the store 170 den. and has it
 * absorbed into the item prices (D-006), while a pickup costs the store nothing
 * and its prices must stand untouched. Treating the two as the same zero would
 * quietly shave margin off every pickup order.
 */
export function customerShippingFor(
  method: 'courier' | 'pickup',
  orderTotal: number
): number {
  return method === 'pickup' ? 0 : getShippingCost(orderTotal);
}

/**
 * Returns a formatted shipping label (e.g. "170 ден." or the free translation).
 */
export function getShippingLabel(orderTotal: number, freeText: string): string {
  const cost = getShippingCost(orderTotal);
  return cost > 0 ? `${cost} ден.` : freeText;
}

/**
 * Rounding step for the per-unit shipping deduction above the free-shipping
 * threshold (docs/DECISIONS.md D-006, Q6).
 */
export const SHIPPING_ABSORB_STEP = 10;

/**
 * Per-unit amount to deduct from product prices when shipping is free for the
 * customer but still paid by the store.
 *
 * Free shipping is not free — the courier is still paid. Spreading that cost
 * across the ordered units keeps per-product margin honest; without it, every
 * order above the threshold looks more profitable than it was.
 *
 * Rounded UP to the nearest `SHIPPING_ABSORB_STEP`, so the deduction is never
 * short. An overstated cost is safer than an overstated margin.
 *
 * Note: rounding up means the total deducted can exceed the real shipping cost
 * — with 2 units it is 180 instead of 170. The gap grows for unusual unit
 * counts (8 units gives 30 each, 240 total), so callers log when the absorbed
 * amount runs far above the actual cost.
 */
export function shippingAbsorptionPerUnit(totalUnits: number): number {
  if (totalUnits <= 0) return 0;
  const raw = SHIPPING_CONFIG.shippingCost / totalUnits;
  return Math.ceil(raw / SHIPPING_ABSORB_STEP) * SHIPPING_ABSORB_STEP;
}
