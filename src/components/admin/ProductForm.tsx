'use client';

/**
 * The product form, new and edit (owner, 2026-11-20: "расфрлана и не
 * функционална"). Six numbered sections in the order a product is put on the
 * shelf — basics, price, sizes, photos, description, measurements — with a
 * bar to jump between them and the save button always in sight.
 *
 * What it writes is unchanged: quantities only as a stock count onto the shelf
 * the form opened on (D-013, `saveProductEdit`), the attributes after the
 * product (EPIC 9), the purchase price only for the admin (8.3). Photos are
 * written only when they were changed here, from the links the database holds
 * — not from the repo files the screen shows in their place.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { Save, X } from 'lucide-react';
import { updateProduct } from '@/hooks/useProducts';
import { supabase } from '@/lib/supabase';
import { applyStockCount } from '@/lib/stock';
import { Product, ProductAttributes, ProductFormData, ProductSize } from '@/types';
import { emptyAttributes, fetchAttributes, fetchMeasuredInCategory, saveAttributes } from '@/lib/product-attributes';
import MeasurementsEditor, { measurementErrors, rankMeasurementSources, type MeasurementSource } from '@/components/admin/MeasurementsEditor';
import { careFromComposition, isStretch, validateComposition } from '@/lib/attributes';
import { generateTitle } from '@/lib/product-title';
import { categoryName } from '@/lib/product-display';
import { sortShelf } from '@/lib/sizes';
import {
  ColorSwatches, CompositionEditor, DetailsEditor, FitSelect, PatternSelect, SizeAdviceButtons,
} from '@/components/admin/AttributeFields';
import { CategoryPicker, Field, ImagesEditor, Section, Toggle, inputClass } from '@/components/admin/ProductFormParts';
import SizeStockEditor from '@/components/admin/SizeStockEditor';
import PriceSuggestionPanel from '@/components/admin/PriceSuggestionPanel';
import { mkDen, mkNumber } from '@/lib/mk-format';
import {
  grossMargin, markup, unitProfit, markdownFloorPrice,
  MARKDOWN_FLOOR, MARGIN_LOW, MARGIN_WATCH,
} from '@/lib/cost';

export function marginToneClass(margin: number | null): string {
  if (margin === null) return 'text-slate-400';
  if (margin < MARGIN_LOW) return 'text-red-700';
  if (margin < MARGIN_WATCH) return 'text-amber-700';
  return 'text-green-700';
}

interface ProductFormProps {
  product?: Product;
  /**
   * Saves the product. Resolves to the product's id when it was saved, or to
   * nothing when it was not (a lost stock count keeps the form open). The
   * composition and details are written after, to product_attributes, and only
   * for a product that exists.
   */
  onSave: (data: ProductFormData, customId?: string) => Promise<string | void>;
  onCancel: () => void;
  /**
   * The purchase price field and the margin panel. Off for staff (8.3/8.5):
   * they never see or enter what a piece cost; the admin adds it later.
   */
  showCost?: boolean;
}

const SECTIONS = [
  { id: 'pf-basic', label: 'Основно' },
  { id: 'pf-price', label: 'Цена' },
  { id: 'pf-sizes', label: 'Големини' },
  { id: 'pf-photos', label: 'Слики' },
  { id: 'pf-details', label: 'Опис' },
  { id: 'pf-measures', label: 'Мерки' },
] as const;
type SectionId = (typeof SECTIONS)[number]['id'];

const REPO_PHOTO = '/images/products/';
const salePriceOf = (price: number, pct: number) => Math.round(price * (1 - pct / 100) * 100) / 100;

export default function ProductForm({ product, onSave, onCancel, showCost = true }: ProductFormProps) {
  const isEditing = !!product;
  const [formData, setFormData] = useState<ProductFormData>(() => ({
    name: product?.name || '',
    description: product?.description || '',
    price: product?.price || 0,
    purchasePrice: product?.purchasePrice,
    category: product?.category || '',
    imageUrl: product?.imageUrl || '',
    images: product?.images || [],
    stock: product?.stock || 0,
    featured: product?.featured || false,
    isVisible: product?.isVisible !== false,
    sizes: sortShelf(product?.sizes || []),
    sale: product?.sale || { isActive: false, salePrice: 0, percentageOff: 0 },
  }));
  const [customId, setCustomId] = useState('');
  const [saving, setSaving] = useState(false);
  const [opened] = useState(() => JSON.stringify(formData));
  const set = (patch: Partial<ProductFormData>) => setFormData((prev) => ({ ...prev, ...patch }));
  const sizes = formData.sizes ?? [];

  // ---- Photos: the links the database holds, not the repo files shown instead.
  const shownUrls = useMemo(
    () => [product?.imageUrl, ...(product?.images ?? [])].filter((u): u is string => !!u),
    [product?.imageUrl, product?.images],
  );
  const [imgs, setImgs] = useState<string[]>(shownUrls);
  const [imgsTouched, setImgsTouched] = useState(false);
  const imgsTouchedRef = useRef(false);
  const [repoPhotos, setRepoPhotos] = useState(0);
  useEffect(() => {
    if (!product?.id) return;
    let live = true;
    supabase.from('products').select('image_url, images').eq('id', product.id).maybeSingle().then(({ data }) => {
      if (!live || !data) return;
      const stored = [data.image_url as string | null, ...((data.images as string[] | null) ?? [])].filter((u): u is string => !!u);
      if (stored.join('\n') !== shownUrls.join('\n')) setRepoPhotos(shownUrls.filter((u) => u.startsWith(REPO_PHOTO)).length);
      if (!imgsTouchedRef.current) setImgs(stored);
    });
    return () => { live = false; };
  }, [product?.id, shownUrls]);
  const editImgs = (urls: string[]) => {
    imgsTouchedRef.current = true;
    setImgsTouched(true);
    setImgs(urls);
  };

  // ---- What it is made of, its colour and fit (EPIC 9): product_attributes,
  // loaded apart from the product and written only if something here changed.
  const [attrs, setAttrs] = useState<ProductAttributes>(emptyAttributes(product?.id ?? ''));
  const [attrsDirty, setAttrsDirty] = useState(false);
  const [attrsNote, setAttrsNote] = useState<string | null>(null);
  useEffect(() => {
    if (!product?.id) return;
    let live = true;
    fetchAttributes(supabase, product.id).then((r) => {
      if (!live) return;
      if (r.data) setAttrs(r.data);
      if (r.missingTable) setAttrsNote('Табелата за атрибути уште не постои (миграција 010) — овој дел нема да се зачува.');
    });
    return () => { live = false; };
  }, [product?.id]);
  const editAttrs = (patch: Partial<ProductAttributes>) => {
    setAttrs((prev) => ({ ...prev, ...patch }));
    setAttrsDirty(true);
  };
  const compositionErrors = validateComposition(attrs.composition);
  const measureErrors = measurementErrors(attrs.measurements);
  const [measureSources, setMeasureSources] = useState<MeasurementSource[]>([]);
  const loadMeasureSources = async () => {
    if (!formData.category) return;
    const found = await fetchMeasuredInCategory(supabase, formData.category);
    setMeasureSources(rankMeasurementSources(
      { id: product?.id ?? '', brand: product?.brand, category: formData.category },
      found.map((f) => ({ ...f, label: f.name })),
    ));
  };

  // ---- Price and sale
  const setPrice = (price: number) =>
    setFormData((prev) => ({
      ...prev,
      price,
      sale: prev.sale?.isActive ? { ...prev.sale, salePrice: salePriceOf(price, prev.sale.percentageOff || 0) } : prev.sale,
    }));
  const setSaleActive = (isActive: boolean) =>
    setFormData((prev) => ({
      ...prev,
      sale: {
        isActive,
        salePrice: isActive ? salePriceOf(prev.price, prev.sale?.percentageOff || 0) : 0,
        // Kept whether active or not — turning a sale off should not forget its size.
        percentageOff: prev.sale?.percentageOff || 0,
      },
    }));
  const setSalePct = (pct: number) => {
    const clamped = Math.min(99, Math.max(0, pct));
    setFormData((prev) => ({
      ...prev,
      sale: { isActive: prev.sale?.isActive || false, percentageOff: clamped, salePrice: salePriceOf(prev.price, clamped) },
    }));
  };

  // Margin as the form currently stands, on the *effective* price: a product at
  // −40% must not show the list price's healthy margin (A1, TURNAROUND.md).
  const onSale = !!formData.sale?.isActive;
  const priceNow = onSale ? (formData.sale?.salePrice || 0) : formData.price;
  const costNow = formData.purchasePrice;
  const marginNow = grossMargin(priceNow, costNow);
  const markupNow = markup(priceNow, costNow);
  const profitNow = unitProfit(priceNow, costNow);
  const marginList = grossMargin(formData.price, costNow);
  const profitList = unitProfit(formData.price, costNow);
  const floorPrice = markdownFloorPrice(costNow);
  const belowFloor = floorPrice !== null && priceNow > 0 && priceNow < floorPrice;
  const discountCost = onSale && profitList !== null && profitNow !== null ? profitList - profitNow : null;

  const totalStock = sizes.length ? sizes.reduce((sum, s) => sum + (Number(s.quantity) || 0), 0) : formData.stock;

  // ---- Leaving
  const requestClose = () => {
    if (saving) return;
    const dirty = JSON.stringify(formData) !== opened || attrsDirty || imgsTouched || customId.trim() !== '';
    if (dirty && !window.confirm('Има незачувани промени. Да се затвори формата без да се зачуваат?')) return;
    onCancel();
  };
  // Escape closes the form the way the X does; the handler always sees the form as it is now.
  const closeRef = useRef(requestClose);
  useEffect(() => { closeRef.current = requestClose; });
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, []);

  // ---- The bar: where the reader is, and a jump to each section
  const scrollRef = useRef<HTMLFormElement>(null);
  const [active, setActive] = useState<SectionId>('pf-basic');
  useEffect(() => {
    const root = scrollRef.current;
    if (!root) return;
    const seen = new Map<string, boolean>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) seen.set(e.target.id, e.isIntersecting);
        const first = SECTIONS.find((s) => seen.get(s.id));
        if (first) setActive(first.id);
      },
      { root, rootMargin: '0px 0px -60% 0px' },
    );
    root.querySelectorAll('[data-section]').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  const jump = (id: SectionId) => {
    setActive(id);
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  // Empty required fields are marked once a save was tried, not on a blank new form.
  const [tried, setTried] = useState(false);
  const problems: Partial<Record<SectionId, boolean>> = {
    'pf-basic': tried && (!formData.name.trim() || !formData.category),
    'pf-price': (tried && !(formData.price > 0)) || belowFloor,
    'pf-details': compositionErrors.length > 0,
    'pf-measures': measureErrors.length > 0,
  };

  // ---- Save
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (!formData.name.trim() || !formData.category) {
      jump('pf-basic');
      alert('Внеси име и категорија.');
      return;
    }
    if (!(formData.price > 0) && !window.confirm('Цената е 0 ден. Да се зачува така?')) {
      jump('pf-price');
      return;
    }
    if (compositionErrors.length) {
      jump('pf-details');
      alert(`Составот не е точен: ${compositionErrors.join(' · ')}`);
      return;
    }
    if (measureErrors.length) {
      jump('pf-measures');
      alert(`Мерките не се точни: ${measureErrors.join(' · ')}`);
      return;
    }
    setSaving(true);
    try {
      const base: ProductFormData = { ...formData, name: formData.name.trim(), stock: totalStock, sizes };
      let payload: ProductFormData;
      if (isEditing && !imgsTouched) {
        // Untouched photos are not written: what the screen showed may be repo files.
        const { imageUrl: _main, images: _rest, ...withoutPhotos } = base;
        void _main; void _rest;
        payload = withoutPhotos as ProductFormData;
      } else {
        payload = { ...base, imageUrl: imgs[0] ?? '', images: imgs.slice(1) };
      }
      const savedId = await onSave(payload, isEditing ? undefined : customId.trim() || undefined);
      if (savedId && attrsDirty) {
        // The whole section, as it stands: a field left empty here is cleared.
        const res = await saveAttributes(supabase, savedId, {
          composition: attrs.composition,
          color: attrs.color ?? '',
          pattern: attrs.pattern ?? '',
          fit: attrs.fit ?? '',
          sizeAdvice: attrs.sizeAdvice ?? '',
          details: attrs.details,
          measurements: attrs.measurements,
        });
        if (res.error) alert(`Производот е зачуван, но составот и деталите не се: ${res.error}`);
      }
    } catch (err) {
      alert(`Не е зачувано: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
    }
  };

  const suggestedTitle = formData.category ? generateTitle(formData.category, attrs) : null;

  return (
    // Above the shop's contact button (z-50), which the root layout draws on /admin too.
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center bg-black/50 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="product-form-title">
      <div className="flex h-[100dvh] w-full max-w-5xl flex-col overflow-hidden bg-slate-100 shadow-xl sm:h-[94vh] sm:rounded-xl">
        {/* Header and the bar */}
        <header className="border-b border-slate-200 bg-white px-4 pt-3 sm:px-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="product-form-title" className="text-lg font-bold text-slate-900">
                {isEditing ? 'Уреди производ' : 'Нов производ'}
              </h2>
              {isEditing && (
                <p className="truncate text-xs text-slate-500">
                  <span className="font-mono">{product.id}</span>
                  {formData.category && <> · {categoryName(formData.category)}</>}
                </p>
              )}
            </div>
            <button type="button" onClick={requestClose} aria-label="Затвори" className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800">
              <X className="h-6 w-6" />
            </button>
          </div>
          <nav className="-mx-1 mt-2 flex gap-1 overflow-x-auto pb-2" aria-label="Делови на формата">
            {SECTIONS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => jump(s.id)}
                className={`relative shrink-0 rounded-full px-3 py-1 text-sm font-medium transition-colors ${active === s.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}
              >
                {i + 1}. {s.label}
                {problems[s.id] && <span className="absolute right-0.5 top-0.5 h-2 w-2 rounded-full bg-red-500" aria-label="има што да се поправи" />}
              </button>
            ))}
          </nav>
        </header>

        <form id="product-form" ref={scrollRef} onSubmit={handleSubmit} className="flex-1 space-y-4 overflow-y-auto px-3 py-4 sm:px-6">
          {/* 1. Basics */}
          <Section id="pf-basic" n={1} title="Основно">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {!isEditing && (
                <Field label="ID (незадолжително)" hint="Празно: се прави сам. Внеси свој ако производот веќе има шифра (на пр. од етикетата)." className="sm:col-span-2">
                  <input type="text" value={customId} onChange={(e) => setCustomId(e.target.value)} placeholder="на пр. brango-1791590400-9" className={inputClass} />
                </Field>
              )}
              <Field label="Име / шифра на моделот" hint="Внатрешно име. Купувачот го гледа насловот што се пишува од „Опис“.">
                <input type="text" value={formData.name} onChange={(e) => set({ name: e.target.value })} className={inputClass} required />
              </Field>
              <Field label="Категорија">
                <CategoryPicker value={formData.category} onChange={(category) => set({ category })} />
              </Field>
              <Toggle
                tone="green"
                checked={formData.isVisible !== false}
                onChange={(isVisible) => set({ isVisible })}
                label="Видлив на сајтот"
                hint="Се покажува само ако има барем едно парче на залиха."
              />
              <Toggle
                checked={formData.featured}
                onChange={(featured) => set({ featured })}
                label="Истакнат"
                hint="Ознака на сајтот; првиот избор за сликата на групата на почетната."
              />
            </div>
          </Section>

          {/* 2. Price */}
          <Section
            id="pf-price"
            n={2}
            title="Цена"
            aside={onSale ? <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">−{formData.sale?.percentageOff || 0}% · {mkDen(priceNow)}</span> : undefined}
          >
            <div className={`grid grid-cols-1 gap-5 ${showCost ? 'lg:grid-cols-2' : ''}`}>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Продажна цена (ден.)">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="1"
                      min="0"
                      value={formData.price || ''}
                      onChange={(e) => setPrice(parseFloat(e.target.value) || 0)}
                      placeholder="0"
                      className={`${inputClass} text-base font-semibold`}
                      required
                    />
                  </Field>
                  {showCost && (
                    <Field label="Набавна цена (ден.)" hint="Вистинската, по парче.">
                      <input
                        type="number"
                        inputMode="decimal"
                        step="1"
                        min="0"
                        value={formData.purchasePrice ?? ''}
                        onChange={(e) => {
                          const raw = e.target.value.trim();
                          set({ purchasePrice: raw === '' ? undefined : Math.max(0, parseFloat(raw) || 0) });
                        }}
                        placeholder="—"
                        className={inputClass}
                      />
                    </Field>
                  )}
                </div>

                <div className="space-y-3 rounded-lg border border-slate-200 p-3">
                  <Toggle tone="red" checked={onSale} onChange={setSaleActive} label="На попуст" />
                  {onSale && (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Попуст (%)">
                        <input
                          type="number"
                          inputMode="numeric"
                          min="1"
                          max="99"
                          value={formData.sale?.percentageOff || ''}
                          onChange={(e) => setSalePct(parseInt(e.target.value, 10) || 0)}
                          className={inputClass}
                        />
                      </Field>
                      <div>
                        <span className="mb-1 block text-xs font-medium text-slate-600">Цена на попуст</span>
                        <p className="rounded-lg bg-red-50 px-3 py-2 text-base font-semibold tabular-nums text-red-700">{mkDen(priceNow)}</p>
                      </div>
                      <div className="col-span-2 flex flex-wrap gap-1.5">
                        {[10, 20, 30, 40, 50].map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => setSalePct(p)}
                            className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${formData.sale?.percentageOff === p ? 'border-red-600 bg-red-600 text-white' : 'border-slate-300 text-slate-700 hover:border-red-400'}`}
                          >
                            −{p}%
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* The answer to "should I be selling this at this price", while the price is typed. */}
              {showCost && (
                <div className="space-y-3">
                  {marginNow === null ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                      Нема набавна цена: маржата не може да се пресмета.
                    </div>
                  ) : (
                    <div className={`rounded-xl border px-4 py-3 ${belowFloor ? 'border-red-300 bg-red-50' : marginNow < MARGIN_LOW ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
                      <div className="grid grid-cols-3 gap-3">
                        <Stat label={onSale ? 'Маржа на попуст' : 'Маржа'}>
                          <span className={`text-2xl font-bold ${marginToneClass(marginNow)}`}>{mkNumber(marginNow * 100, 1)}%</span>
                        </Stat>
                        <Stat label="Маркап">{mkNumber((markupNow ?? 0) * 100)}%</Stat>
                        <Stat label="Заработка по парче">{mkDen(Math.round(profitNow ?? 0))}</Stat>
                      </div>
                      {onSale && marginList !== null && (
                        <p className="mt-2 text-xs text-slate-600">
                          На редовна цена: {mkNumber(marginList * 100, 1)}% · {mkDen(Math.round(profitList ?? 0))}
                          {discountCost !== null && discountCost > 0 && <> · попустот чини <strong>{mkDen(Math.round(discountCost))}</strong> по парче</>}
                        </p>
                      )}
                      {belowFloor ? (
                        <p className="mt-2 text-xs font-medium text-red-800">
                          Цената е под подот од {mkDen(floorPrice!)} (набавна +{Math.round((MARKDOWN_FLOOR - 1) * 100)}%). Под таму продажбата не враќа капитал, туку го троши.
                        </p>
                      ) : marginNow < MARGIN_LOW ? (
                        <p className="mt-2 text-xs font-medium text-amber-800">
                          Маржата е под {Math.round(MARGIN_LOW * 100)}%. По трошоците на дуќанот ова речиси ништо не остава.
                        </p>
                      ) : null}
                    </div>
                  )}
                  <PriceSuggestionPanel cost={costNow} price={formData.price} salePrice={onSale ? priceNow : undefined} onApply={setPrice} />
                </div>
              )}
            </div>
          </Section>

          {/* 3. Sizes and stock */}
          <Section
            id="pf-sizes"
            n={3}
            title="Големини и залиха"
            aside={<span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{totalStock} на полица</span>}
          >
            <SizeStockEditor sizes={sizes} onChange={(next: ProductSize[]) => set({ sizes: next })} editing={isEditing} />
          </Section>

          {/* 4. Photos */}
          <Section id="pf-photos" n={4} title="Слики">
            <ImagesEditor urls={imgs} onChange={editImgs} repoPhotos={repoPhotos} />
          </Section>

          {/* 5. Description: composition and details (EPIC 9) */}
          <Section id="pf-details" n={5} title="Опис на сајтот">
            <div className="space-y-5">
              {attrsNote && <p className="text-xs text-amber-700">{attrsNote}</p>}
              {suggestedTitle && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Наслов на сајтот · се пишува сам од податоците подолу</p>
                  <p className={`text-sm font-semibold ${suggestedTitle.missing.length ? 'text-slate-400' : 'text-slate-800'}`}>{suggestedTitle.title}</p>
                  {suggestedTitle.missing.length > 0 && (
                    <p className="text-xs text-amber-700">Додека фали {suggestedTitle.missing.join(' и ')}, сајтот го покажува стариот наслов со шифрата.</p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                <div>
                  <span className="mb-1 block text-xs font-medium text-slate-600">Боја</span>
                  <ColorSwatches value={attrs.color} onChange={(color) => editAttrs({ color })} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Крој">
                    <FitSelect category={formData.category} value={attrs.fit} onChange={(fit) => editAttrs({ fit })} className="w-full" />
                  </Field>
                  <Field label="Шара">
                    <PatternSelect value={attrs.pattern} onChange={(pattern) => editAttrs({ pattern })} className="w-full" />
                  </Field>
                  <div className="col-span-2">
                    <span className="mb-1 block text-xs font-medium text-slate-600">Совет за големина</span>
                    <SizeAdviceButtons value={attrs.sizeAdvice} onChange={(v) => editAttrs({ sizeAdvice: v || undefined })} />
                  </div>
                </div>
              </div>

              <div>
                <span className="mb-1 block text-xs font-medium text-slate-600">Состав (од етикетата)</span>
                <CompositionEditor value={attrs.composition} onChange={(composition) => editAttrs({ composition })} />
                {attrs.composition.length > 0 && compositionErrors.length === 0 && (
                  <p className="mt-2 text-xs text-slate-500">
                    {isStretch(attrs.composition) && <span className="font-medium text-slate-700">Растеглив · </span>}
                    {careFromComposition(attrs.composition).join(' · ')}
                  </p>
                )}
                {compositionErrors.length > 0 && <p className="mt-2 text-xs font-medium text-red-700">{compositionErrors.join(' · ')}</p>}
              </div>

              <DetailsEditor category={formData.category} value={attrs.details} onChange={(details) => editAttrs({ details })} />

              <details className="rounded-lg border border-slate-200 px-3 py-2" open={!!formData.description}>
                <summary className="cursor-pointer text-xs font-medium text-slate-600">Слободен текст (стар опис)</summary>
                <p className="mt-1 text-xs text-slate-500">Сајтот од него зема само тоа што го нема горе.</p>
                <textarea
                  value={formData.description}
                  onChange={(e) => set({ description: e.target.value })}
                  rows={3}
                  className={`${inputClass} mt-2`}
                />
              </details>
            </div>
          </Section>

          {/* 6. Measurements (9.5): taken by hand, per size on the shelf */}
          <Section id="pf-measures" n={6} title="Мерки (cm)">
            <MeasurementsEditor
              category={formData.category}
              sizes={sizes}
              value={attrs.measurements}
              onChange={(measurements) => editAttrs({ measurements })}
              sources={measureSources}
              onLoadSources={loadMeasureSources}
            />
            {measureErrors.length > 0 && <p className="mt-2 text-xs font-medium text-red-700">{measureErrors.join(' · ')}</p>}
          </Section>
        </form>

        {/* Always in sight */}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-4 py-3 sm:px-6">
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
            <span>Цена <strong className="tabular-nums text-slate-900">{priceNow > 0 ? mkDen(priceNow) : '—'}</strong></span>
            <span>Залиха <strong className="tabular-nums text-slate-900">{totalStock}</strong></span>
            {showCost && marginNow !== null && (
              <span>Маржа <strong className={`tabular-nums ${marginToneClass(marginNow)}`}>{mkNumber(marginNow * 100, 1)}%</strong></span>
            )}
          </p>
          <div className="flex w-full gap-2 sm:w-auto">
            <button
              type="button"
              onClick={requestClose}
              className="flex-1 rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 sm:flex-none"
            >
              Откажи
            </button>
            <button
              type="submit"
              form="product-form"
              disabled={saving}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 sm:flex-none"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Се зачувува…' : 'Зачувај'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</p>
      <p className="text-lg font-semibold tabular-nums text-slate-700">{children}</p>
    </div>
  );
}

/**
 * Save an edit from the form. A price change must never rewrite the shelf
 * (D-013): the form holds the quantities from the moment it opened, and writing
 * them back on every save would resurrect anything sold or reserved meanwhile.
 * So quantities are only written when they were actually changed — a stock
 * count — and then only if the shelf still matches what the form started from.
 *
 * Returns an error message and writes nothing else when the count lost.
 */
export async function saveProductEdit(editing: Product, data: ProductFormData): Promise<string | null> {
  const { sizes, stock: _stock, ...rest } = data;
  void _stock;

  const before = JSON.stringify(
    (editing.sizes ?? []).map((s) => [String(s.size).trim(), Number(s.quantity) || 0])
  );
  const after = JSON.stringify(
    (sizes ?? []).map((s) => [String(s.size).trim(), Number(s.quantity) || 0])
  );

  if (before !== after) {
    const res = await applyStockCount(supabase, editing.id, editing.sizes ?? [], sizes ?? []);
    if (!res.ok) return res.error ?? 'Залихата е променета во меѓувреме.';
  }

  await updateProduct(editing.id, rest);
  return null;
}
