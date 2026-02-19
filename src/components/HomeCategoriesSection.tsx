import CategoryCard from './CategoryCard';
import MobileCarousel from './MobileCarousel';

const categories = [
  {
    title: 'Поло Маици',
    href: '/mens/majca',
    imageSrc: '/images/products/x2denim-1757282400-5-1.png',
  },
  {
    title: 'Јакни',
    href: '/mens/palto',
    imageSrc: '/images/products/dynamo-1768608000-3-1.png',
  },
  {
    title: 'Блузи',
    href: '/mens/bluza',
    imageSrc: '/images/products/dynamo-1768608000-5-1.png',
  }
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
