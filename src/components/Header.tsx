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
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo */}
            <Link href="/" className="flex-shrink-0">
              <Image
                src="/Logo_black.png"
                alt={t('header.storeName')}
                width={120}
                height={40}
                className="h-10 w-auto"
                priority
              />
            </Link>

            {/* Desktop Navigation - Center */}
            <div className="hidden md:flex items-center gap-8">
              <Link href="/" className="text-gray-700 hover:text-black font-medium transition-colors">
                {t('header.home')}
              </Link>

              <Link href="/new" className="text-gray-700 hover:text-black font-medium transition-colors">
                {t('header.new')}
              </Link>

              {/* Categories Dropdown */}
              <div className="relative" ref={categoriesDropdownRef}>
                <button
                  onClick={() => setCategoriesDropdownOpen(!categoriesDropdownOpen)}
                  className="flex items-center gap-1 text-gray-700 hover:text-black font-medium transition-colors"
                >
                  {t('common.categories')}
                  <ChevronDown className={`h-4 w-4 transition-transform ${categoriesDropdownOpen ? 'rotate-180' : ''}`} />
                </button>
                {categoriesDropdownOpen && (
                  <div className="absolute left-0 mt-2 w-48 bg-white rounded-md shadow-lg border border-gray-200 py-2 z-50 max-h-80 overflow-y-auto">
                    {categories.map((category) => (
                      <Link
                        key={category}
                        href={`/mens/${encodeURIComponent(category.toLowerCase().replace(/\s+/g, '-'))}`}
                        className="block px-4 py-2 text-gray-700 hover:bg-gray-100 transition-colors"
                        onClick={() => setCategoriesDropdownOpen(false)}
                      >
                        {category}
                      </Link>
                    ))}
                    {categories.length === 0 && (
                      <span className="block px-4 py-2 text-gray-500 text-sm">
                        {t('categories.noCategories')}
                      </span>
                    )}
                  </div>
                )}
              </div>

              <Link href="/sale" className="text-red-600 hover:text-red-700 font-bold transition-colors">
                {t('header.sale')}
              </Link>

              <Link
                href="/track-order"
                className="flex items-center gap-1 text-gray-700 hover:text-black font-medium transition-colors"
              >
                <Package className="h-5 w-5" />
                {t('header.trackOrder')}
              </Link>
            </div>

            {/* Desktop Right Icons */}
            <div className="hidden md:flex items-center gap-4">
              {/* Language Switcher */}
              <div className="relative" ref={langMenuRef}>
                <button
                  onClick={() => setLangMenuOpen(!langMenuOpen)}
                  className="flex items-center gap-1 text-gray-600 hover:text-black transition-colors"
                  title={t('header.switchLanguage')}
                >
                  <Globe className="h-5 w-5" />
                  <span className="text-sm font-medium uppercase">{language}</span>
                </button>
                {langMenuOpen && (
                  <div className="absolute right-0 mt-2 w-32 bg-white rounded-md shadow-lg border border-gray-200 py-1 z-50">
                    <button
                      onClick={() => handleLanguageChange('en')}
                      className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2 ${
                        language === 'en' ? 'bg-gray-100 text-black' : 'text-gray-700'
                      }`}
                    >
                      <span>EN</span>
                      <span className="text-gray-500">English</span>
                    </button>
                    <button
                      onClick={() => handleLanguageChange('mk')}
                      className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-100 flex items-center gap-2 ${
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
                className="relative flex items-center text-gray-600 hover:text-black transition-colors"
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
                className="text-gray-600 hover:text-black"
                title={t('header.switchLanguage')}
              >
                <Globe className="h-5 w-5" />
              </button>
              <Link
                href="/cart"
                className="relative text-gray-600 hover:text-black"
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
            <div className="md:hidden py-4 border-t">
              <div className="flex flex-col gap-4">
                <Link
                  href="/"
                  className="text-gray-700 hover:text-black font-medium transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {t('header.home')}
                </Link>

                <Link
                  href="/new"
                  className="text-gray-700 hover:text-black font-medium transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {t('header.new')}
                </Link>

                {/* Mobile Categories Section */}
                <div className="flex flex-col gap-2">
                  <span className="text-gray-700 font-medium">{t('common.categories')}</span>
                  <div className="pl-4 flex flex-col gap-2">
                    {categories.map((category) => (
                      <Link
                        key={category}
                        href={`/mens/${encodeURIComponent(category.toLowerCase().replace(/\s+/g, '-'))}`}
                        className="text-gray-600 hover:text-black transition-colors"
                        onClick={() => setMobileMenuOpen(false)}
                      >
                        {category}
                      </Link>
                    ))}
                    {categories.length === 0 && (
                      <span className="text-gray-500 text-sm">{t('categories.noCategories')}</span>
                    )}
                  </div>
                </div>

                <Link
                  href="/sale"
                  className="text-red-600 hover:text-red-700 font-bold transition-colors"
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {t('header.sale')}
                </Link>

                <Link
                  href="/track-order"
                  className="flex items-center gap-2 text-gray-700 hover:text-black font-medium transition-colors"
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
      <div className="bg-black text-white text-center py-2 text-sm font-medium">
        {t('header.freeShippingBanner')}
      </div>
    </header>
  );
}
