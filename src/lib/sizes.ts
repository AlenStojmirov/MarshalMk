// Custom sort order for letter-based sizes
const LETTER_SIZE_ORDER: Record<string, number> = {
  S: 0,
  M: 1,
  L: 2,
  XL: 3,
  XXL: 4,
  '2XL': 5,
  XXXL: 6,
  '3XL': 7,
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
