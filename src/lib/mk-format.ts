/**
 * Numbers and dates the Macedonian way — 1.500 and 8.11.2026 — without the
 * browser's locale data. Many browsers ship without `mk`, and then
 * `toLocaleString('mk-MK')` quietly prints 1,500 and 11/8/2026 (seen on the
 * customer dashboard, 13.9; the same reason marketing.ts has its own `den`).
 * Server-rendered pages have the full data, but code that may run in the
 * browser uses these.
 */

/** 1500 → "1.500"; 1.5 → "1,5". */
export function mkNumber(n: number, maxDecimals = 0): string {
  const factor = 10 ** maxDecimals;
  const rounded = Math.round(Math.abs(n) * factor) / factor;
  const [whole, frac] = String(rounded).split('.');
  const digits = whole.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${n < 0 ? '−' : ''}${digits}${frac ? ',' + frac : ''}`;
}

/** "1.500 ден." */
export const mkDen = (n: number) => `${mkNumber(n)} ден.`;

/** 2026-11-08 → "8.11.2026". */
export function mkDate(d: Date | string | undefined): string {
  if (!d) return '';
  const x = new Date(d);
  return Number.isNaN(x.getTime()) ? '' : `${x.getDate()}.${x.getMonth() + 1}.${x.getFullYear()}`;
}
