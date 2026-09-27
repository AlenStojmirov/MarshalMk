'use client';

/**
 * Каталог — what each product is missing, filled in without opening a form
 * (Task 9.4).
 *
 * A customer buying clothes online needs what the shop floor gives for free:
 * what it is made of, its colour, how it fits. `npm run catalog:audit` counts
 * the gaps; this is where they are closed, row by row, in the order of work —
 * live products first, then hidden ones whose season is opening, down to
 * clearance (src/lib/catalog-gaps.ts, the same definition as the report).
 *
 * Every change saves at once to product_attributes and touches nothing on
 * `products`, so it can never rewrite a shelf (D-013). Staff may use it too:
 * they have the garment in their hands.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { ArrowLeft, Check, ImageOff, Loader2, Pencil, AlertCircle, Ruler } from 'lucide-react';
import { useProducts } from '@/hooks/useProducts';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/lib/i18n';
import type { Product, ProductAttributes, SizeAdvice } from '@/types';
import type { AttributesPatch } from '@/lib/db-mappers';
import { fetchAllAttributes, saveAttributes, emptyAttributes } from '@/lib/product-attributes';
import { catalogGaps, sizesOnShelf, workTier, TIER_LABEL, type CatalogGaps, type WorkTier } from '@/lib/catalog-gaps';
import { COMPOSITION_PRESETS, formatComposition } from '@/lib/attributes';
import { NON_MERCHANDISE } from '@/lib/seasons';
import { getEffectivePrice } from '@/lib/pricing';
import {
  ColorSelect, CompositionEditor, FitSelect, SizeAdviceButtons,
} from '@/components/admin/AttributeFields';
import MeasurementsEditor, { measurementErrors, rankMeasurementSources } from '@/components/admin/MeasurementsEditor';

type Gap = 'composition' | 'color' | 'fit' | 'sizeAdvice' | 'measured' | 'photos';

const GAP_LABEL: Record<Gap, string> = {
  composition: 'Состав',
  color: 'Боја',
  fit: 'Крој',
  sizeAdvice: 'Совет за големина',
  measured: 'Мерки',
  photos: 'Слика',
};

const hasGap = (g: CatalogGaps, gap: Gap) =>
  gap === 'composition' ? g.composition !== 'structured'
  : gap === 'photos' ? g.photos === 0
  : !g[gap];

interface Entry {
  p: Product;
  a: ProductAttributes;
  gaps: CatalogGaps;
  tier: WorkTier;
  units: number;
  value: number;
}

type RowState = { saving?: boolean; saved?: boolean; error?: string };

const PAGE = 60;

export default function CatalogPage() {
  const { t } = useTranslation();
  const { products, loading } = useProducts();
  const [attrs, setAttrs] = useState<Map<string, ProductAttributes>>(new Map());
  const [attrsLoading, setAttrsLoading] = useState(true);
  const [missingTable, setMissingTable] = useState(false);
  const [rowState, setRowState] = useState<Record<string, RowState>>({});
  const [editingComposition, setEditingComposition] = useState<string | null>(null);
  const [measuring, setMeasuring] = useState<string | null>(null);

  const [tier, setTier] = useState<'all' | WorkTier>('all');
  const [category, setCategory] = useState('all');
  const [gap, setGap] = useState<'all' | Gap>('all');
  const [query, setQuery] = useState('');
  const [shown, setShown] = useState(PAGE);
  // Tiers depend on age; one clock for the life of the screen.
  const [now] = useState(() => Date.now());

  useEffect(() => {
    fetchAllAttributes(supabase).then((r) => {
      setAttrs(r.data);
      setMissingTable(r.missingTable);
      setAttrsLoading(false);
    });
  }, []);

  const entries = useMemo<Entry[]>(() => {
    return products
      .filter((p) => !NON_MERCHANDISE.has(p.category) && sizesOnShelf(p.sizes).length > 0)
      .map((p) => {
        const a = attrs.get(p.id) ?? emptyAttributes(p.id);
        const units = sizesOnShelf(p.sizes).reduce((n, s) => n + Number(s.quantity), 0);
        // Cost where the reader may see it (admin), the price otherwise (staff):
        // either way the most capital per hour of work comes first.
        const unitValue = p.purchasePrice ?? getEffectivePrice(p);
        return {
          p, a, units, value: units * unitValue,
          gaps: catalogGaps(p, a),
          tier: workTier(p, now),
        };
      })
      .sort((x, y) => x.tier - y.tier || y.value - x.value);
  }, [products, attrs, now]);

  const categories = useMemo(
    () => [...new Set(entries.map((e) => e.p.category))].sort(),
    [entries],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return entries.filter((e) =>
      (tier === 'all' || e.tier === tier)
      && (category === 'all' || e.p.category === category)
      && (gap === 'all' || hasGap(e.gaps, gap))
      && (!q || e.p.name.toLowerCase().includes(q) || e.p.id.toLowerCase().includes(q)));
  }, [entries, tier, category, gap, query]);

  const counts = useMemo(() => {
    const base = entries.filter((e) => (tier === 'all' || e.tier === tier) && (category === 'all' || e.p.category === category));
    const c = Object.fromEntries((Object.keys(GAP_LABEL) as Gap[]).map((g) => [g, base.filter((e) => hasGap(e.gaps, g)).length])) as Record<Gap, number>;
    return { ...c, total: base.length, ready: base.filter((e) => e.gaps.ready).length };
  }, [entries, tier, category]);

  const save = async (productId: string, patch: AttributesPatch) => {
    setRowState((s) => ({ ...s, [productId]: { saving: true } }));
    const res = await saveAttributes(supabase, productId, patch);
    if (res.data) {
      setAttrs((m) => new Map(m).set(productId, res.data!));
      setRowState((s) => ({ ...s, [productId]: { saved: true } }));
      setTimeout(() => setRowState((s) => (s[productId]?.saved ? { ...s, [productId]: {} } : s)), 1500);
    } else {
      setRowState((s) => ({ ...s, [productId]: { error: res.error } }));
    }
  };

  const categoryLabel = (c: string) => {
    const label = t(`categoryNames.${c}`);
    return label === `categoryNames.${c}` ? c : label;
  };

  if (loading || attrsLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        <Link href="/admin" className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-800 mb-4 text-sm">
          <ArrowLeft className="h-4 w-4" />
          {t('inventory.backToDashboard')}
        </Link>

        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Каталог — состав, боја, крој</h1>
        <p className="text-sm text-slate-500 mt-1 mb-6 max-w-3xl">
          Купувачот online не може да ја допре облеката. Тоа што го гледа во дуќан — од што е, каква боја, како паѓа — мора да
          го прочита. Секоја промена тука се зачувува веднаш. Редоследот е редот на работа: прво што е на сајтот.
        </p>

        {missingTable && (
          <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Табелата за атрибути уште не постои — пушти ја миграцијата <code>010_product_attributes.sql</code>. Дотогаш ништо не се зачувува.
          </div>
        )}

        {/* What is missing — each tile filters the list */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2 mb-4">
          <button
            type="button"
            onClick={() => setGap('all')}
            className={`rounded-xl border p-3 text-left ${gap === 'all' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white'}`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Спремни</p>
            <p className="text-xl font-bold text-slate-800 tabular-nums">{counts.ready}<span className="text-sm font-normal text-slate-400"> / {counts.total}</span></p>
          </button>
          {(Object.keys(GAP_LABEL) as Gap[]).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => { setGap(gap === g ? 'all' : g); setShown(PAGE); }}
              className={`rounded-xl border p-3 text-left ${gap === g ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-white'}`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Без {GAP_LABEL[g].toLowerCase()}</p>
              <p className={`text-xl font-bold tabular-nums ${counts[g] ? 'text-amber-700' : 'text-green-700'}`}>{counts[g]}</p>
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-3">
          <select value={String(tier)} onChange={(e) => { setTier(e.target.value === 'all' ? 'all' : (Number(e.target.value) as WorkTier)); setShown(PAGE); }} className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
            <option value="all">Сите нивоа</option>
            {([1, 2, 3, 4, 5] as WorkTier[]).map((n) => <option key={n} value={n}>{n} · {TIER_LABEL[n]}</option>)}
          </select>
          <select value={category} onChange={(e) => { setCategory(e.target.value); setShown(PAGE); }} className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white">
            <option value="all">Сите категории</option>
            {categories.map((c) => <option key={c} value={c}>{categoryLabel(c)}</option>)}
          </select>
          <input
            value={query}
            onChange={(e) => { setQuery(e.target.value); setShown(PAGE); }}
            placeholder="Шифра или ID…"
            className="px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white flex-1 min-w-[160px]"
          />
          <span className="self-center text-sm text-slate-500 tabular-nums">{filtered.length} производи</span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="hidden lg:grid grid-cols-[3.5rem_minmax(9rem,1fr)_minmax(12rem,1.4fr)_10rem_9rem_8.5rem_minmax(7rem,0.8fr)] gap-3 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-100">
            <span />
            <span>Производ</span>
            <span>Состав</span>
            <span>Боја</span>
            <span>Крој</span>
            <span>Совет за големина</span>
            <span>Уште фали</span>
          </div>

          {filtered.slice(0, shown).map((e) => {
            const st = rowState[e.p.id] ?? {};
            const other = e.gaps.missing.filter((m) => /слик/.test(m));
            return (
              <div key={e.p.id} className="border-b border-slate-100 last:border-b-0">
                <div className="grid grid-cols-[3.5rem_1fr] lg:grid-cols-[3.5rem_minmax(9rem,1fr)_minmax(12rem,1.4fr)_10rem_9rem_8.5rem_minmax(7rem,0.8fr)] gap-3 px-4 py-3 items-center">
                  <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-slate-100 flex items-center justify-center row-span-2 lg:row-span-1">
                    {e.gaps.photos > 0 ? (
                      <Image src={e.p.imageUrl} alt="" fill className="object-cover" sizes="48px" />
                    ) : (
                      <ImageOff className="h-5 w-5 text-slate-300" />
                    )}
                  </div>

                  <div className="min-w-0">
                    <Link href={`/admin/product/${e.p.id}`} className="block font-semibold text-slate-800 hover:text-blue-600 text-sm truncate">
                      {e.p.name || e.p.id}
                    </Link>
                    <p className="text-xs text-slate-500 truncate">
                      {categoryLabel(e.p.category)} · {e.units} парч. · <span title={TIER_LABEL[e.tier]}>ниво {e.tier}</span>
                      {st.saving && <Loader2 className="inline h-3 w-3 ml-1 animate-spin text-blue-600" />}
                      {st.saved && <Check className="inline h-3 w-3 ml-1 text-green-600" />}
                    </p>
                    {st.error && <p className="text-xs text-red-700 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{st.error}</p>}
                  </div>

                  <div className="col-start-2 lg:col-start-auto flex flex-wrap items-center gap-2 min-w-0">
                    {e.a.composition.length > 0 ? (
                      <>
                        <span className="text-sm text-slate-700">{formatComposition(e.a.composition)}</span>
                        <button type="button" onClick={() => setEditingComposition(editingComposition === e.p.id ? null : e.p.id)} className="p-1 text-slate-400 hover:text-blue-600" title="Измени">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      </>
                    ) : (
                      <select
                        value=""
                        disabled={missingTable}
                        onChange={(ev) => {
                          if (ev.target.value === 'other') { setEditingComposition(e.p.id); return; }
                          const preset = COMPOSITION_PRESETS[Number(ev.target.value)];
                          if (preset) save(e.p.id, { composition: preset.composition });
                        }}
                        className="px-2 py-1.5 border border-amber-300 bg-amber-50 rounded-lg text-sm w-full max-w-[16rem]"
                      >
                        <option value="">— состав —</option>
                        {COMPOSITION_PRESETS.map((p, i) => <option key={p.label} value={i}>{p.label}</option>)}
                        <option value="other">друго…</option>
                      </select>
                    )}
                  </div>

                  <div className="col-start-2 lg:col-start-auto">
                    <ColorSelect value={e.a.color} onChange={(color) => save(e.p.id, { color })} className={`w-full ${e.gaps.color ? '' : 'border-amber-300 bg-amber-50'}`} />
                  </div>

                  <div className="col-start-2 lg:col-start-auto">
                    <FitSelect category={e.p.category} value={e.a.fit} onChange={(fit) => save(e.p.id, { fit })} className={`w-full ${e.gaps.fit ? '' : 'border-amber-300 bg-amber-50'}`} />
                  </div>

                  <div className="col-start-2 lg:col-start-auto">
                    <SizeAdviceButtons compact value={e.a.sizeAdvice} onChange={(v: SizeAdvice | '') => save(e.p.id, { sizeAdvice: v })} />
                  </div>

                  <div className="col-start-2 lg:col-start-auto flex flex-wrap items-center gap-1">
                    {e.gaps.needsMeasurements && (
                      <button
                        type="button"
                        disabled={missingTable}
                        onClick={() => setMeasuring(measuring === e.p.id ? null : e.p.id)}
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] border ${e.gaps.measured ? 'border-green-300 text-green-700 bg-green-50' : 'border-amber-300 text-amber-800 bg-amber-50'}`}
                      >
                        <Ruler className="h-3 w-3" /> {e.gaps.measured ? 'мерки ✓' : 'измери'}
                      </button>
                    )}
                    {other.length === 0 && e.gaps.ready && <span className="text-xs font-medium text-green-700">✓ спремен</span>}
                    {other.map((m) => (
                      <span key={m} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[11px]">{m}</span>
                    ))}
                  </div>
                </div>

                {measuring === e.p.id && (
                  <MeasureRow
                    entry={e}
                    sources={rankMeasurementSources(
                      { id: e.p.id, brand: e.p.brand, category: e.p.category },
                      entries.map((x) => ({ id: x.p.id, label: x.p.name || x.p.id, brand: x.p.brand, category: x.p.category, measurements: x.a.measurements, updatedAt: x.a.updatedAt })),
                    )}
                    onCancel={() => setMeasuring(null)}
                    onSave={async (measurements) => { await save(e.p.id, { measurements }); setMeasuring(null); }}
                  />
                )}

                {editingComposition === e.p.id && (
                  <CompositionRow
                    initial={e.a.composition}
                    onCancel={() => setEditingComposition(null)}
                    onSave={async (composition) => { await save(e.p.id, { composition }); setEditingComposition(null); }}
                  />
                )}
              </div>
            );
          })}

          {filtered.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-500">Ништо не фали за овој филтер.</p>}
        </div>

        {filtered.length > shown && (
          <button type="button" onClick={() => setShown((n) => n + PAGE)} className="mt-3 w-full py-2 text-sm text-blue-700 bg-white border border-slate-200 rounded-xl hover:bg-slate-50">
            Прикажи уште {Math.min(PAGE, filtered.length - shown)} (од {filtered.length - shown})
          </button>
        )}

        <p className="mt-4 text-xs text-slate-500">
          Шарата и деталите по категорија се внесуваат во формата за производ. Истите бројки: <code>npm run catalog:audit</code>.
        </p>
      </div>
    </div>
  );
}

function CompositionRow({
  initial, onSave, onCancel,
}: { initial: ProductAttributes['composition']; onSave: (c: ProductAttributes['composition']) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initial.map((f) => ({ ...f })));
  const sum = value.reduce((s, f) => s + (Number(f.pct) || 0), 0);
  return (
    <div className="px-4 pb-4 lg:pl-[4.75rem]">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 max-w-xl">
        <CompositionEditor value={value} onChange={setValue} />
        <div className="flex gap-2 mt-3">
          <button type="button" disabled={value.length > 0 && Math.abs(sum - 100) > 1e-9} onClick={() => onSave(value)} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-40">
            Зачувај состав
          </button>
          <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg">Откажи</button>
        </div>
      </div>
    </div>
  );
}

function MeasureRow({
  entry, sources, onSave, onCancel,
}: {
  entry: Entry;
  sources: ReturnType<typeof rankMeasurementSources>;
  onSave: (m: ProductAttributes['measurements']) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(entry.a.measurements);
  const errors = measurementErrors(value);
  return (
    <div className="px-4 pb-4 lg:pl-[4.75rem]">
      <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 max-w-3xl">
        <MeasurementsEditor category={entry.p.category} sizes={entry.p.sizes ?? []} value={value} onChange={setValue} sources={sources} />
        <div className="flex gap-2 mt-3">
          <button type="button" disabled={errors.length > 0} onClick={() => onSave(value)} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-40">
            Зачувај мерки
          </button>
          <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg">Откажи</button>
        </div>
      </div>
    </div>
  );
}
