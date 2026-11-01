'use client';

import CategoryCard from './CategoryCard';
import MobileCarousel from './MobileCarousel';
import { useTranslation } from '@/lib/i18n/useTranslation';
import type { GroupKey } from '@/config/categories';

/** One of the home page's big cards: a group of this season, with a photo off its shelf. */
export interface HomeCard {
  group: GroupKey;
  href: string;
  imageSrc: string;
}

const DESKTOP_COLUMNS = ['', 'md:grid-cols-1', 'md:grid-cols-2', 'md:grid-cols-3'];

/**
 * The three groups this season leads with (Task 2.4): jackets, knitwear and
 * shirts in November, T-shirts, shirts and shorts in July. The cards are
 * chosen on the server (`app/page.tsx`); until 2.4 they were Polos, Jeans and
 * Vests all year, with photos from an image host.
 */
export default function HomeCategoriesSection({ cards }: { cards: HomeCard[] }) {
  const { t } = useTranslation();

  if (cards.length === 0) return null;

  const categories = cards.map((c) => ({
    title: t(`categoryGroups.${c.group}`),
    href: c.href,
    imageSrc: c.imageSrc,
  }));

  return (
    <section>
      {/* Desktop: one column per card */}
      <div className={`hidden md:grid ${DESKTOP_COLUMNS[Math.min(categories.length, 3)]} h-[600px]`}>
        {categories.map((category) => (
          <CategoryCard
            key={category.href}
            title={category.title}
            href={category.href}
            imageSrc={category.imageSrc}
          />
        ))}
      </div>

      {/* Mobile: Carousel */}
      <div className="md:hidden">
        <MobileCarousel categories={categories} />
      </div>
    </section>
  );
}
