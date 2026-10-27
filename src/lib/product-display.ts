import brandCodesData from '@/config/brand-codes.json';
import { TRANSLATIONS, type Language } from '@/lib/i18n/messages';

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
 * The category behind a /mens/{slug} (Task 14.6): its raw key (`shortsJeans`
 * for `shortsjeans`), whether or not anything in it is on the shelf now, or
 * undefined for one the shop does not know. Matched the way
 * `fetchPaginatedProducts` matches a product: lowercased, spaces to dashes.
 * The header links the raw key and the sitemap the lowercased one; both must
 * find the same name.
 */
export function categoryForSlug(slug: string): string | undefined {
  const s = slug.toLowerCase();
  return Object.keys(CATEGORY_LABELS).find((c) => c.toLowerCase().replace(/\s+/g, '-') === s);
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
 *
 * With `lang` (the storefront, D-039) the category is named in that language,
 * `categoryNames` in the translations: "Кошули - #BR023" / "Shirts - #BR023".
 * Without it, the English label above (the back office, labels, page titles until 9.7).
 */
export function getProductDisplayName(
  name: string,
  category?: string,
  brand?: string,
  lang?: Language,
): string {
  const names = lang ? (TRANSLATIONS[lang].categoryNames as Record<string, string> | undefined) : undefined;
  const categoryLabel = category ? names?.[category] ?? getCategoryLabel(category) : '';
  const brandCode = brand ? getBrandCode(brand) || '' : '';

  if (categoryLabel) {
    return `${categoryLabel} - ${name}`;
  }

  return `#${brandCode}${name}`;
}
