import brandCodesData from '@/config/brand-codes.json';

const CATEGORY_LABELS: Record<string, string> = {
  vaucer: "Voucher",
  hoodies: "Hoodies",
  tShirts: "T-Shirts",
  shirts: "Shirts",
  pants: "Pants",
  jackets: "Jackets",
  belts: "Belts",
  accessories: "Accessories",
  jeans: "Jeans",
  shortsJeans: "Short jeans",
  suits: "Suits",
  cardigans: "Cardigans",
  blazers: "Blazers",
  polos: "Polos",
  oversizeTshirts: "Oversize T-Shirts",
  blouses: "Blouses",
  vests: "Vests",
  coats: "Coats",
  turtleNecks: "Turtle Necks",
  suitJackets: "Suit Jackets",
  halfZips: "Half-Zips",
  fullZips: "Full-Zips",
  shortSleevedShirt: "Short-Sleeved Shirts",
  cargoTrousers: "Cargo Trousers"
};

/**
 * Get the single-letter brand code from brand-codes.json.
 * Returns undefined if brand is not mapped.
 */
export function getBrandCode(brand: string): string | undefined {
  const brands = brandCodesData.brands as Record<string, string>;
  return brands[brand];
}

/**
 * Get all brand-to-code mappings.
 */
export function getAllBrandCodes(): Record<string, string> {
  return brandCodesData.brands as Record<string, string>;
}

/**
 * Get the category label for display (English).
 * Falls back to the raw category string with first letter capitalized.
 */
export function getCategoryLabel(category: string): string {
  return CATEGORY_LABELS[category] || category.charAt(0).toUpperCase() + category.slice(1);
}

/**
 * Build the customer-facing product display name.
 *
 * Format: "{Translated Category} - #{BrandCode}{Name}"
 *
 * Takes the product's category (translated via CATEGORY_LABELS),
 * looks up the brand code from brand-codes.json,
 * and appends the product's `name` field (which holds the number/identifier).
 *
 * Examples:
 *   category="jeans", brand="X2Denim", name="002"  => "Jeans - #D002"
 *   category="shirts", brand="KalvinTR", name="015" => "Shirt - #K015"
 *   category="jeans", brand=undefined, name="002"   => "Jeans - #002"
 */
export function getProductDisplayName(
  name: string,
  category?: string,
  brand?: string,
): string {
  const categoryLabel = category ? getCategoryLabel(category) : '';
  const brandCode = brand ? getBrandCode(brand) || '' : '';

  if (categoryLabel) {
    return `${categoryLabel} - #${brandCode}${name}`;
  }

  return `#${brandCode}${name}`;
}
