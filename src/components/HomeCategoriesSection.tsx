'use client';

import CategoryCard from './CategoryCard';
import MobileCarousel from './MobileCarousel';
import { useTranslation } from '@/lib/i18n/useTranslation';

export default function HomeCategoriesSection() {
  const { t } = useTranslation();

  const categories = [
    {
      title: t('home.categoryPolos'),
      href: '/mens/polos',
      imageSrc: 'https://i.postimg.cc/MpmMDHmB/well2.webp',
    },
    {
      title: t('home.categoryJeans'),
      href: '/mens/jeans',
      imageSrc: 'https://i.postimg.cc/qRPBXxPw/Fotografija-11.jpg',
    },
    {
      title: t('home.categoryVests'),
      href: '/mens/vests',
      imageSrc: 'https://i.postimg.cc/jjqWkTM7/well7.webp',
    },
  ];

  return (
    <section>
      {/* Desktop: 3-column grid */}
      <div className="hidden md:grid md:grid-cols-3 h-[600px]">
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
