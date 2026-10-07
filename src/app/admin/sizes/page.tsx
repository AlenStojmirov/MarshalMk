'use client';

/**
 * Broken size runs, and what to do about them (A5 in docs/TURNAROUND.md,
 * rewritten for D-029).
 *
 * The first version of this screen priced "top up only the missing M/L/XL" —
 * one L and one XL, a few hundred denars a piece. The owner (2026-10-07): that
 * order does not exist. Suppliers sell a model as a series, S–XXL or 30–38,
 * one of each, so a broken run is mended only by a whole series, and the
 * series brings another S and XXL with it.
 *
 * So the screen still finds the broken runs, and still splits them by one
 * question — has the model sold in the last year? — but the two answers are now:
 *
 *   sold in the last year  → would a whole series sell? (series.ts, the same
 *                            forecast the reorder plan uses)
 *                              yes → it is bought through /admin/reorder
 *                              no  → sell what is left; with one or two sizes
 *                                    on the shelf the till may discount (D-027)
 *   nothing sold in a year → clear it, do not repair it
 *
 * Whether a series that pays is bought *now* is the plan's call — the season
 * window and the budget decide that there, not here.
 *
 * Only letter sizes are judged. A numeric run (29–34) has no fixed core and a
 * gap in it means something different, so those models are counted out loud and
 * left alone rather than quietly folded in.
 */

import { useMemo, useState } from 'react';
import { canonicalSize } from '@/lib/sizes';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useProducts } from '@/hooks/useProducts';
import { Product } from '@/types';
import { getEffectivePrice } from '@/lib/pricing';
import { grossMargin } from '@/lib/cost';
import { getProductDisplayName } from '@/lib/product-display';
import { velocityOf } from '@/lib/velocity';
import {
  MIN_SERIES_SELL_THROUGH, SERIES_HORIZON_MONTHS, forecastSeries, seriesContext, seriesLabel,
} from '@/lib/series';
import { ArrowLeft, Ban, Ruler, ShoppingBasket } from 'lucide-react';

const DAY = 86_400_000;
const fmt = (n: number) => Math.round(n).toLocaleString('mk-MK');
const NON_MERCHANDISE = new Set(['vaucer']);

/** The sizes that carry the business. A run without one of them is broken. */
const CORE = ['M', 'L', 'XL'];
/** Any of these makes a model "letter sized" and therefore judgeable here. */
const LETTER = ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

interface Row {
  p: Product;
  /** Sizes currently on the shelf, with quantities. */
  inStock: Map<string, number>;
  /** The model's series (series.ts). */
  series: string[];
  unitCost: number;
  /** No core size at all — the middle of the run is gone, only edges remain. */
  edgesOnly: boolean;
  units: number;
  cost: number;
  sold365: number;
  soldBySize: Map<string, number>;
  margin: number | null;
  /** One new series: pieces, cost, and what is expected to sell within the horizon. */
  seriesPieces: number;
  seriesCost: number;
  expected: number;
  sellThrough: number;
  worth: boolean;
}

// XXL and 2XL are one size (9.8).
const normSize = canonicalSize;

function SizesView() {
  const { products, loading } = useProducts();
  const [tab, setTab] = useState<'topup' | 'clear'>('topup');

  // Frozen per mount: ages and windows do not need to tick, and reading the
  // clock during render makes the render impure.
  const [now] = useState(() => Date.now());

  const model = useMemo(() => {
    let liveLetterModels = 0;
    let numericSkipped = 0;
    let complete = 0;
    const ctx = seriesContext(products);

    const broken: Row[] = [];

    for (const p of products) {
      if (NON_MERCHANDISE.has(p.category)) continue;

      const sizes = (p.sizes ?? []).filter((s) => Number(s.quantity) >= 1);
      const units = sizes.reduce((a, s) => a + Number(s.quantity), 0);
      if (units === 0) continue;
      if (p.isVisible === false) continue; // A3's problem, not A5's

      const inStock = new Map<string, number>();
      for (const s of sizes) {
        const key = normSize(s.size);
        inStock.set(key, (inStock.get(key) ?? 0) + Number(s.quantity));
      }

      const isLetter = LETTER.some((l) => inStock.has(l));
      if (!isLetter) {
        numericSkipped += 1;
        continue;
      }
      liveLetterModels += 1;

      if (CORE.every((c) => inStock.has(c))) {
        complete += 1;
        continue;
      }

      const soldBySize = new Map<string, number>();
      let sold365 = 0;
      for (const s of p.sold ?? []) {
        if (Number(s.price) <= 0) continue; // giveaways are not demand
        const t = Date.parse(String(s.soldDate));
        if (!Number.isFinite(t) || t < now - 365 * DAY) continue;
        sold365 += 1;
        const key = normSize(s.size);
        soldBySize.set(key, (soldBySize.get(key) ?? 0) + 1);
      }

      const unitCost = p.purchasePrice ?? 0;
      const f = forecastSeries(p, velocityOf(p, now), ctx, now, SERIES_HORIZON_MONTHS, 1);
      broken.push({
        p,
        inStock,
        series: f.series,
        unitCost,
        edgesOnly: !CORE.some((c) => inStock.has(c)),
        units,
        cost: units * unitCost,
        sold365,
        soldBySize,
        margin: grossMargin(getEffectivePrice(p), p.purchasePrice),
        seriesPieces: f.pieces,
        seriesCost: f.pieces * unitCost,
        expected: f.expected[0],
        sellThrough: f.sellThrough[0],
        worth: f.sellThrough[0] >= MIN_SERIES_SELL_THROUGH,
      });
    }

    // Proven demand first, the series closest to paying at the top.
    const topup = broken
      .filter((r) => r.sold365 > 0)
      .sort((a, b) => b.sellThrough - a.sellThrough || b.sold365 - a.sold365);
    const clear = broken
      .filter((r) => r.sold365 === 0)
      .sort((a, b) => b.cost - a.cost);
    const worth = topup.filter((r) => r.worth);

    return {
      liveLetterModels,
      numericSkipped,
      complete,
      broken,
      topup,
      clear,
      worth: worth.length,
      worthCost: worth.reduce((a, r) => a + r.seriesCost, 0),
      notWorth: topup.length - worth.length,
      clearCost: clear.reduce((a, r) => a + r.cost, 0),
    };
  }, [products, now]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const list = tab === 'topup' ? model.topup : model.clear;
  const brokenPct = model.liveLetterModels > 0 ? model.broken.length / model.liveLetterModels : 0;
  const bar = Math.round(MIN_SERIES_SELL_THROUGH * 100);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        <Link href="/admin" className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-800 mb-4 text-sm">
          <ArrowLeft className="h-4 w-4" />
          Назад на таблата
        </Link>

        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Скршени серии</h1>
        <p className="text-sm text-slate-500 mt-1 mb-6">
          Купувач што не ја наоѓа својата големина е изгубена продажба која никаде не се запишува.
          Но големина поединечно не се купува: добавувачот продава <strong>цела серија</strong>, и таа
          носи уште едно S и XXL. Затоа прашањето е дали цела серија ќе се продаде, а не дали фали L.
        </p>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Скршена серија</p>
            <p className="text-xl font-bold text-amber-700 tabular-nums">{model.broken.length}</p>
            <p className="text-[11px] text-slate-400">
              од {model.liveLetterModels} живи · {(brokenPct * 100).toFixed(0)}%
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Цела серија се исплатува</p>
            <p className="text-xl font-bold text-green-700 tabular-nums">{model.worth}</p>
            <p className="text-[11px] text-slate-400">{fmt(model.worthCost)} ден. за по една серија</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Не се исплатува серија</p>
            <p className="text-xl font-bold text-slate-800 tabular-nums">{model.notWorth}</p>
            <p className="text-[11px] text-slate-400">се продава остатокот (D-027)</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Не се поправаат</p>
            <p className="text-xl font-bold text-red-700 tabular-nums">{model.clear.length}</p>
            <p className="text-[11px] text-slate-400">{fmt(model.clearCost)} ден. заглавени</p>
          </div>
        </div>

        <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 flex gap-2">
          <ShoppingBasket className="h-4 w-4 shrink-0 mt-0.5" />
          <span>
            Серијата <strong>се исплатува</strong> ако барем {bar}% од неа се очекува да се продаде за{' '}
            {SERIES_HORIZON_MONTHS} месеци: темпото на моделот, делот на секоја големина и тоа што веќе стои на
            полица (D-029). Таквата се нарачува преку{' '}
            <Link href="/admin/reorder" className="underline font-medium">Планот за набавка</Link>, каде
            одлучуваат и сезоната и буџетот. Ако не се исплатува, остатокот се продава: со една или две
            големини на полица попустот е дозволен (D-027,{' '}
            <Link href="/admin/discounts" className="underline font-medium">Попусти</Link>).
          </span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/60 flex items-center gap-2">
            <Ruler className="h-4 w-4 text-slate-500" />
            <h2 className="font-bold text-slate-800 text-sm">
              {tab === 'topup' ? 'Има продажба — цела серија или продај го остатокот' : 'Расчисти — нема ниту една продажба'}
            </h2>
            <div className="ml-auto flex gap-1.5">
              {(['topup', 'clear'] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    tab === k ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600'
                  }`}
                >
                  {k === 'topup' ? `Има продажба (${model.topup.length})` : `Расчисти (${model.clear.length})`}
                </button>
              ))}
            </div>
          </div>

          {tab === 'clear' && (
            <p className="px-4 py-2 text-xs text-slate-500 bg-red-50/50 border-b border-slate-100 flex items-start gap-1.5">
              <Ban className="h-3.5 w-3.5 shrink-0 mt-px text-red-500" />
              <span>
                Скршена серија <strong>и</strong> нула продажби. Нова серија овде би платила двапати за
                иста грешка — овие одат на намалување.{' '}
                <Link href="/admin/aging" className="underline font-medium">
                  Отвори расчистување
                </Link>
                .
              </span>
            </p>
          )}

          {list.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-400">
              {model.liveLetterModels === 0
                ? 'Нема живи модели со буквени големини.'
                : 'Сите серии во оваа листа се цели.'}
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {list.slice(0, 80).map((r) => (
                <div key={r.p.id} className="flex items-start gap-3 px-3 sm:px-4 py-3 hover:bg-slate-50/60">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/admin/product/${r.p.id}`}
                      className="block font-semibold text-slate-800 hover:text-blue-600 text-sm truncate"
                    >
                      {getProductDisplayName(r.p.name, r.p.category, r.p.brand)}
                    </Link>

                    {/* The series itself, in order: what is on the shelf, and the gaps. */}
                    <div className="flex flex-wrap items-center gap-1 mt-1.5">
                      {r.series.map((size) => {
                        const qty = r.inStock.get(size);
                        const sold = (r.soldBySize.get(size) ?? 0) > 0;
                        return (
                          <span
                            key={size}
                            title={
                              qty ? 'на залиха'
                                : sold ? 'нема залиха, се продавала'
                                : 'нема залиха, никогаш не се продала'
                            }
                            className={`px-1.5 py-0.5 rounded text-[11px] font-semibold tabular-nums ${
                              qty
                                ? 'bg-slate-100 text-slate-700'
                                : sold
                                  ? 'bg-red-100 text-red-700 border border-dashed border-red-300'
                                  : 'bg-slate-50 text-slate-400 border border-dashed border-slate-200'
                            }`}
                          >
                            {size}
                            {qty ? <span className="font-normal text-slate-400"> ·{qty}</span> : ' —'}
                          </span>
                        );
                      })}
                      {r.edgesOnly && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-amber-100 text-amber-800">
                          само рабни
                        </span>
                      )}
                    </div>

                    {r.sold365 > 0 && (
                      <p className="text-[11px] text-slate-500 mt-1">
                        продадено 12м:{' '}
                        {[...r.soldBySize.entries()]
                          .sort((a, b) => b[1] - a[1])
                          .map(([s, n]) => `${s}×${n}`)
                          .join('  ')}
                      </p>
                    )}

                    {tab === 'topup' && (
                      <p className="text-[11px] mt-1">
                        <span className="text-slate-500">
                          Нова серија {seriesLabel(r.series)}: {r.seriesPieces} парч. · {fmt(r.seriesCost)} ден. ·
                          очекувано {r.expected.toFixed(1)} од {r.seriesPieces} за {SERIES_HORIZON_MONTHS} мес.
                          ({Math.round(r.sellThrough * 100)}%)
                        </span>{' '}
                        {r.worth ? (
                          <Link href="/admin/reorder" className="font-semibold text-green-700 underline">
                            се исплатува → План за набавка
                          </Link>
                        ) : (
                          <span className="font-semibold text-amber-700">
                            не се исплатува → продај го остатокот
                          </span>
                        )}
                      </p>
                    )}
                  </div>

                  <div className="text-right w-16 shrink-0 tabular-nums">
                    <p className="text-sm font-semibold text-slate-800">{r.sold365}</p>
                    <p className="text-[11px] text-slate-400">прод. 12м</p>
                  </div>
                  <div className="hidden sm:block text-right w-20 shrink-0 tabular-nums">
                    <p className="text-sm font-semibold text-slate-800">{fmt(r.cost)}</p>
                    <p className="text-[11px] text-slate-400">на полица</p>
                  </div>
                  <div className="hidden lg:block text-right w-14 shrink-0 tabular-nums">
                    <p className={`text-sm font-semibold ${
                      r.margin === null ? 'text-slate-300' : r.margin < 0.25 ? 'text-red-700' : 'text-slate-700'
                    }`}>
                      {r.margin === null ? '—' : (r.margin * 100).toFixed(0) + '%'}
                    </p>
                    <p className="text-[11px] text-slate-400">маржа</p>
                  </div>
                </div>
              ))}
              {list.length > 80 && (
                <p className="px-4 py-3 text-xs text-slate-400 text-center">… и уште {list.length - 80}.</p>
              )}
            </div>
          )}
        </div>

        <p className="text-[11px] text-slate-400 mt-4">
          Судат се само живи модели со буквени големини, на кои им фали M, L или XL.{' '}
          {model.numericSkipped} модели со бројчени серии (фармерки, панталони) се изоставени тука; во
          Планот за набавка и тие се купуваат во цела серија. Серијата на моделот е онаа што ја имал на
          полица или продал; ако се премалку големини, вообичаената за категоријата. Цената на серијата е
          по последната позната набавна цена — претпоставка, не понуда од добавувач.
        </p>
      </div>
    </div>
  );
}

export default function SizesPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-500 mb-4">Please log in to access this page.</p>
          <Link href="/admin" className="text-blue-600 hover:text-blue-700 font-medium">
            Go to Admin Login
          </Link>
        </div>
      </div>
    );
  }

  return <SizesView />;
}
