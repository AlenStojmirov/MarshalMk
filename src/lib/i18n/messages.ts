/**
 * The translations outside React (D-039): the server answers in the language
 * the page asked in, and plain functions on the client (`accountFetch`, the
 * profile checks) speak the page's language too. `useTranslation` reads the
 * same files, so a text lives in one place: `translations/{mk,en}.json`.
 *
 * No 'use client' and no server-only imports: both sides use this file.
 */

import en from './translations/en.json';
import mk from './translations/mk.json';

export type Language = 'en' | 'mk';

/** The shop's language: what a page is in before the visitor picks, and what the e-mails are in. */
export const DEFAULT_LANGUAGE: Language = 'mk';

type TranslationValue = string | { [key: string]: TranslationValue };
export type Translations = { [key: string]: TranslationValue };

export const TRANSLATIONS: Record<Language, Translations> = { en, mk };

export const isLanguage = (v: unknown): v is Language => v === 'en' || v === 'mk';

/**
 * A text by its dot path ('cart.title'), with `{placeholder}`s filled in.
 * A missing key comes back as the key itself, so it shows on the page and gets fixed.
 */
export function translate(lang: Language, key: string, params?: Record<string, string | number>): string {
  let value: TranslationValue = TRANSLATIONS[lang];
  for (const k of key.split('.')) {
    if (typeof value === 'object' && value !== null && k in value) {
      value = value[k];
    } else {
      console.warn(`Translation not found for key: ${key}`);
      return key;
    }
  }
  if (typeof value !== 'string') {
    console.warn(`Translation value is not a string for key: ${key}`);
    return key;
  }
  if (!params) return value;
  return value.replace(/\{(\w+)\}/g, (_, p) => params[p]?.toString() ?? `{${p}}`);
}

/** The header a page's requests carry its language in. */
export const LANGUAGE_HEADER = 'x-language';

/** The language a request asked in: Macedonian unless it asked for English. */
export const requestLanguage = (req: Request): Language =>
  req.headers.get(LANGUAGE_HEADER) === 'en' ? 'en' : DEFAULT_LANGUAGE;

/**
 * The page's language, from `<html lang>` (LanguageProvider keeps it in step
 * with the visitor's choice), for code outside React. Outside a browser, the default.
 */
export const pageLanguage = (): Language =>
  typeof document !== 'undefined' && document.documentElement.lang === 'en' ? 'en' : DEFAULT_LANGUAGE;

/** The API's messages (`errors.api.*`) in the language a request asked in. */
export function apiSay(req: Request) {
  const lang = requestLanguage(req);
  return (key: string, params?: Record<string, string | number>) => translate(lang, `errors.api.${key}`, params);
}

/** Headers that tell the server which language to answer in. */
export const languageHeaders = (): Record<string, string> => ({ [LANGUAGE_HEADER]: pageLanguage() });
