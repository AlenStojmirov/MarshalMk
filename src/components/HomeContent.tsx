'use client';

import type { Product } from '@/types';
import HomeCategoriesSection, { type HomeCard } from './HomeCategoriesSection';
import HomeBenefitsSection from './HomeBenefitsSection';
import NewProductsSection from './NewProductsSection';
import { useTranslation } from '@/lib/i18n';

/** The home page, drawn from what the server read (`app/page.tsx`). */
export default function HomeContent({ cards, newProducts }: { cards: HomeCard[]; newProducts: Product[] }) {
  const { t } = useTranslation();

  return (
    <div>
      <h1 className="sr-only">{t('home.seoTitle')}</h1>

      {/* Section 1: this season's groups */}
      <HomeCategoriesSection cards={cards} />

      {/* Section 2: Store Benefits */}
      <HomeBenefitsSection />

      {/* Section 3: New Products */}
      <NewProductsSection products={newProducts} />
    </div>
  );
}
