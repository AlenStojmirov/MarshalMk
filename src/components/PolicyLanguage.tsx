'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useLanguage } from '@/lib/i18n';

/**
 * Which version of a rules page shows: the Macedonian, unless the visitor
 * picked English. Both arrive built by the server (PolicyPage); the server's
 * HTML is always the Macedonian — the shop's default, what search engines
 * read, and the text that applies.
 */
export default function PolicyLanguage({ mk, en }: { mk: ReactNode; en: ReactNode }) {
  const { language } = useLanguage();
  const shown = useRef(language);
  const rescrolled = useRef(false);

  // A link to a heading (/shipping-returns#exchange) opened in English: the
  // browser scrolled to it in the Macedonian text the server sent, and the
  // English that replaces it has other heights. Find the heading again, once.
  useEffect(() => {
    if (shown.current === language) return;
    shown.current = language;
    if (rescrolled.current) return;
    rescrolled.current = true;
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView();
  }, [language]);

  return <>{language === 'en' ? en : mk}</>;
}
