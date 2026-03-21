'use client';

import { PaginatedResult } from '@/types';
import ProductListingLayout from './ProductListingLayout';
import { useTranslation } from '@/lib/i18n';
import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

interface CategoryPageContentProps {
  paginatedData: PaginatedResult;
  categoryName: string;
}

export default function CategoryPageContent({
  paginatedData,
  categoryName,
}: CategoryPageContentProps) {
  const { t } = useTranslation();

  return (
    <section className="min-h-screen bg-gray-50" aria-labelledby="category-heading">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <ProductListingLayout
          paginatedData={paginatedData}
          header={
            <>
              <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-sm text-gray-500 mb-6">
                <Link href="/" className="hover:text-gray-900 transition-colors">
                  {t('header.home')}
                </Link>
                <ChevronRight className="h-4 w-4" />
                <span className="text-gray-900 font-medium">{t('categoryNames.'+ categoryName)}</span>
              </nav>

              <div className="mb-8">
                <h1 id="category-heading" className="text-2xl md:text-3xl font-bold text-gray-900">
                  {t('categoryNames.'+ categoryName)}
                </h1>
              </div>
            </>
          }
        />
      </div>
    </section>
  );
}
