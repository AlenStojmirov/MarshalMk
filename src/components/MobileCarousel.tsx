'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import CategoryCard from './CategoryCard';

interface CategoryItem {
  title: string;
  href: string;
  imageSrc: string;
}

interface MobileCarouselProps {
  categories: CategoryItem[];
}

export default function MobileCarousel({ categories }: MobileCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const handleScroll = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const scrollLeft = container.scrollLeft;
    const width = container.offsetWidth;
    const index = Math.round(scrollLeft / width);
    setActiveIndex(index);
  }, []);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll]);

  const scrollToIndex = (index: number) => {
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTo({ left: index * container.offsetWidth, behavior: 'smooth' });
  };

  return (
    <div className="relative">
      <div
        ref={scrollRef}
        className="flex overflow-x-auto snap-x snap-mandatory scrollbar-hide"
        style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
      >
        {categories.map((category) => (
          <div
            key={category.href}
            className="w-full flex-shrink-0 snap-center"
          >
            <CategoryCard
              title={category.title}
              href={category.href}
              imageSrc={category.imageSrc}
            />
          </div>
        ))}
      </div>
      {/* Dot indicators */}
      <div className="absolute bottom-6 left-0 right-0 flex justify-center gap-2 z-10">
        {categories.map((_, index) => (
          <button
            key={index}
            onClick={(e) => {
              e.preventDefault();
              scrollToIndex(index);
            }}
            aria-label={`Go to slide ${index + 1}`}
            aria-current={index === activeIndex ? 'true' : undefined}
            className={`h-3 rounded-full transition-all duration-300 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-black/30 ${
              index === activeIndex ? 'w-8 bg-white' : 'w-3 bg-white/50'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
