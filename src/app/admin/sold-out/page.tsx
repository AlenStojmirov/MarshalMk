'use client';

import { useState, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useProducts } from '@/hooks/useProducts';
import { Product } from '@/types';
import {
  ArrowLeft,
  Package,
  AlertTriangle,
  Search,
  X,
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useTranslation } from '@/lib/i18n';

function ProductFilter({
  filter,
  setFilter,
  brands,
  categories,
}: {
  filter: { brand: string; category: string; search: string };
  setFilter: (f: { brand: string; category: string; search: string }) => void;
  brands: string[];
  categories: string[];
}) {
  const { t } = useTranslation();

  const clearFilters = () => {
    setFilter({ brand: '', category: '', search: '' });
  };

  const hasFilters = filter.brand || filter.category || filter.search;

  return (
    <div className="bg-white rounded-lg shadow-md p-3 sm:p-4 mb-4 sm:mb-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Search */}
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder={t('soldOut.searchPlaceholder')}
            value={filter.search}
            onChange={e => setFilter({ ...filter, search: e.target.value })}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm sm:text-base"
          />
        </div>

        {/* Brand */}
        <div>
          <select
            value={filter.brand}
            onChange={e => setFilter({ ...filter, brand: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm sm:text-base"
          >
            <option value="">{t('soldOut.allBrands')}</option>
            {brands.map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        {/* Category */}
        <div>
          <select
            value={filter.category}
            onChange={e => setFilter({ ...filter, category: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm sm:text-base"
          >
            <option value="">{t('soldOut.allCategories')}</option>
            {categories.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {/* Clear button */}
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-red-100 text-red-700 rounded-lg font-medium hover:bg-red-200 transition-colors text-sm sm:text-base"
          >
            <X className="h-4 w-4" />
            {t('soldOut.clearFilters')}
          </button>
        )}
      </div>
    </div>
  );
}

function SoldOutView() {
  const { t } = useTranslation();
  const { products, loading } = useProducts();
  const [filter, setFilter] = useState({ brand: '', category: '', search: '' });

  // Filter for sold out products (all sizes have quantity = 0)
  const soldOutProducts = useMemo(() => {
    return products.filter(p => {
      // No sizes defined - check stock
      if (!p.sizes || p.sizes.length === 0) {
        return p.stock <= 0;
      }
      // Has sizes - all must be 0
      return p.sizes.every(sz => sz.quantity <= 0);
    });
  }, [products]);

  // Get unique brands and categories for filter
  const brands = useMemo(() => {
    return [...new Set(soldOutProducts.map(p => p.brand).filter(Boolean))] as string[];
  }, [soldOutProducts]);

  const categories = useMemo(() => {
    return [...new Set(soldOutProducts.map(p => p.category).filter(Boolean))];
  }, [soldOutProducts]);

  // Apply filters
  const filteredProducts = useMemo(() => {
    return soldOutProducts.filter(p => {
      if (filter.brand && p.brand !== filter.brand) return false;
      if (filter.category && p.category !== filter.category) return false;
      if (filter.search) {
        const search = filter.search.toLowerCase();
        if (!p.name.toLowerCase().includes(search) && !p.id.toLowerCase().includes(search)) {
          return false;
        }
      }
      return true;
    });
  }, [soldOutProducts, filter]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 sm:mb-8">
        <div className="flex items-center gap-3 sm:gap-4">
          <Link
            href="/admin"
            className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 sm:h-8 sm:w-8 text-red-500" />
              {t('soldOut.title')}
            </h1>
            <p className="text-sm sm:text-base text-gray-500">
              {t('soldOut.subtitle', { count: soldOutProducts.length })}
            </p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <ProductFilter
        filter={filter}
        setFilter={setFilter}
        brands={brands}
        categories={categories}
      />

      {/* Products Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-8 sm:py-12">
          <div className="animate-spin h-10 w-10 sm:h-12 sm:w-12 border-4 border-blue-600 border-t-transparent rounded-full" />
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="text-center py-8 sm:py-12 bg-white rounded-lg shadow-md px-4">
          <Package className="h-10 w-10 sm:h-12 sm:w-12 mx-auto text-gray-300 mb-3 sm:mb-4" />
          <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-1">
            {soldOutProducts.length === 0 ? t('soldOut.noSoldOut') : t('soldOut.noResults')}
          </h3>
          <p className="text-sm sm:text-base text-gray-500">
            {soldOutProducts.length === 0 ? t('soldOut.allInStock') : t('soldOut.tryDifferentFilters')}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
          {filteredProducts.map(product => (
            <Link
              key={product.id}
              href={`/admin/product/${product.id}`}
              className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow"
            >
              <div className="p-3 sm:p-4">
                <div className="flex items-start gap-2 sm:gap-3">
                  {product.imageUrl ? (
                    <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                      <Image
                        src={product.imageUrl}
                        alt={product.name}
                        fill
                        className="object-cover"
                        sizes="64px"
                      />
                    </div>
                  ) : (
                    <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                      <Package className="h-5 w-5 sm:h-6 sm:w-6 text-gray-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-gray-900 truncate text-sm sm:text-base">{product.name}</h3>
                    <p className="text-xs sm:text-sm text-gray-500 truncate">{product.brand} | {product.category}</p>
                    <p className="font-bold text-gray-900 mt-1 text-sm sm:text-base">{product.price.toFixed(2)} ден.</p>
                  </div>
                </div>

                {/* Sizes */}
                {product.sizes && product.sizes.length > 0 && (
                  <div className="mt-2 sm:mt-3 flex flex-wrap gap-1">
                    {product.sizes.map(sz => (
                      <span
                        key={sz.size}
                        className="px-1.5 sm:px-2 py-0.5 sm:py-1 text-xs rounded bg-red-100 text-red-700"
                      >
                        {sz.size}: 0
                      </span>
                    ))}
                  </div>
                )}

                <div className="mt-2 sm:mt-3 flex items-center justify-between">
                  <span className="inline-flex items-center px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full text-xs font-medium bg-red-100 text-red-700">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    {t('soldOut.outOfStock')}
                  </span>
                  <span className="text-xs sm:text-sm text-blue-600 font-medium">
                    {t('soldOut.viewDetails')} &rarr;
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SoldOutPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-500 mb-4">Please log in to access this page.</p>
          <Link href="/admin" className="text-blue-600 hover:text-blue-700 font-medium">
            Go to Admin Login
          </Link>
        </div>
      </div>
    );
  }

  return <SoldOutView />;
}
