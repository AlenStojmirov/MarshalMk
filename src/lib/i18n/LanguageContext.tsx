'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import en from './translations/en.json';
import mk from './translations/mk.json';

export type Language = 'en' | 'mk';

type TranslationValue = string | { [key: string]: TranslationValue };
type Translations = { [key: string]: TranslationValue };

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  translations: Translations;
}

const translations: Record<Language, Translations> = {
  en,
  mk,
};

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

const LANGUAGE_STORAGE_KEY = 'ecommerce-language';

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en');
  const [isLoaded, setIsLoaded] = useState(false);

  // Load language from localStorage on mount
  useEffect(() => {
    const savedLanguage = localStorage.getItem(LANGUAGE_STORAGE_KEY) as Language;
    if (savedLanguage && (savedLanguage === 'en' || savedLanguage === 'mk')) {
      setLanguageState(savedLanguage);
    }
    setIsLoaded(true);
  }, []);

  // Save language to localStorage when it changes
  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
      // Update html lang attribute
      document.documentElement.lang = language;
    }
  }, [language, isLoaded]);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
  };

  return (
    <LanguageContext.Provider
      value={{
        language,
        setLanguage,
        translations: translations[language],
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
