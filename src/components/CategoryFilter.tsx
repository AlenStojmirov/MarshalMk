'use client';

import { useTranslation } from '@/lib/i18n';

interface CategoryFilterProps {
  categories: string[];
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
}

export default function CategoryFilter({
  categories,
  selectedCategory,
  onCategoryChange,
}: CategoryFilterProps) {
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onCategoryChange('')}
        className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-150 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${
          selectedCategory === ''
            ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
            : 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:shadow-sm'
        }`}
      >
        {t('common.all')}
      </button>
      {categories.map(category => (
        <button
          key={category}
          onClick={() => onCategoryChange(category)}
          className={`px-4 py-2 rounded-full text-sm font-medium transition-all duration-150 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${
            selectedCategory === category
              ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200 hover:shadow-sm'
          }`}
        >
          {category}
        </button>
      ))}
    </div>
  );
}
