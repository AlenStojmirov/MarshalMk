/**
 * One size, one name (Task 9.8).
 *
 * The same size was entered under two names — XXL on 173 variants, 2XL on 14;
 * XXXL 9 and 3XL 7 — and one-size accessories as "kolicina" / "количина".
 * Counted raw, that split the size curve, the reorder plan and the storefront
 * filter in two.
 *
 * Everything that groups, matches or shows a size goes through here — the
 * storefront filter, the reports, and the two matchers that pair sales across
 * copies (the Firebase sync's protection, D-012, and the ledger sync) — so a
 * label renamed on one side only is still the same size. Stored labels are
 * tidied by `npm run sizes:canonical`; the product form offers only canonical
 * ones. The raw label stays the value that is ordered and reserved.
 */
const SIZE_ALIASES: Record<string, string> = {
  '2XL': 'XXL',
  '3XL': 'XXXL',
  KOLICINA: 'ONE',
  КОЛИЧИНА: 'ONE',
  'ЕДНА ГОЛЕМИНА': 'ONE',
};

/**
 * The label stored after the rename (npm run sizes:canonical). Only aliases
 * change; every other label is left exactly as typed.
 */
export function storedCanonicalLabel(label: string): string {
  const raw = String(label ?? '').trim();
  const c = canonicalSize(raw);
  if (c === raw.toUpperCase()) return raw;
  return c === ONE_SIZE ? ONE_SIZE_LABEL.mk : c;
}

/** The key for one-size items: accessories, belts. */
export const ONE_SIZE = 'ONE';

const ONE_SIZE_LABEL = { mk: 'Една големина', en: 'One size' } as const;

/** Grouping key: trimmed, upper case, aliases folded. "2xl " → "XXL". */
export function canonicalSize(size: unknown): string {
  const key = String(size ?? '').trim().toUpperCase();
  return SIZE_ALIASES[key] ?? key;
}

/**
 * The sizes the product form offers (9.8). Letters for tops, waist for
 * trousers, jacket sizes for suits — each list in the order a person reads it.
 */
export const SIZE_PRESETS: Array<{ label: string; sizes: string[] }> = [
  { label: 'Букви', sizes: ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '4XL'] },
  { label: 'Половина', sizes: ['28', '29', '30', '31', '32', '33', '34', '36', '38', '40'] },
  { label: 'Сако / одело', sizes: ['44', '46', '48', '50', '52', '54', '56', '58'] },
  { label: 'Друго', sizes: [ONE_SIZE_LABEL.mk] },
];

/** What a customer reads: "2XL" → "XXL", "kolicina" → "Една големина", "32" → "32". */
export function sizeLabel(size: unknown, lang: 'mk' | 'en' = 'mk'): string {
  const raw = String(size ?? '').trim();
  const c = canonicalSize(raw);
  if (c === ONE_SIZE) return ONE_SIZE_LABEL[lang];
  return c !== raw.toUpperCase() ? c : raw;
}

// Custom sort order for letter-based sizes; aliases sort with their size.
const LETTER_SIZE_ORDER: Record<string, number> = {
  XS: -1,
  S: 0,
  M: 1,
  L: 2,
  XL: 3,
  XXL: 4,
  '2XL': 4,
  XXXL: 5,
  '3XL': 5,
  '4XL': 6,
  '5XL': 7,
  '6XL': 8,
};

// A size is considered numeric if it parses to a finite number
function isNumericSize(value: string | number): boolean {
  return Number.isFinite(Number(value));
}

// Detect whether the entire set is letter-based or numeric-based
// by checking if ANY value matches a known letter size
function isLetterSizeSet(sizes: (string | number)[]): boolean {
  return sizes.some((s) => String(s).toUpperCase() in LETTER_SIZE_ORDER);
}

function isLetterSize(value: string | number): boolean {
  return String(value).toUpperCase() in LETTER_SIZE_ORDER;
}

// Sort letter sizes by custom order, unknowns at the end
function sortLetterSizes<T extends string | number>(sizes: T[]): T[] {
  return [...sizes].sort((a, b) => {
    const orderA = LETTER_SIZE_ORDER[String(a).toUpperCase()] ?? Infinity;
    const orderB = LETTER_SIZE_ORDER[String(b).toUpperCase()] ?? Infinity;
    return orderA - orderB;
  });
}

// Sort numeric sizes ascending, non-numeric unknowns at the end
function sortNumericSizes<T extends string | number>(sizes: T[]): T[] {
  return [...sizes].sort((a, b) => {
    const numA = Number(a);
    const numB = Number(b);
    if (isNumericSize(a) && isNumericSize(b)) return numA - numB;
    if (isNumericSize(a)) return -1;
    if (isNumericSize(b)) return 1;
    return 0;
  });
}

/**
 * Sorts a flat array of sizes using the appropriate strategy:
 * - Letter sizes → custom predefined order (S, M, L, XL, ...)
 * - Numeric sizes → ascending numeric order (29, 30, 31, ...)
 * Unknown values are placed at the end.
 */
export function sortSizes<T extends string | number>(sizes: T[]): T[] {
  if (sizes.length <= 1) return sizes;
  if (isLetterSizeSet(sizes)) return sortLetterSizes(sizes);
  return sortNumericSizes(sizes);
}

export interface SizeGroup<T extends string | number> {
  type: 'letter' | 'numeric';
  sizes: T[];
}

/**
 * Splits sizes into separate groups (letter-based and numeric-based),
 * each sorted independently. Returns only non-empty groups.
 * Letter group is listed first, numeric group second.
 */
export function groupSizes<T extends string | number>(sizes: T[]): SizeGroup<T>[] {
  const letter: T[] = [];
  const numeric: T[] = [];

  for (const s of sizes) {
    if (isLetterSize(s)) {
      letter.push(s);
    } else {
      numeric.push(s);
    }
  }

  const groups: SizeGroup<T>[] = [];
  if (letter.length > 0) groups.push({ type: 'letter', sizes: sortLetterSizes(letter) });
  if (numeric.length > 0) groups.push({ type: 'numeric', sizes: sortNumericSizes(numeric) });
  return groups;
}
