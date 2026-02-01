'use client';

import * as Slider from '@radix-ui/react-slider';
import { useTranslation } from '@/lib/i18n';

function formatPrice(value: number): string {
  return value.toLocaleString('mk-MK') + ' ден.';
}

interface CategorySidebarProps {
  priceRange: { min: number; max: number };
  availableSizes: { size: string; count: number }[];
  currentMinPrice: number;
  currentMaxPrice: number;
  onPriceChange: (min: number, max: number) => void;
  onPriceCommit: (min: number, max: number) => void;
  selectedSizes: string[];
  onSizeChange: (size: string) => void;
  onClearFilters: () => void;
}

export default function CategorySidebar({
  priceRange,
  availableSizes,
  currentMinPrice,
  currentMaxPrice,
  onPriceChange,
  onPriceCommit,
  selectedSizes,
  onSizeChange,
  onClearFilters,
}: CategorySidebarProps) {
  const { t } = useTranslation();

  const { min: absoluteMin, max: absoluteMax } = priceRange;

  const hasActiveFilters =
    currentMinPrice !== absoluteMin ||
    currentMaxPrice !== absoluteMax ||
    selectedSizes.length > 0;

  const sliderDisabled = absoluteMin === absoluteMax;

  return (
    <aside className="w-full lg:w-64 flex-shrink-0">
      <div className="bg-white rounded-lg shadow-sm p-4 sticky top-32">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-lg text-gray-900">
            {t('categoryPage.filters')}
          </h2>
          {hasActiveFilters && (
            <button
              onClick={onClearFilters}
              className="text-sm text-blue-600 hover:text-blue-800 transition-colors"
            >
              {t('categoryPage.clearFilters')}
            </button>
          )}
        </div>

        {/* Price Range Slider */}
        {absoluteMax > 0 && !sliderDisabled && (
          <div className="mb-6">
            <h3 className="font-medium text-gray-700 mb-3">
              {t('categoryPage.price')}
            </h3>
            <Slider.Root
              className="relative flex items-center select-none touch-none w-full h-5"
              min={absoluteMin}
              max={absoluteMax}
              step={50}
              value={[currentMinPrice, currentMaxPrice]}
              onValueChange={([min, max]: number[]) => onPriceChange(min, max)}
              onValueCommit={([min, max]: number[]) => onPriceCommit(min, max)}
              minStepsBetweenThumbs={1}
            >
              <Slider.Track className="bg-gray-200 relative grow rounded-full h-[6px]">
                <Slider.Range className="absolute bg-blue-600 rounded-full h-full" />
              </Slider.Track>
              <Slider.Thumb
                className="block w-5 h-5 bg-white border-2 border-blue-600 rounded-full shadow-md hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 transition-colors cursor-grab active:cursor-grabbing"
                aria-label="Minimum price"
              />
              <Slider.Thumb
                className="block w-5 h-5 bg-white border-2 border-blue-600 rounded-full shadow-md hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 transition-colors cursor-grab active:cursor-grabbing"
                aria-label="Maximum price"
              />
            </Slider.Root>
            <p className="text-sm text-gray-500 mt-2 text-center">
              {formatPrice(currentMinPrice)} – {formatPrice(currentMaxPrice)}
            </p>
          </div>
        )}

        {/* Size Filter */}
        {availableSizes.length > 0 && (
          <div className="mb-6">
            <h3 className="font-medium text-gray-700 mb-2">
              {t('categoryPage.size')}
            </h3>
            <div className="flex flex-wrap gap-2">
              {availableSizes.map(({ size, count }) => (
                <button
                  key={size}
                  onClick={() => onSizeChange(size)}
                  className={`px-3 py-1 border rounded text-sm transition-colors ${
                    selectedSizes.includes(size)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-300 text-gray-600 hover:border-gray-400'
                  }`}
                  title={`${count} product(s)`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
