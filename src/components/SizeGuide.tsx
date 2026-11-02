'use client';

import { useState, type FormEvent } from 'react';
import { Ruler } from 'lucide-react';
import type { Measurements, ProductSize, SizeAdvice } from '@/types';
import { MEASURES } from '@/lib/attributes';
import { canonicalSize, sizeLabel, sortSizes } from '@/lib/sizes';
import {
  MEASURE_LIMITS,
  formatRange,
  suggestSize,
  type SizeChart,
  type SizeSuggestion,
} from '@/lib/size-chart';
import { useTranslation } from '@/lib/i18n';
import { Fold } from './ProductDetails';

export const SIZE_GUIDE_ID = 'size-guide';

interface SizeGuideProps {
  chart: SizeChart | null;
  /** Measured in the shop, garment laid flat (9.5): shown beside the standard chart. */
  measurements: Measurements;
  sizes: ProductSize[];
  fit?: string;
  advice?: SizeAdvice;
  selectedSize: string | null;
  onChoose: (size: string) => void;
  open: boolean;
  onToggle: (open: boolean) => void;
}

/**
 * "Size and fit" (Task 9.9): the standard body chart for this product's sizes,
 * "find my size" from one measurement, and the model's own garment
 * measurements when someone measured it. Nothing when there is neither.
 */
export default function SizeGuide({
  chart,
  measurements,
  sizes,
  fit,
  advice,
  selectedSize,
  onChoose,
  open,
  onToggle,
}: SizeGuideProps) {
  const { t, language, number } = useTranslation();
  const lang = language === 'en' ? 'en' : 'mk';
  const [value, setValue] = useState('');
  const [invalid, setInvalid] = useState(false);
  const [suggestion, setSuggestion] = useState<SizeSuggestion | null>(null);

  const measuredSizes = sortSizes(Object.keys(measurements ?? {}).filter((s) => Object.keys(measurements[s] ?? {}).length));
  const measureKeys = Object.keys(MEASURES).filter((m) => measuredSizes.some((s) => measurements[s][m] !== undefined));
  if (!chart && measuredSizes.length === 0) return null;

  const selected = selectedSize ? canonicalSize(selectedSize) : null;
  const example = chart?.measure === 'waist' ? 85 : 100;

  const find = (e: FormEvent) => {
    e.preventDefault();
    if (!chart) return;
    const cm = Number(value.replace(',', '.').trim());
    if (!Number.isFinite(cm) || cm < MEASURE_LIMITS.min || cm > MEASURE_LIMITS.max) {
      setInvalid(true);
      setSuggestion(null);
      return;
    }
    setInvalid(false);
    setSuggestion(suggestSize(chart, cm, fit, advice));
  };

  // The suggested size against this product's shelf: pick it, or say why not.
  const shelf = (size: string) => sizes.find((s) => canonicalSize(s.size) === size);
  const suggested = suggestion?.kind === 'size' ? suggestion : null;
  const onShelf = suggested ? shelf(suggested.size) : undefined;

  return (
    <Fold id={SIZE_GUIDE_ID} title={t('product.sizeGuide.title')} open={open} onToggle={onToggle}>
      {chart && (
        <>
          <p className="text-xs text-stone-500">{t('product.sizeGuide.intro')}</p>
          <p className="text-xs text-stone-700 font-medium mt-1 mb-3">{t('product.sizeGuide.approx')}</p>
          <table className="w-full text-sm border-collapse">
            <caption className="sr-only">{t('product.sizeGuideLink')}</caption>
            <thead>
              <tr className="text-[11px] uppercase tracking-[0.1em] text-stone-400">
                <th scope="col" className="text-left font-normal py-2 pr-3">{t('product.sizeGuide.size')}</th>
                {chart.columns.map((c) => (
                  <th key={c} scope="col" className="text-left font-normal py-2 pr-3">
                    {t(`product.sizeGuide.${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {chart.rows.map((r) => {
                const isSelected = selected === r.size;
                return (
                  <tr
                    key={r.size}
                    className={`border-t border-stone-100 ${isSelected ? 'bg-stone-100 text-stone-900' : 'text-stone-700'}`}
                  >
                    <th scope="row" className="text-left font-medium py-2 pr-3 pl-1">{sizeLabel(r.size, lang)}</th>
                    {chart.columns.map((c) => (
                      <td key={c} className="py-2 pr-3 tabular-nums">{r[c] ? formatRange(r[c]!) : '—'}</td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
          {chart.system === 'waist' && <p className="mt-2 text-xs text-stone-400">{t('product.sizeGuide.noteWaist')}</p>}
          {chart.system === 'eu' && chart.measure === 'chest' && (
            <p className="mt-2 text-xs text-stone-400">{t('product.sizeGuide.noteEu')}</p>
          )}

          <div className="mt-5">
            <p className="text-xs uppercase tracking-[0.1em] text-stone-500 mb-1">{t('product.sizeGuide.howTitle')}</p>
            {chart.measure === 'chest' && <p className="text-xs text-stone-500">{t('product.sizeGuide.howChest')}</p>}
            <p className="text-xs text-stone-500">{t('product.sizeGuide.howWaist')}</p>
          </div>

          <form onSubmit={find} className="mt-5 p-4 bg-stone-50 border border-stone-200" noValidate>
            <p className="flex items-center gap-2 text-xs uppercase tracking-[0.15em] text-stone-900 mb-3">
              <Ruler className="h-4 w-4" aria-hidden="true" />
              {t('product.sizeGuide.finderTitle')}
            </p>
            <label htmlFor="size-finder-cm" className="block text-xs text-stone-600 mb-1.5">
              {t(chart.measure === 'chest' ? 'product.sizeGuide.finderChest' : 'product.sizeGuide.finderWaist')}
            </label>
            <div className="flex gap-2">
              <input
                id="size-finder-cm"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder={String(example)}
                aria-invalid={invalid}
                aria-describedby={invalid ? 'size-finder-error' : undefined}
                className="w-28 h-10 px-3 border border-stone-300 bg-white text-sm text-stone-900 focus:outline-none focus:border-stone-900"
              />
              <button
                type="submit"
                className="h-10 px-5 bg-stone-900 text-white text-xs uppercase tracking-[0.15em] hover:bg-stone-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-offset-2"
              >
                {t('product.sizeGuide.finderSubmit')}
              </button>
            </div>
            <div aria-live="polite" className="mt-3 text-sm">
              {invalid && (
                <p id="size-finder-error" className="text-red-700">
                  {t('product.sizeGuide.finderInvalid', { example })}
                </p>
              )}
              {suggestion?.kind === 'below' && <p className="text-stone-700">{t('product.sizeGuide.below')}</p>}
              {suggestion?.kind === 'above' && <p className="text-stone-700">{t('product.sizeGuide.above')}</p>}
              {suggested && (
                <div className="space-y-1.5">
                  <p className="text-stone-900 font-medium">
                    {t('product.sizeGuide.result', { size: sizeLabel(suggested.size, lang) })}
                  </p>
                  <p className="text-stone-600">
                    {t(`product.sizeGuide.reason.${suggested.reason}`, {
                      alternative: suggested.alternative ? sizeLabel(suggested.alternative, lang) : '',
                    })}
                  </p>
                  <p className="text-xs text-stone-500">{t('product.sizeGuide.resultNote')}</p>
                  {!onShelf ? (
                    <p className="text-stone-600">{t('product.sizeGuide.notMade', { size: sizeLabel(suggested.size, lang) })}</p>
                  ) : onShelf.quantity > 0 ? (
                    <button
                      type="button"
                      onClick={() => onChoose(onShelf.size)}
                      className="mt-1 px-4 py-2 border border-stone-900 text-xs uppercase tracking-[0.15em] text-stone-900 hover:bg-stone-900 hover:text-white transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-offset-1"
                    >
                      {t('product.sizeGuide.choose', { size: sizeLabel(onShelf.size, lang) })}
                    </button>
                  ) : (
                    <p className="text-amber-700">{t('product.sizeGuide.outOfStock', { size: sizeLabel(onShelf.size, lang) })}</p>
                  )}
                </div>
              )}
            </div>
          </form>
        </>
      )}

      {measuredSizes.length > 0 && (
        <div className={chart ? 'mt-6' : ''}>
          <p className="text-xs uppercase tracking-[0.1em] text-stone-500 mb-1">{t('product.sizeGuide.garmentTitle')}</p>
          <p className="text-xs text-stone-400 mb-2">{t('product.sizeGuide.garmentNote')}</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-[11px] uppercase tracking-[0.1em] text-stone-400">
                  <th scope="col" className="text-left font-normal py-2 pr-3">{t('product.sizeGuide.size')}</th>
                  {measureKeys.map((m) => (
                    <th key={m} scope="col" className="text-left font-normal py-2 pr-3">{t(`attributes.measure.${m}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {measuredSizes.map((s) => (
                  <tr key={s} className="border-t border-stone-100 text-stone-700">
                    <th scope="row" className="text-left font-medium py-2 pr-3">{sizeLabel(s, lang)}</th>
                    {measureKeys.map((m) => (
                      <td key={m} className="py-2 pr-3 tabular-nums">{measurements[s][m] !== undefined ? number(measurements[s][m], 1) : '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Fold>
  );
}
