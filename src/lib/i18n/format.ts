/**
 * Numbers, prices and dates in the page's language, without the browser's
 * locale data (see mk-format.ts for why). Macedonian: 1.500 ден., 8.11.2026.
 * English: 1,500 MKD, 8 Nov 2026.
 */

import { mkDate, mkNumber } from '@/lib/mk-format';
import type { Language } from './messages';

/** 1500 → "1,500"; 1.5 → "1.5". */
function enNumber(n: number, maxDecimals = 0): string {
  const factor = 10 ** maxDecimals;
  const rounded = Math.round(Math.abs(n) * factor) / factor;
  const [whole, frac] = String(rounded).split('.');
  const digits = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${n < 0 ? '−' : ''}${digits}${frac ? '.' + frac : ''}`;
}

export const formatNumber = (lang: Language, n: number, maxDecimals = 0): string =>
  lang === 'en' ? enNumber(n, maxDecimals) : mkNumber(n, maxDecimals);

/** A price in denars. Whole as a rule; a sale price that is not shows its cents. */
export const formatPrice = (lang: Language, n: number): string =>
  lang === 'en' ? `${enNumber(n, 2)} MKD` : `${mkNumber(n, 2)} ден.`;

const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(lang: Language, d: Date | string | undefined): string {
  if (lang !== 'en') return mkDate(d);
  if (!d) return '';
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? '' : `${x.getDate()} ${EN_MONTHS[x.getMonth()]} ${x.getFullYear()}`;
}
