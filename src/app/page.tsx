'use client';

import { useMemo } from 'react';
import { useProducts } from '@/hooks/useProducts';
import HomeCategoriesSection from '@/components/HomeCategoriesSection';
import HomeBenefitsSection from '@/components/HomeBenefitsSection';
import NewProductsSection from '@/components/NewProductsSection';
import { useTranslation } from '@/lib/i18n';

export default function Home() {
  const { t } = useTranslation();
  const { products, loading, error } = useProducts();

  // Get 12 newest available products (already sorted by createdAt desc from hook)
  const newProducts = useMemo(() => {
    return products.filter((p) => p.stock > 0 && p.isVisible).slice(0, 12);
  }, [products]);

  if (error) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="text-center py-12">
          <p className="text-red-500">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="sr-only">{t('home.seoTitle')}</h1>

      {/* Section 1: Category Heroes */}
      <HomeCategoriesSection />

      {/* Section 2: Store Benefits */}
      <HomeBenefitsSection />

      {/* Section 3: New Products */}
      <NewProductsSection products={newProducts} loading={loading} />
    </div>
  );
}
