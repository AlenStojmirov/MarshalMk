'use client';

import { Product } from '@/types';
import ProductCard from './ProductCard';
import { useTranslation } from '@/lib/i18n';

interface ProductGridProps {
  products: Product[];
  loading?: boolean;
  /** How many cards from the top are on screen when the page opens (Task
   * 16.5): their photos load at once instead of waiting to be scrolled to,
   * the first row (two on a phone) ahead of everything else. A lazy photo
   * waits for the page's layout before it is even asked for, and on a phone
   * one of the first two is what Google times as the page's main content.
   * 0 for a grid further down a page. */
  eager?: number;
}

const FIRST_ROW_ON_PHONE = 2;

export default function ProductGrid({ products, loading, eager = 0 }: ProductGridProps) {
  const { t } = useTranslation();
  if (loading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-8 md:gap-x-6 md:gap-y-10">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="animate-pulse">
            <div className="aspect-[3/4] bg-stone-100 mb-3" />
            <div className="space-y-2">
              <div className="h-3.5 bg-stone-100 w-3/4" />
              <div className="h-3.5 bg-stone-100 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (products.length === 0) {
    return (
      <div className="text-center py-16">
        <p className="text-stone-400 text-sm uppercase tracking-wider">{t('categoryPage.noProducts')}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-x-4 gap-y-8 md:gap-x-6 md:gap-y-10">
      {products.map((product, i) => (
        <ProductCard
          key={product.id}
          product={product}
          load={i < Math.min(eager, FIRST_ROW_ON_PHONE) ? 'high' : i < eager ? 'eager' : undefined}
        />
      ))}
    </div>
  );
}
