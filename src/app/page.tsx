'use client';

import { useMemo } from 'react';
import { useProducts } from '@/hooks/useProducts';
import HomeCategoriesSection from '@/components/HomeCategoriesSection';
import HomeBenefitsSection from '@/components/HomeBenefitsSection';
import NewProductsSection from '@/components/NewProductsSection';

export default function Home() {
  const { products, loading, error } = useProducts();

  // Get 12 newest products (already sorted by createdAt desc from hook)
  const newProducts = useMemo(() => {
    return products.slice(0, 12);
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
      {/* Section 1: Category Heroes */}
      <HomeCategoriesSection />

      {/* Section 2: Store Benefits */}
      <HomeBenefitsSection />

      {/* Section 3: New Products */}
      <NewProductsSection products={newProducts} loading={loading} />
    </div>
  );
}
