import CategoryCard from './CategoryCard';
import MobileCarousel from './MobileCarousel';

const categories = [
  {
    title: 'Јакни',
    href: '/mens/palto',
    imageSrc: '/images/categories/jakni.svg',
  },
  {
    title: 'Дуксери',
    href: '/mens/dukser',
    imageSrc: '/images/categories/dukseri.svg',
  },
  {
    title: 'Блузи',
    href: '/mens/bluza',
    imageSrc: '/images/categories/bluzi.svg',
  },
];

export default function HomeCategoriesSection() {
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
