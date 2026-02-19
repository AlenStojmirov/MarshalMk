'use client';

import Link from 'next/link';
import Image from 'next/image';
import { ShoppingCart, Menu, X, Package, ChevronDown, Globe } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { useState, useRef, useEffect } from 'react';
import { useTranslation, useLanguage, Language } from '@/lib/i18n';
import { useCategories } from '@/hooks/useProducts';

export default function Header() {
  const { totalItems } = useCart();
  const { categories } = useCategories();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [categoriesDropdownOpen, setCategoriesDropdownOpen] = useState(false);
  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();
  const categoriesDropdownRef = useRef<HTMLDivElement>(null);
  const langMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdowns when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (categoriesDropdownRef.current && !categoriesDropdownRef.current.contains(event.target as Node)) {
        setCategoriesDropdownOpen(false);
      }
      if (langMenuRef.current && !langMenuRef.current.contains(event.target as Node)) {
        setLangMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleLanguageChange = (lang: Language) => {
    setLanguage(lang);
    setLangMenuOpen(false);
  };

  return (
    <header className="sticky top-0 z-50">
      {/* Main Navigation */}
      <nav className="bg-white/95 backdrop-blur-sm border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            {/* Logo */}
            <Link href="/" className="flex-shrink-0">
              <Image
                src="/logo_black.png"
                alt={t('header.storeName')}
                width={120}
                height={40}
                className="h-12 w-auto"
                priority
              />
            </Link>

            {/* Desktop Navigation - Center */}
            <div className="hidden md:flex items-center gap-10">
              <Link href="/" className="text-gray-900 hover:text-black text-sm uppercase tracking-[0.15em] font-medium transition-colors duration-200 hover:underline underline-offset-4 decoration-1">
                {t('header.home')}
              </Link>

              <Link href="/new" className="text-gray-900 hover:text-black text-sm uppercase tracking-[0.15em] font-medium transition-colors duration-200 hover:underline underline-offset-4 decoration-1">
                {t('header.new')}
              </Link>

              {/* Categories Dropdown */}
              <div className="relative" ref={categoriesDropdownRef}>
                <button
                  onClick={() => setCategoriesDropdownOpen(!categoriesDropdownOpen)}
                  className="flex items-center gap-1 text-gray-900 hover:text-black text-sm uppercase tracking-[0.15em] font-medium transition-colors duration-200 hover:underline underline-offset-4 decoration-1"
                >
                  {t('common.categories')}
                  <ChevronDown className={`h-4 w-4 transition-transform ${categoriesDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {categoriesDropdownOpen && (
                  <div className="absolute left-0 mt-4 w-52 bg-white shadow-md border border-gray-100 py-3 z-50 max-h-80 overflow-y-auto">
                    {categories.map((category) => {
                      const translated = t(`categoryNames.${category}`);
                      return (
                        <Link
                          key={category}
                          href={`/mens/${encodeURIComponent(category.toLowerCase().replace(/\s+/g, '-'))}`}
                          className="block px-5 py-2.5 text-sm text-gray-700 hover:text-black hover:bg-gray-50/80 transition-colors duration-200"
                          onClick={() => setCategoriesDropdownOpen(false)}
                        >
                          {translated.startsWith('categoryNames.') ? category : translated}
                        </Link>
                      );
                    })}
                    {categories.length === 0 && (
                      <span className="block px-5 py-2.5 text-gray-400 text-sm">
                        {t('categories.noCategories')}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <Link href="/sale" className="text-red-600 hover:text-red-700 text-sm uppercase tracking-[0.15em] font-semibold transition-colors duration-200 hover:underline underline-offset-4 decoration-1">
                {t('header.sale')}
              </Link>

              <Link
                href="/track-order"
                className="flex items-center gap-1 text-gray-900 hover:text-black text-sm uppercase tracking-[0.15em] font-medium transition-colors duration-200 hover:underline underline-offset-4 decoration-1"
              >
                <Package className="h-5 w-5" />
                {t('header.trackOrder')}
              </Link>
            </div>

            {/* Desktop Right Icons */}
            <div className="hidden md:flex items-center gap-5">
              {/* Language Switcher */}
              <div className="relative" ref={langMenuRef}>
                <button
                  onClick={() => setLangMenuOpen(!langMenuOpen)}
                  className="flex items-center gap-1.5 text-gray-500 hover:text-black transition-colors duration-200"
                  title={t('header.switchLanguage')}
                >
                  <Globe className="h-5 w-5" />
                  <span className="text-xs font-medium uppercase tracking-wider">{language}</span>
                </button>
                {langMenuOpen && (
                  <div className="absolute right-0 mt-3 w-36 bg-white shadow-md border border-gray-100 py-2 z-50">
                    <button
                      onClick={() => handleLanguageChange('en')}
                      className={`w-full px-5 py-2.5 text-left text-sm hover:bg-gray-50 flex items-center gap-2.5 transition-colors duration-200 ${
                        language === 'en' ? 'bg-gray-100 text-black' : 'text-gray-700'
                      }`}
                    >
                      <span>EN</span>
                      <span className="text-gray-500">English</span>
                    </button>
                    <button
                      onClick={() => handleLanguageChange('mk')}
                      className={`w-full px-5 py-2.5 text-left text-sm hover:bg-gray-50 flex items-center gap-2.5 transition-colors duration-200 ${
                        language === 'mk' ? 'bg-gray-100 text-black' : 'text-gray-700'
                      }`}
                    >
                      <span>MK</span>
                      <span className="text-gray-500">Македонски</span>
                    </button>
                  </div>
                )}
              </div>

              <Link
                href="/cart"
                className="relative flex items-center text-gray-500 hover:text-black transition-colors duration-200"
                title={t('common.cart')}
              >
                <ShoppingCart className="h-6 w-6" />
                {totalItems > 0 && (
                  <span className="absolute -top-2 -right-2 bg-black text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                    {totalItems}
                  </span>
                )}
              </Link>
            </div>

            {/* Mobile menu button */}
            <div className="md:hidden flex items-center gap-3">
              <button
                onClick={() => handleLanguageChange(language === 'en' ? 'mk' : 'en')}
                className="text-gray-500 hover:text-black transition-colors duration-200"
                title={t('header.switchLanguage')}
              >
                <Globe className="h-5 w-5" />
              </button>
              <Link
                href="/cart"
                className="relative text-gray-500 hover:text-black transition-colors duration-200"
                title={t('common.cart')}
              >
                <ShoppingCart className="h-6 w-6" />
                {totalItems > 0 && (
                  <span className="absolute -top-2 -right-2 bg-black text-white text-xs font-bold rounded-full h-5 w-5 flex items-center justify-center">
                    {totalItems}
                  </span>
                )}
              </Link>
              <button
                className="p-2"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              >
                {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </button>
            </div>
          </div>

          {/* Mobile Navigation */}
          {mobileMenuOpen && (
            <div className="md:hidden py-6 border-t border-gray-100">
              <div className="flex flex-col gap-5">
                <Link
                  href="/"
                  className="text-gray-900 hover:text-black text-sm uppercase tracking-[0.15em] font-medium transition-colors duration-200 hover:underline underline-offset-4 decoration-1"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {t('header.home')}
                </Link>

                <Link
                  href="/new"
                  className="text-gray-900 hover:text-black text-sm uppercase tracking-[0.15em] font-medium transition-colors duration-200 hover:underline underline-offset-4 decoration-1"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {t('header.new')}
                </Link>

                {/* Mobile Categories Section */}
                <div className="flex flex-col gap-2">
                  <span className="text-gray-900 text-sm uppercase tracking-[0.15em] font-semibold">{t('common.categories')}</span>
                  <div className="pl-4 flex flex-col gap-3">
                    {categories.map((category) => {
                      const translated = t(`categoryNames.${category}`);
                      return (
                        <Link
                          key={category}
                          href={`/mens/${encodeURIComponent(category.toLowerCase().replace(/\s+/g, '-'))}`}
                          className="text-gray-600 hover:text-black text-sm tracking-wide transition-colors duration-200"
                          onClick={() => setMobileMenuOpen(false)}
                        >
                          {translated.startsWith('categoryNames.') ? category : translated}
                        </Link>
                      );
                    })}
                    {categories.length === 0 && (
                      <span className="text-gray-400 text-xs tracking-wide">{t('categories.noCategories')}</span>
                    )}
                  </div>
                </div>

                <Link
                  href="/sale"
                  className="text-red-600 hover:text-red-700 text-sm uppercase tracking-[0.15em] font-semibold transition-colors duration-200 hover:underline underline-offset-4 decoration-1"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {t('header.sale')}
                </Link>

                <Link
                  href="/track-order"
                  className="flex items-center gap-2 text-gray-900 hover:text-black text-sm uppercase tracking-[0.15em] font-medium transition-colors duration-200 hover:underline underline-offset-4 decoration-1"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <Package className="h-5 w-5" />
                  {t('header.trackOrder')}
                </Link>
              </div>
            </div>
          )}
        </div>
      </nav>

      {/* Top Bar - Below Menu */}
      <div className="bg-stone-900 text-white text-center py-2.5 text-xs uppercase tracking-[0.2em] font-light">
        {t('header.freeShippingBanner')}
      </div>
    </header>
  );
}
