'use client';

import { useLanguage } from './LanguageContext';

type TranslationValue = string | { [key: string]: TranslationValue };

export function useTranslation() {
  const { language, translations } = useLanguage();

  /**
   * Get a translation by key path (e.g., 'common.addToCart')
   * Supports interpolation with {placeholder} syntax
   *
   * @param key - Dot-separated path to the translation (e.g., 'cart.title')
   * @param params - Optional object with values to interpolate
   * @returns The translated string or the key if not found
   */
  const t = (key: string, params?: Record<string, string | number>): string => {
    const keys = key.split('.');
    let value: TranslationValue = translations;

    for (const k of keys) {
      if (typeof value === 'object' && value !== null && k in value) {
        value = value[k];
      } else {
        // Return key if translation not found
        console.warn(`Translation not found for key: ${key}`);
        return key;
      }
    }

    if (typeof value !== 'string') {
      console.warn(`Translation value is not a string for key: ${key}`);
      return key;
    }

    // Handle interpolation
    if (params) {
      return value.replace(/\{(\w+)\}/g, (_, paramKey) => {
        return params[paramKey]?.toString() || `{${paramKey}}`;
      });
    }

    return value;
  };

  return { t, language };
}
