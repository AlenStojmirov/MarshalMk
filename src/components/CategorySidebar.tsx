'use client';

import * as Slider from '@radix-ui/react-slider';
import { useTranslation } from '@/lib/i18n';
import { groupSizes, sizeLabel } from '@/lib/sizes';
import { FACETS, facetLabel, facetSwatch } from '@/lib/facets';
import type { FacetParam, PaginatedResult } from '@/types';

interface CategorySidebarProps {
  priceRange: { min: number; max: number };
  availableSizes: { size: string; count: number }[];
  currentMinPrice: number;
  currentMaxPrice: number;
  onPriceChange: (min: number, max: number) => void;
  onPriceCommit: (min: number, max: number) => void;
  selectedSizes: string[];
  onSizeChange: (size: string) => void;
  /** Colour, material, cut (9.9): the values on this page, with how many products have each. */
  facets: NonNullable<PaginatedResult['filterMeta']['facets']>;
  selectedFacets: Record<FacetParam, string[]>;
  onFacetChange: (facet: FacetParam, value: string) => void;
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
  facets,
  selectedFacets,
  onFacetChange,
  onClearFilters,
}: CategorySidebarProps) {
  const { t, language, price } = useTranslation();

  const { min: absoluteMin, max: absoluteMax } = priceRange;

  const hasActiveFilters =
    currentMinPrice !== absoluteMin ||
    currentMaxPrice !== absoluteMax ||
    selectedSizes.length > 0 ||
    FACETS.some((f) => selectedFacets[f].length > 0);

  const lang = language === 'en' ? 'en' : 'mk';
  // A filter shows when it can split the page: two values or more, or one already ticked.
  const shownFacets = FACETS.filter((f) => (facets[f]?.length ?? 0) >= 2 || selectedFacets[f].length > 0);

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
                aria-label={t('categoryPage.minPrice')}
              />
              <Slider.Thumb
                className="block w-4 h-4 bg-white border-2 border-stone-900 rounded-full hover:bg-stone-50 focus:outline-none focus:ring-2 focus:ring-stone-400 focus:ring-offset-2 transition-colors duration-150 cursor-grab active:cursor-grabbing"
                aria-label={t('categoryPage.maxPrice')}
              />
            </Slider.Root>
            <p className="text-[11px] text-stone-400 mt-3 text-center tracking-wide">
              {price(currentMinPrice)} – {price(currentMaxPrice)}
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
                        className={`px-3 py-1.5 border text-[11px] tracking-wide transition-all duration-150 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-offset-1 ${
                          selectedSizes.includes(size)
                            ? 'bg-stone-900 text-white border-stone-900 shadow-sm'
                            : 'border-stone-200 text-stone-600 hover:border-stone-900 hover:text-stone-900 hover:shadow-sm'
                        }`}
                        title={t('categories.productCount', { count })}
                      >
                        {sizeLabel(size, (language === 'en' ? 'en' : 'mk'))}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Colour, material, cut (9.9) */}
        {shownFacets.map((facet) => (
          <div key={facet} className="mb-6 last:mb-0">
            <h3 className="text-[11px] uppercase tracking-[0.1em] text-stone-500 mb-3">
              {t(`categoryPage.${facet}`)}
            </h3>
            <div className="flex flex-wrap gap-2">
              {(facets[facet] ?? []).map(({ value, count }) => {
                const active = selectedFacets[facet].includes(value);
                const swatch = facetSwatch(facet, value);
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => onFacetChange(facet, value)}
                    aria-pressed={active}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 border text-[11px] tracking-wide transition-all duration-150 active:scale-95 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-offset-1 ${
                      active
                        ? 'bg-stone-900 text-white border-stone-900 shadow-sm'
                        : 'border-stone-200 text-stone-600 hover:border-stone-900 hover:text-stone-900 hover:shadow-sm'
                    }`}
                  >
                    {swatch && (
                      <span
                        aria-hidden="true"
                        className="inline-block h-2.5 w-2.5 rounded-full border border-stone-300"
                        style={{ backgroundColor: swatch }}
                      />
                    )}
                    {facetLabel(facet, value, lang)}
                    <span className={active ? 'text-stone-300' : 'text-stone-400'}>{count}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}
