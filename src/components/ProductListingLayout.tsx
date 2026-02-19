'use client';

import { ReactNode, useCallback, useState, useTransition } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { PaginatedResult } from '@/types';
import ProductGrid from './ProductGrid';
import CategorySidebar from './CategorySidebar';
import SortSelect, { SortOption } from './SortSelect';
import Pagination from './Pagination';
import { useTranslation } from '@/lib/i18n';

interface ProductListingLayoutProps {
  paginatedData: PaginatedResult;
  header?: ReactNode;
  emptyState?: ReactNode;
}

export default function ProductListingLayout({
  paginatedData,
  header,
  emptyState,
}: ProductListingLayoutProps) {
  const { products, totalCount, totalPages, currentPage, filterMeta } = paginatedData;
  const { priceRange, availableSizes } = filterMeta;

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const { t } = useTranslation();

  // Local price state for smooth slider dragging
  const urlMinPrice = searchParams.get('minPrice') ? Number(searchParams.get('minPrice')) : priceRange.min;
  const urlMaxPrice = searchParams.get('maxPrice') ? Number(searchParams.get('maxPrice')) : priceRange.max;
  const [localPriceRange, setLocalPriceRange] = useState<[number, number]>([urlMinPrice, urlMaxPrice]);

  const sortValue = searchParams.get('sort') || 'latest';
  const selectedSizes = searchParams.get('sizes')?.split(',').filter(Boolean) || [];

  const hasActiveFilters =
    searchParams.has('minPrice') ||
    searchParams.has('maxPrice') ||
    searchParams.has('sizes');

  const sortOptions: SortOption[] = [
    { label: t('categoryPage.sortLatest'), value: 'latest' },
    { label: t('categoryPage.sortPriceAsc'), value: 'price_asc' },
    { label: t('categoryPage.sortPriceDesc'), value: 'price_desc' },
  ];

  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      // Reset page to 1 when filters change
      params.delete('page');
      Object.entries(updates).forEach(([key, value]) => {
        if (value === null) {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      });
      const qs = params.toString();
      startTransition(() => {
        router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
      });
    },
    [router, pathname, searchParams, startTransition]
  );

  const handlePriceChange = useCallback((min: number, max: number) => {
    setLocalPriceRange([min, max]);
  }, []);

  const handlePriceCommit = useCallback(
    (min: number, max: number) => {
      const isDefault = min === priceRange.min && max === priceRange.max;
      updateParams({
        minPrice: isDefault ? null : String(min),
        maxPrice: isDefault ? null : String(max),
      });
    },
    [priceRange, updateParams]
  );

  const handleSortChange = useCallback(
    (value: string) => {
      updateParams({ sort: value === 'latest' ? null : value });
    },
    [updateParams]
  );

  const handleSizeChange = useCallback(
    (size: string) => {
      const newSizes = selectedSizes.includes(size)
        ? selectedSizes.filter((s) => s !== size)
        : [...selectedSizes, size];
      updateParams({ sizes: newSizes.length > 0 ? newSizes.join(',') : null });
    },
    [selectedSizes, updateParams]
  );

  const handleClearFilters = useCallback(() => {
    setLocalPriceRange([priceRange.min, priceRange.max]);
    updateParams({ minPrice: null, maxPrice: null, sizes: null, sort: null });
  }, [priceRange, updateParams]);

  const sidebarProps = {
    priceRange,
    availableSizes,
    currentMinPrice: localPriceRange[0],
    currentMaxPrice: localPriceRange[1],
    onPriceChange: handlePriceChange,
    onPriceCommit: handlePriceCommit,
    selectedSizes,
    onSizeChange: handleSizeChange,
    onClearFilters: handleClearFilters,
  };

  return (
    <div className={isPending ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
      {header}

      {totalCount > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
          <p className="text-stone-400 text-[13px] tracking-wide">
            {hasActiveFilters
              ? t('categoryPage.filterCount', {
                  filtered: totalCount.toString(),
                  total: totalCount.toString(),
                })
              : t('categoryPage.productCount', { count: totalCount.toString() })}
          </p>
          {products.length > 0 && (
            <SortSelect
              options={sortOptions}
              value={sortValue}
              onSortChange={handleSortChange}
            />
          )}
        </div>
      )}

      {totalCount === 0 && !hasActiveFilters ? (
        emptyState || <ProductGrid products={[]} />
      ) : totalCount === 0 && hasActiveFilters ? (
        <div className="flex flex-col lg:flex-row gap-10">
          <div className="hidden lg:block">
            <CategorySidebar {...sidebarProps} />
          </div>
          <div className="flex-1">
            <div className="text-center py-16">
              <p className="text-stone-400 text-sm tracking-wide">{t('categoryPage.noResults') || 'No products match your filters'}</p>
              <button
                onClick={handleClearFilters}
                className="mt-4 px-4 py-2 text-[13px] text-stone-900 underline underline-offset-4 decoration-stone-300 hover:decoration-stone-900 transition-colors duration-200"
              >
                {t('categoryPage.clearFilters')}
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex flex-col lg:flex-row gap-10">
          <div className="hidden lg:block">
            <CategorySidebar {...sidebarProps} />
          </div>

          <div className="lg:hidden">
            <button
              className="w-full py-3 mb-6 border border-stone-200 text-stone-700 text-[11px] uppercase tracking-[0.15em] hover:border-stone-400 transition-colors duration-200"
              onClick={() => setShowMobileFilters((prev) => !prev)}
            >
              {t('categoryPage.filters')}
            </button>
            {showMobileFilters && (
              <div className="mb-6">
                <CategorySidebar {...sidebarProps} />
              </div>
            )}
          </div>

          <div className="flex-1">
            <ProductGrid products={products} />
            <Pagination currentPage={currentPage} totalPages={totalPages} />
          </div>
        </div>
      )}
    </div>
  );
}
