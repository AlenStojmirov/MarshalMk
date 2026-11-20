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
  // The shop writes the big ones out (XXXXL, owner 2026-11-20); the short form is the same size.
  '4XL': 'XXXXL',
  '5XL': 'XXXXXL',
  '6XL': 'XXXXXXL',
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
 * The one order sizes are read in (owner, 2026-11-20): letters small to large
 * — XS, S, M, L, XL, XXL, XXXL, XXXXL, XXXXXL, XXXXXXL — then numbers from the
 * smallest up, then anything else (one size, "1200ml") as it was stored.
 *
 * Every product read goes through it (`rowToProduct`), so the shop, the back
 * office and the cart all show S first, whatever order the shelf was written
 * in; the form keeps its list in it, the Firebase sync writes it, and
 * `npm run sizes:order` puts the stored lists in it. Measured 2026-11-20: 62 of
 * 440 products had their sizes stored out of order (`M L XL XXL S`), 15 on
 * the site.
 */
export const LETTER_ORDER: readonly string[] = [
  'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'XXXXL', 'XXXXXL', 'XXXXXXL',
];
const LETTER_RANK = new Map(LETTER_ORDER.map((l, i) => [l, i] as const));

/**
 * The sizes the product form offers (9.8). Letters for tops, waist for
 * trousers, jacket sizes for suits — each list in the order a person reads it.
 */
export const SIZE_PRESETS: Array<{ label: string; sizes: string[] }> = [
  { label: 'Букви', sizes: [...LETTER_ORDER] },
  { label: 'Половина', sizes: ['28', '29', '30', '31', '32', '33', '34', '36', '38', '40', '42'] },
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

/** 0 letters, 1 numbers, 2 the rest; and the place inside. */
function sizeRank(size: unknown): [number, number] {
  const c = canonicalSize(size);
  const letter = LETTER_RANK.get(c);
  if (letter !== undefined) return [0, letter];
  const n = Number(String(size ?? '').trim().replace(',', '.'));
  if (String(size ?? '').trim() !== '' && Number.isFinite(n)) return [1, n];
  return [2, 0];
}

/** For `sort`: S before M before XXL, 30 before 32, the rest last in the order they came (a stable sort). */
export function compareSizes(a: unknown, b: unknown): number {
  const [ka, va] = sizeRank(a);
  const [kb, vb] = sizeRank(b);
  return ka - kb || va - vb;
}

function isLetterSize(value: string | number): boolean {
  return LETTER_RANK.has(canonicalSize(value));
}

/** Sizes in the one order (see LETTER_ORDER). A new array; the input is left alone. */
export function sortSizes<T extends string | number>(sizes: T[]): T[] {
  return [...sizes].sort(compareSizes);
}

/** A shelf (`{ size, quantity }`) in the one order. A new array; the entries themselves are not copied. */
export function sortShelf<T extends { size: string | number }>(sizes: readonly T[]): T[] {
  return [...sizes].sort((a, b) => compareSizes(a.size, b.size));
}

/** Whether a shelf is already in the one order. */
export function shelfInOrder(sizes: readonly { size: string | number }[]): boolean {
  for (let i = 1; i < sizes.length; i++) if (compareSizes(sizes[i - 1].size, sizes[i].size) > 0) return false;
  return true;
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
  if (letter.length > 0) groups.push({ type: 'letter', sizes: sortSizes(letter) });
  if (numeric.length > 0) groups.push({ type: 'numeric', sizes: sortSizes(numeric) });
  return groups;
}

/**
 * Up to how many pieces a size reads "last pieces" on the product page (9.13).
 * Measured 2026-10-22: of 253 sizes on the site, 205 had one piece and 38 had
 * two, so the line shows only for the size the customer picked — under every
 * button it would be on nearly all of them and read as wallpaper.
 */
export const LAST_PIECES_MAX = 2;

/**
 * How many pieces are left when that is few enough to say so, else null.
 * A quantity that is not a whole number of pieces is unknown, and an unknown
 * stock is never put into words.
 */
export function lastPieces(quantity: unknown): number | null {
  if (typeof quantity !== 'number' || !Number.isInteger(quantity)) return null;
  return quantity >= 1 && quantity <= LAST_PIECES_MAX ? quantity : null;
}
