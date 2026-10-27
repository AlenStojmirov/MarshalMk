'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { DEFAULT_LANGUAGE, TRANSLATIONS, isLanguage, type Language, type Translations } from './messages';

export type { Language } from './messages';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  translations: Translations;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const LANGUAGE_STORAGE_KEY = 'ecommerce-language';

/**
 * The visitor's language, kept in localStorage and in `<html lang>`.
 * `fixed` pins a part of the site to one language whatever the visitor picked:
 * the back office is Macedonian only (D-039).
 */
export function LanguageProvider({ children, fixed }: { children: ReactNode; fixed?: Language }) {
  const [language, setLanguageState] = useState<Language>(fixed ?? DEFAULT_LANGUAGE);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load language from localStorage on mount
  useEffect(() => {
    if (fixed) return;
    try {
      const savedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      if (isLanguage(savedLanguage)) setLanguageState(savedLanguage);
    } catch { /* storage blocked: the default stays */ }
    setIsLoaded(true);
  }, [fixed]);

  // Save language to localStorage when it changes
  useEffect(() => {
    if (fixed || !isLoaded) return;
    try { localStorage.setItem(LANGUAGE_STORAGE_KEY, language); } catch { /* not kept, still shown */ }
    // Update html lang attribute; pageLanguage() reads it for requests made outside React
    document.documentElement.lang = language;
  }, [language, isLoaded, fixed]);

  const setLanguage = (lang: Language) => {
    if (!fixed) setLanguageState(lang);
  };

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        translations: TRANSLATIONS[language],
      }}
    >
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error('useLanguage must be used within a LanguageProvider');
  }
  return context;
}
