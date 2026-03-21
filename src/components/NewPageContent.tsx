'use client';

import { PaginatedResult } from '@/types';
import ProductListingLayout from './ProductListingLayout';
import { useTranslation } from '@/lib/i18n';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

interface NewPageContentProps {
  paginatedData: PaginatedResult;
}

export default function NewPageContent({ paginatedData }: NewPageContentProps) {
  const { t } = useTranslation();

  return (
    <section className="min-h-screen bg-white">
      {/* Hero Section */}
      {/* <section className="relative w-full bg-stone-100">
        <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-10 py-20 md:py-28 lg:py-36">
          <p className="text-[10px] md:text-xs uppercase tracking-[0.3em] text-stone-400 mb-5">
            New Season
          </p>
          <h1 className="text-4xl md:text-5xl lg:text-6xl font-extralight uppercase tracking-[0.04em] text-stone-900 leading-[1.1] mb-5">
            {t('newProducts.pageTitle')}
          </h1>
          <p className="text-sm md:text-base text-stone-500 max-w-md mb-10 leading-relaxed">
            {t('newProducts.subtitle')}
          </p>
          <a
            href="#products"
            className="inline-block bg-stone-900 text-white text-[11px] uppercase tracking-[0.2em] px-10 py-4 hover:bg-black transition-colors duration-200"
          >
            Shop Now
          </a>
        </div>
      </section> */}

      {/* Products Section */}
      <div id="products" className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-10 py-16 md:py-20">
        <ProductListingLayout
          paginatedData={paginatedData}
          header={
            <div className="mb-10">
              <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-[11px] text-stone-400 mb-8 uppercase tracking-[0.15em]">
                <Link href="/" className="hover:text-stone-900 transition-colors duration-200">
                  {t('header.home')}
                </Link>
                <ChevronRight className="h-3 w-3" />
                <span className="text-stone-900">
                  {t('newProducts.title')}
                </span>
              </nav>
              <h1 className="text-2xl md:text-3xl font-extralight uppercase tracking-[0.08em] text-stone-900">
                {t('newProducts.pageTitle')}
              </h1>
              <p className="text-stone-400 text-sm mt-3 tracking-wide">
                {t('newProducts.subtitle')}
              </p>
            </div>
          }
          emptyState={
            <div className="text-center py-20">
              <h2 className="text-lg font-extralight uppercase tracking-[0.1em] text-stone-700 mb-3">
                {t('newProducts.noProducts')}
              </h2>
              <p className="text-stone-400 text-sm mb-10">
                {t('newProducts.checkBackSoon')}
              </p>
              <Link
                href="/"
                className="inline-block bg-stone-900 text-white text-[11px] uppercase tracking-[0.2em] px-10 py-4 hover:bg-black transition-colors duration-200"
              >
                {t('cart.continueShopping')}
              </Link>
            </div>
          }
        />
      </div>

      {/* Editorial Section */}
      <section className="border-t border-stone-200">
        <div className="max-w-3xl mx-auto px-6 sm:px-8 lg:px-10 py-20 md:py-28 text-center">
          <p className="text-[10px] md:text-xs uppercase tracking-[0.3em] text-stone-400 mb-6">
            Our Philosophy
          </p>
          <h3 className="text-2xl md:text-3xl lg:text-4xl font-extralight text-stone-900 leading-relaxed tracking-wide">
            Modern essentials for everyday wear
          </h3>
          <div className="w-12 h-px bg-stone-300 mx-auto mt-10" />
        </div>
      </section>
    </section>
  );
}
