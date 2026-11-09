import brandCodesData from '@/config/brand-codes.json';
import { translationsOf, type Language } from '@/lib/i18n/messages';
import type { Product } from '@/types';
import { generateTitle } from './product-title';
import { canonicalCategory, type GroupKey, type MenuEntry } from '@/config/categories';

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
 * A raw category's name in a language, for the storefront and its metadata
 * (`categoryNames` in the translations): "Ролки" / "Turtlenecks". An alias is
 * named as what it is (`pantaloni` → "Панталони"); a category the
 * translations lack falls back to the English label.
 */
export function categoryName(category: string, lang: Language = 'mk'): string {
  const names = translationsOf(lang).categoryNames as Record<string, string> | undefined;
  return names?.[canonicalCategory(category)] ?? getCategoryLabel(category);
}

/** A group's name (Task 2.4, `categoryGroups`): "Јакни и капути" / "Jackets & Coats". */
export function groupName(group: GroupKey, lang: Language = 'mk'): string {
  return (translationsOf(lang).categoryGroups as Record<string, string> | undefined)?.[group] ?? group;
}

/** A menu entry's name (header, footer): a group by its own, a raw category no group holds yet by its own. */
export function menuEntryName(entry: MenuEntry, lang: Language = 'mk'): string {
  return entry.kind === 'group' ? groupName(entry.key, lang) : categoryName(entry.key, lang);
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
 * Without it, the English label above.
 *
 * Since Task 9.7 the storefront calls productTitle() below, and this is what
 * it falls back to; the back office keeps it, because staff know the codes.
 */
export function getProductDisplayName(
  name: string,
  category?: string,
  brand?: string,
  lang?: Language,
): string {
  const names = lang ? (translationsOf(lang).categoryNames as Record<string, string> | undefined) : undefined;
  const categoryLabel = category ? names?.[category] ?? getCategoryLabel(category) : '';
  const brandCode = brand ? getBrandCode(brand) || '' : '';

  if (categoryLabel) {
    return `${categoryLabel} - ${name}`;
  }

  return `#${brandCode}${name}`;
}

/**
 * Task 9.7 (D-041): the storefront's titles are written from the attributes.
 * `false` puts every storefront title back to "Кошули - #BR023" at once;
 * nothing in the database is renamed either way.
 */
export const GENERATED_TITLES = true;

/**
 * The title a customer reads — the card, the product page, its <title> and
 * JSON-LD, the cart, the order and its e-mails: "Тенка поло блуза, слим крој,
 * црна" / "Long-sleeve polo, slim fit, black". Written from the product's
 * attributes once it has its colour (and its cut, where the category has
 * cuts); until then, or when the read did not bring the attributes (an old
 * cart, a page read before migration 023), the old "Кошули - #BR023".
 */
export function productTitle(
  product: Pick<Product, 'name' | 'category' | 'brand' | 'attributes'>,
  lang: Language = 'mk',
): string {
  if (GENERATED_TITLES && product.attributes) {
    const g = generateTitle(product.category, product.attributes, { lang });
    if (g.missing.length === 0) return g.title;
  }
  return getProductDisplayName(product.name, product.category, product.brand, lang);
}
