'use client';

import * as Slider from '@radix-ui/react-slider';
import { useTranslation } from '@/lib/i18n';
import { groupSizes } from '@/lib/sizes';

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
    <aside className="w-full lg:w-60 flex-shrink-0">
      <div className="border border-stone-200 p-5 sticky top-32">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-[11px] font-medium uppercase tracking-[0.15em] text-stone-900">
            {t('categoryPage.filters')}
          </h2>
          {hasActiveFilters && (
            <button
              onClick={onClearFilters}
              className="text-[11px] text-stone-500 underline underline-offset-4 decoration-stone-300 hover:text-stone-900 hover:decoration-stone-900 transition-colors duration-200"
            >
              {t('categoryPage.clearFilters')}
            </button>
          )}
        </div>

        {/* Price Range Slider */}
        {absoluteMax > 0 && !sliderDisabled && (
          <div className="mb-6">
            <h3 className="text-[11px] uppercase tracking-[0.1em] text-stone-500 mb-4">
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
              <Slider.Track className="bg-stone-200 relative grow rounded-full h-[3px]">
                <Slider.Range className="absolute bg-stone-900 rounded-full h-full" />
              </Slider.Track>
              <Slider.Thumb
                className="block w-4 h-4 bg-white border-2 border-stone-900 rounded-full hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:ring-offset-2 transition-colors duration-150 cursor-grab active:cursor-grabbing"
                aria-label="Minimum price"
              />
              <Slider.Thumb
                className="block w-4 h-4 bg-white border-2 border-stone-900 rounded-full hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:ring-offset-2 transition-colors duration-150 cursor-grab active:cursor-grabbing"
                aria-label="Maximum price"
              />
            </Slider.Root>
            <p className="text-[11px] text-stone-400 mt-3 text-center tracking-wide">
              {formatPrice(currentMinPrice)} – {formatPrice(currentMaxPrice)}
            </p>
          </div>
        )}

        {/* Size Filter */}
        {availableSizes.length > 0 && (
          <div className="mb-6">
            <h3 className="text-[11px] uppercase tracking-[0.1em] text-stone-500 mb-3">
              {t('categoryPage.size')}
            </h3>
            <div className="space-y-3">
              {groupSizes(availableSizes.map((s) => s.size)).map((group) => (
                <div key={group.type} className="flex flex-wrap gap-2">
                  {group.sizes.map((size) => {
                    const count = availableSizes.find((s) => s.size === size)!.count;
                    return (
                      <button
                        key={size}
                        onClick={() => onSizeChange(size)}
                        className={`px-3 py-1.5 border text-[11px] tracking-wide transition-colors duration-150 ${
                          selectedSizes.includes(size)
                            ? 'bg-stone-900 text-white border-stone-900'
                            : 'border-stone-200 text-stone-600 hover:border-stone-400'
                        }`}
                        title={`${count} product(s)`}
                      >
                        {size}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
