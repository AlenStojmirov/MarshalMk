'use client';

import { PaginatedResult } from '@/types';
import ProductListingLayout from './ProductListingLayout';
import { useTranslation } from '@/lib/i18n';
import Link from 'next/link';
import { ChevronRight, Sparkles } from 'lucide-react';

interface NewPageContentProps {
  paginatedData: PaginatedResult;
}

export default function NewPageContent({ paginatedData }: NewPageContentProps) {
  const { t } = useTranslation();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ProductListingLayout
          paginatedData={paginatedData}
          header={
            <>
              <nav className="flex items-center gap-2 text-sm text-gray-500 mb-6">
                <Link href="/" className="hover:text-gray-900 transition-colors">
                  {t('header.home')}
                </Link>
                <ChevronRight className="h-4 w-4" />
                <span className="text-gray-900 font-medium">
                  {t('newProducts.title')}
                </span>
              </nav>

              <div className="mb-8 text-center">
                <div className="flex items-center justify-center gap-3 mb-4">
                  <Sparkles className="h-8 w-8 text-blue-600" />
                  <h1 className="text-3xl md:text-4xl font-bold text-gray-900">
                    {t('newProducts.pageTitle')}
                  </h1>
                </div>
                <p className="text-gray-600 text-lg">
                  {t('newProducts.subtitle')}
                </p>
              </div>
            </>
          }
          emptyState={
            <div className="text-center py-16">
              <Sparkles className="h-16 w-16 text-gray-300 mx-auto mb-4" />
              <h2 className="text-xl font-semibold text-gray-700 mb-2">
                {t('newProducts.noProducts')}
              </h2>
              <p className="text-gray-500">
                {t('newProducts.checkBackSoon')}
              </p>
              <Link
                href="/"
                className="inline-block mt-6 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
              >
                {t('cart.continueShopping')}
              </Link>
            </div>
          }
        />
      </div>
    </div>
  );
}
