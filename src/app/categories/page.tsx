'use client';

import Link from 'next/link';
import { useProducts } from '@/hooks/useProducts';
import { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';

export default function CategoriesPage() {
  const { products, loading } = useProducts();
  const { t } = useTranslation();

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    products.forEach(product => {
      counts[product.category] = (counts[product.category] || 0) + 1;
    });
    return counts;
  }, [products]);

  const categories = Object.keys(categoryCounts).sort();

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">{t('categories.title')}</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg shadow-md p-6 animate-pulse">
              <div className="h-6 bg-gray-200 rounded w-2/3 mb-2" />
              <div className="h-4 bg-gray-200 rounded w-1/3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">{t('categories.title')}</h1>

      {categories.length === 0 ? (
        <p className="text-gray-500 text-center py-12">{t('categories.noCategories')}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map(category => (
            <Link
              key={category}
              href={`/?category=${encodeURIComponent(category)}`}
              className="group bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                    {category}
                  </h2>
                  <p className="text-gray-500">
                    {t('categories.productCount', { count: categoryCounts[category].toString() })}
                  </p>
                </div>
                <ChevronRight className="h-6 w-6 text-gray-400 group-hover:text-blue-600 transition-colors" />
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
