'use client';

import { useLanguage } from './LanguageContext';
import { translate } from './messages';
import { formatDate, formatNumber, formatPrice } from './format';

export function useTranslation() {
  const { language } = useLanguage();

  /**
   * Get a translation by key path (e.g., 'common.addToCart')
   * Supports interpolation with {placeholder} syntax
   *
   * @param key - Dot-separated path to the translation (e.g., 'cart.title')
   * @param params - Optional object with values to interpolate
   * @returns The translated string or the key if not found
   */
  const t = (key: string, params?: Record<string, string | number>): string => translate(language, key, params);

  return {
    t,
    language,
    /** "1.500 ден." / "1,500 MKD" */
    price: (n: number) => formatPrice(language, n),
    /** "1.500" / "1,500" */
    number: (n: number, maxDecimals = 0) => formatNumber(language, n, maxDecimals),
    /** "8.11.2026" / "8 Nov 2026" */
    date: (d: Date | string | undefined) => formatDate(language, d),
  };
}
