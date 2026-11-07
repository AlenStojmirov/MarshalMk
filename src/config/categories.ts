/**
 * The storefront's categories (Task 2.4, D-042).
 *
 * The shop files a product under one of ~25 raw categories (`products.category`,
 * the keys the Firebase app used: `halfZips`, `shortsJeans`, `blouses`, …). A
 * customer sees ten groups instead, in the words a customer uses, each at its
 * own address: /mens/{group}. Inside a group the raw categories are chips,
 * /mens/{group}?type={raw, lowercase}, not pages of their own.
 *
 * The raw category stays what the database stores and what the back office
 * counts by: seasons (seasons.ts), open-to-buy (D-030) and reorder (D-029) are
 * per raw category, and the groups are only headings there. This file is the
 * one map from the one to the other; the menu, the category pages, the home
 * page, the sitemap and the back-office headings all read it.
 *
 * Names are not here: a group's name is `categoryGroups.{key}` and a raw
 * category's `categoryNames.{key}` in src/lib/i18n/translations/{mk,en}.json.
 *
 * Measured 2026-11-01 (121 products on the site): jackets 24 + vests 4,
 * shirts 20, shortsJeans 17, blouses 12, jeans 11, halfZips 7, tShirts 6,
 * polos 6, cargoTrousers 6, pants 4, turtleNecks 3, cardigans 1. The photos
 * show `blouses` are knitwear — crew-neck sweaters, knitted long-sleeve polos,
 * thin jersey tops — not shirts, so they sit with the knits.
 */

export type GroupKey =
  | 'jackets'
  | 'knitwear'
  | 'hoodies'
  | 'shirts'
  | 'tshirts'
  | 'jeans'
  | 'pants'
  | 'shorts'
  | 'suits'
  | 'accessories';

export interface CategoryGroup {
  /** Also its address: /mens/{key}. Where a raw category had this address
   * (`/mens/jeans`, `/mens/shirts`, `/mens/jackets` …) it keeps it, now for
   * the whole group. */
  key: GroupKey;
  /** Raw categories, in the order their chips show. */
  categories: readonly string[];
  /** AW sells October–March, SS April–September, ALL all year (seasons.ts,
   * measured per raw category; a group takes its main category's). */
  season: 'AW' | 'SS' | 'ALL';
  /** Its page's title for search, Macedonian (page metadata is Macedonian
   * only, D-039): "Машки кошули | Marshal". */
  seoTitle: string;
}

export const CATEGORY_GROUPS: readonly CategoryGroup[] = [
  { key: 'jackets', categories: ['jackets', 'coats', 'vests'], season: 'AW', seoTitle: 'Машки јакни и капути' },
  {
    key: 'knitwear',
    categories: ['blouses', 'dzemper', 'halfZips', 'fullZips', 'turtleNecks', 'cardigans'],
    season: 'AW',
    seoTitle: 'Машко плетиво',
  },
  { key: 'hoodies', categories: ['hoodies'], season: 'AW', seoTitle: 'Машки дуксери' },
  { key: 'shirts', categories: ['shirts', 'shortSleevedShirt'], season: 'ALL', seoTitle: 'Машки кошули' },
  { key: 'tshirts', categories: ['tShirts', 'polos', 'oversizeTshirts'], season: 'SS', seoTitle: 'Машки маици и поло маици' },
  { key: 'jeans', categories: ['jeans'], season: 'ALL', seoTitle: 'Машки фармерки' },
  { key: 'pants', categories: ['pants', 'cargoTrousers'], season: 'ALL', seoTitle: 'Машки панталони' },
  { key: 'shorts', categories: ['shortsJeans'], season: 'SS', seoTitle: 'Машки шорцеви' },
  { key: 'suits', categories: ['suits', 'suitJackets', 'blazers'], season: 'ALL', seoTitle: 'Машки одела и сакоа' },
  { key: 'accessories', categories: ['belts', 'accessories'], season: 'ALL', seoTitle: 'Машки додатоци' },
];

/**
 * The order the menu, the home page and /categories list the groups in. From
 * October to March the winter wardrobe leads; from April to September the
 * summer one. A group with nothing on the shelf is left out wherever it would
 * show (an empty one is not a promise the shop can keep).
 */
const WINTER_ORDER: readonly GroupKey[] = [
  'jackets', 'knitwear', 'hoodies', 'shirts', 'jeans', 'pants', 'tshirts', 'suits', 'accessories', 'shorts',
];
const SUMMER_ORDER: readonly GroupKey[] = [
  'tshirts', 'shirts', 'shorts', 'jeans', 'pants', 'suits', 'accessories', 'knitwear', 'hoodies', 'jackets',
];

/** Months 1–12 when the winter wardrobe leads. */
export const WINTER_MONTHS: readonly number[] = [10, 11, 12, 1, 2, 3];

/**
 * Raw values that are another category under another spelling, written by the
 * Firebase app until the switchover: two BRANGO trousers as `pantaloni`, two
 * FABREGAS knitted full-zip jumpers as `ziper` (photos checked 2026-11-01).
 * Read as the category they are; `npm run category:replace` fixes the rows.
 */
export const CATEGORY_ALIASES: Readonly<Record<string, string>> = {
  pantaloni: 'pants',
  ziper: 'fullZips',
  kosula: 'shirts',
};

/** The other spellings of these categories (`pants` → `pantaloni`), to read them too. */
export function aliasesOf(categories: readonly string[]): string[] {
  return Object.keys(CATEGORY_ALIASES).filter((a) => categories.includes(CATEGORY_ALIASES[a]));
}

/** Not clothing: kept out of the groups, the menu and the back-office headings. */
export const NON_MERCHANDISE: ReadonlySet<string> = new Set(['vaucer']);

/** Every raw category the shop knows, in group order. */
export const ALL_CATEGORIES: readonly string[] = CATEGORY_GROUPS.flatMap((g) => g.categories);

/** A slug the way the addresses spell it: lowercase, spaces to dashes. */
export const slugOf = (s: string): string => s.trim().toLowerCase().replace(/\s+/g, '-');

/** The category a stored value means: `pantaloni` → `pants`; anything else as it is. */
export function canonicalCategory(raw: string): string {
  return CATEGORY_ALIASES[raw] ?? raw;
}

const GROUP_BY_CATEGORY = new Map<string, CategoryGroup>(
  CATEGORY_GROUPS.flatMap((g) => g.categories.map((c) => [slugOf(c), g] as const)),
);

/** The group a product is in, through its raw category; undefined for one no group holds. */
export function groupOfCategory(raw: string | undefined | null): CategoryGroup | undefined {
  return raw ? GROUP_BY_CATEGORY.get(slugOf(canonicalCategory(raw))) : undefined;
}

/** The group behind /mens/{slug}, any spelling (`/mens/tShirts` is the T-shirts group). */
export function groupForSlug(slug: string): CategoryGroup | undefined {
  const s = slugOf(slug);
  return CATEGORY_GROUPS.find((g) => g.key === s);
}

/**
 * The raw category a slug names, in the shop's spelling (`shortsJeans` for
 * `shortsjeans`, `pants` for `pantaloni`), if a group holds it. Old addresses
 * (/mens/halfZips) are sent on to their group with this.
 */
export function categoryForSlug(slug: string): string | undefined {
  const s = slugOf(slug);
  const alias = Object.keys(CATEGORY_ALIASES).find((a) => slugOf(a) === s);
  if (alias) return CATEGORY_ALIASES[alias];
  return ALL_CATEGORIES.find((c) => slugOf(c) === s);
}

/** A group's address, with a type: /mens/knitwear?type=turtlenecks. */
export function groupHref(group: GroupKey, type?: string): string {
  return type ? `/mens/${group}?type=${encodeURIComponent(slugOf(type))}` : `/mens/${group}`;
}

/** Where a product's category is on the site: its group's chip, the group
 * itself when it holds one kind (it has no chips: /mens/shorts, not a second
 * address for the same page, 16.2), or, for a category no group holds yet,
 * its own page as before. */
export function categoryHref(raw: string): string {
  const group = groupOfCategory(raw);
  if (!group) return `/mens/${encodeURIComponent(slugOf(raw))}`;
  return groupHref(group.key, group.categories.length > 1 ? canonicalCategory(raw) : undefined);
}

export function isWinter(date: Date = new Date()): boolean {
  return WINTER_MONTHS.includes(date.getMonth() + 1);
}

/** All ten groups, in this season's order. */
export function groupsInSeasonOrder(date: Date = new Date()): CategoryGroup[] {
  const order = isWinter(date) ? WINTER_ORDER : SUMMER_ORDER;
  return order.map((k) => CATEGORY_GROUPS.find((g) => g.key === k)!);
}

/**
 * What a menu lists: the groups with something on the shelf, in this season's
 * order, then any raw category no group holds (a new one from the Firebase
 * app) under its own name, so a product is never on the site with no way to
 * it.
 */
export type MenuEntry =
  | { kind: 'group'; key: GroupKey; href: string; count: number }
  | { kind: 'category'; key: string; href: string; count: number };

export function menuEntries(categories: Iterable<string>, date: Date = new Date()): MenuEntry[] {
  const perGroup = new Map<GroupKey, number>();
  const loose = new Map<string, number>();
  for (const raw of categories) {
    if (!raw || NON_MERCHANDISE.has(raw)) continue;
    const g = groupOfCategory(raw);
    if (g) perGroup.set(g.key, (perGroup.get(g.key) ?? 0) + 1);
    else loose.set(raw, (loose.get(raw) ?? 0) + 1);
  }
  return [
    ...groupsInSeasonOrder(date)
      .filter((g) => perGroup.has(g.key))
      .map((g) => ({ kind: 'group' as const, key: g.key, href: groupHref(g.key), count: perGroup.get(g.key)! })),
    ...[...loose.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([raw, count]) => ({ kind: 'category' as const, key: raw, href: `/mens/${encodeURIComponent(slugOf(raw))}`, count })),
  ];
}
