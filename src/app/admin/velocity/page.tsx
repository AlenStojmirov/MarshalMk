'use client';

/**
 * Sell-through and velocity per model (Task 3.3).
 *
 * The arithmetic and the reasoning behind the classes are in
 * `src/lib/velocity.ts`. This page is the reading of it, and it is arranged
 * around the one question the other screens cannot answer: **what deserves more
 * money?** `/admin/aging` finds what to clear and `/admin/season` finds what is
 * about to stop selling; both are about getting capital out. This is the only
 * screen that points at where capital should go back in.
 *
 * Sell-through leads over rates on purpose. At one to five pieces a model, a
 * units-per-month figure is a coin flip with decimals; the share of a buy that
 * has cleared is true at any size. Rates are still shown — at category level,
 * where forty models of noise add up to a usable pace — and any model whose buy
 * was three pieces or fewer is flagged, because there one sale is a third of
 * the whole signal.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useProducts } from '@/hooks/useProducts';
import { Product } from '@/types';
import { getEffectivePrice } from '@/lib/pricing';
import { grossMargin } from '@/lib/cost';
import { getProductDisplayName } from '@/lib/product-display';
import {
  BUY_WINDOW_LABEL, NON_MERCHANDISE, PHASE_LABEL, monthOf, phaseOf, seasonOf, shouldBuyNow,
} from '@/lib/seasons';
import {
  CLASS_ACTION, CLASS_LABEL, CLASS_ORDER, MIN_AGE_TO_JUDGE, RESTOCK_RECENCY_DAYS,
  SLOW_MONTHS, VelocityClass, VelocityMetrics, isDecidable, velocityByCategory, velocityOf,
} from '@/lib/velocity';
import {
  ArrowLeft, CalendarClock, ClipboardCopy, Gauge, HelpCircle, TrendingUp, AlertTriangle,
} from 'lucide-react';

const fmt = (n: number) => Math.round(n).toLocaleString('mk-MK');
const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`);

const CLASS_TONE: Record<VelocityClass, string> = {
  soldout: 'bg-green-200 text-green-900',
  winner: 'bg-green-100 text-green-800',
  healthy: 'bg-emerald-50 text-emerald-700',
  slow: 'bg-amber-100 text-amber-800',
  offseason: 'bg-blue-100 text-blue-800',
  dead: 'bg-red-100 text-red-800',
  new: 'bg-slate-100 text-slate-600',
};

interface Entry {
  p: Product;
  m: VelocityMetrics;
  cost: number;
  margin: number | null;
}

type Sort = 'sellThrough' | 'supply' | 'cost' | 'recent';

function VelocityView() {
  const { products, loading } = useProducts();
  const [tab, setTab] = useState<VelocityClass | 'all'>('soldout');
  const [sort, setSort] = useState<Sort>('sellThrough');
  const [copied, setCopied] = useState(false);

  // One instant for the whole page, and never read during render.
  const [now] = useState(() => Date.now());
  const month = useMemo(() => monthOf(now), [now]);

  const model = useMemo(() => {
    const entries: Entry[] = [];

    for (const p of products) {
      if (NON_MERCHANDISE.has(p.category)) continue;
      const m = velocityOf(p, now, month);
      if (!isDecidable(m)) continue;
      entries.push({
        p, m,
        cost: m.onHand * (p.purchasePrice ?? 0),
        margin: grossMargin(getEffectivePrice(p), p.purchasePrice),
      });
    }

    const counts = new Map<VelocityClass, { models: number; units: number; cost: number }>();
    for (const e of entries) {
      const c = counts.get(e.m.klass) ?? { models: 0, units: 0, cost: 0 };
      c.models += 1;
      c.units += e.m.onHand;
      c.cost += e.cost;
      counts.set(e.m.klass, c);
    }

    // Overall sell-through: one number for "how much of what we bought has
    // actually left". Weighted by pieces, not averaged across models, because
    // averaging ratios would let a two-piece model outvote a forty-piece one.
    const totalSold = entries.reduce((a, e) => a + e.m.soldEver, 0);
    const totalReceived = entries.reduce((a, e) => a + e.m.receivedEst, 0);
    const sold90 = entries.reduce((a, e) => a + e.m.sold90, 0);
    const onHand = entries.reduce((a, e) => a + e.m.onHand, 0);
    const perMonth = sold90 / 3;

    return {
      entries,
      counts,
      cats: velocityByCategory(entries.map((e) => ({ p: e.p, m: e.m }))),
      sellThrough: totalReceived > 0 ? totalSold / totalReceived : null,
      perMonth,
      monthsSupply: perMonth > 0 ? onHand / perMonth : null,
      onHand,
      undated: entries.filter((e) => e.m.ageDays === null).length,
    };
  }, [products, now, month]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  // The two buy signals are one list: an empty shelf and a shelf about to be
  // empty are the same instruction, and splitting them across two panels would
  // hide half the answer.
  const restock = model.entries.filter(
    (e) => e.m.klass === 'soldout' || e.m.klass === 'winner'
  );

  // Proven demand splits three ways, and only one of them is a purchase order.
  //
  // Stale first: a model that sold out eleven months ago is a discontinued
  // line, not a gap — nobody has missed it enough to notice in a year.
  const fresh = restock.filter(
    (e) => e.m.daysSinceLastSale !== null && e.m.daysSinceLastSale <= RESTOCK_RECENCY_DAYS
  );
  const stale = restock.filter(
    (e) => e.m.daysSinceLastSale === null || e.m.daysSinceLastSale > RESTOCK_RECENCY_DAYS
  );

  // Then season. A polo that sold out in August has proven itself and is still
  // the wrong purchase in September, because its next buyer arrives in April.
  // Restocking against a closing window is how a success becomes eight months
  // of dead capital — the very mistake that filled these shelves.
  const buyNow = fresh.filter((e) => shouldBuyNow(phaseOf(e.p.category, month)));
  const buyLater = fresh.filter((e) => !shouldBuyNow(phaseOf(e.p.category, month)));
  const soldout = buyNow.filter((e) => e.m.klass === 'soldout');

  // Which windows the deferred ones are waiting for, so the note can name them.
  const laterWindows = [...new Set(
    buyLater.map((e) => BUY_WINDOW_LABEL[seasonOf(e.p.category)?.season ?? 'ALL'])
  )];

  const list = (tab === 'all' ? model.entries : model.entries.filter((e) => e.m.klass === tab))
    .slice()
    .sort((a, b) => {
      switch (sort) {
        case 'supply':
          // Nothing sold in 90 days sorts to the end rather than to infinity.
          return (a.m.monthsSupply ?? 1e9) - (b.m.monthsSupply ?? 1e9);
        case 'cost':
          return b.cost - a.cost;
        case 'recent':
          return (a.m.daysSinceLastSale ?? 1e9) - (b.m.daysSinceLastSale ?? 1e9);
        default:
          return (b.m.sellThrough ?? -1) - (a.m.sellThrough ?? -1);
      }
    });

  const shown = list.slice(0, 80);

  // The winners list leaves as text because that is how it gets used: read to a
  // supplier, or carried to the warehouse.
  const copyWinners = async () => {
    if (buyNow.length === 0) return;
    // Sold out first, then by how much of the buy cleared: an empty shelf is a
    // sale already lost, which outranks one that is only about to be.
    const ranked = buyNow.slice().sort(
      (a, b) =>
        (a.m.onHand === 0 ? 0 : 1) - (b.m.onHand === 0 ? 0 : 1) ||
        (b.m.sellThrough ?? 0) - (a.m.sellThrough ?? 0)
    );
    const text =
      `За дополнување — докажана побарувачка (${ranked.length} модели)\n` +
      `${soldout.length} распродадени, ${ranked.length - soldout.length} се празнат.\n` +
      `Sell-through, останато на полица, темпо на 90 дена:\n\n` +
      ranked
        .map(
          (e) =>
            `${getProductDisplayName(e.p.name, e.p.category, e.p.brand)} [${e.p.id}]\n` +
            `  продадено ${e.m.soldEver}/${e.m.receivedEst} (${pct(e.m.sellThrough)})` +
            ` · останува ${e.m.onHand === 0 ? 'НУЛА' : String(e.m.onHand)}` +
            ` · ${e.m.perMonth.toFixed(1)} парч./мес.` +
            (e.m.thin ? ' · мала серија, слаб сигнал' : '')
        )
        .join('\n\n');
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        <Link href="/admin" className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-800 mb-4 text-sm">
          <ArrowLeft className="h-4 w-4" />
          Назад на таблата
        </Link>

        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Sell-through и темпо</h1>
        <p className="text-sm text-slate-500 mt-1 mb-6">
          Стареењето наоѓа што да се расчисти. Сезоната наоѓа што ќе престане да се продава. Двете се
          за вадење капитал надвор. Ова е единствената страна што покажува <strong>каде капиталот
          треба да се врати внатре</strong>.
        </p>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Вкупен sell-through</p>
            <p className="text-xl font-bold text-slate-800 tabular-nums">{pct(model.sellThrough)}</p>
            <p className="text-[11px] text-slate-400">од сè што е примено, заминало</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Темпо (90 дена)</p>
            <p className="text-xl font-bold text-slate-800 tabular-nums">{model.perMonth.toFixed(0)}</p>
            <p className="text-[11px] text-slate-400">парчиња / месец</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Месеци залиха</p>
            <p className={`text-xl font-bold tabular-nums ${
              model.monthsSupply !== null && model.monthsSupply > SLOW_MONTHS ? 'text-red-700' : 'text-green-700'
            }`}>
              {model.monthsSupply === null ? '—' : model.monthsSupply.toFixed(1)}
            </p>
            <p className="text-[11px] text-slate-400">{model.onHand} парчиња · цел 3–4</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">За дополнување сега</p>
            <p className="text-xl font-bold text-green-700 tabular-nums">{buyNow.length}</p>
            <p className="text-[11px] text-slate-400">
              {soldout.length} распродадени · {buyNow.length - soldout.length} се празнат
              {buyLater.length > 0 && ` · ${buyLater.length} чекаат сезона`}
              {stale.length > 0 && ` · ${stale.length} стар доказ`}
            </p>
          </div>
        </div>

        {/* class stack */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-6 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/60 flex items-center gap-2">
            <Gauge className="h-4 w-4 text-slate-500" />
            <h2 className="font-bold text-slate-800 text-sm">Што стои каде</h2>
          </div>
          <div className="divide-y divide-slate-50">
            {CLASS_ORDER.map((k) => {
              const c = model.counts.get(k);
              if (!c) return null;
              return (
                <div key={k} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                  <span className={`px-2 py-0.5 rounded text-[11px] font-semibold shrink-0 w-24 text-center ${CLASS_TONE[k]}`}>
                    {CLASS_LABEL[k]}
                  </span>
                  <span className="text-slate-500 text-xs flex-1 min-w-0">{CLASS_ACTION[k]}</span>
                  <span className="tabular-nums text-slate-600 text-xs w-16 text-right shrink-0">
                    {c.models} мод.
                  </span>
                  <span className="tabular-nums text-slate-800 font-medium text-xs w-24 text-right shrink-0">
                    {fmt(c.cost)} ден.
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* the reorder headline */}
        {buyNow.length > 0 && (
          <div className="mb-6 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
            <div className="flex gap-2">
              <TrendingUp className="h-4 w-4 shrink-0 mt-0.5" />
              <span className="flex-1">
                <strong>{soldout.length} модели се распродадени</strong> а се продале во последните
                {RESTOCK_RECENCY_DAYS} дена, и уште{' '}
                <strong>{buyNow.length - soldout.length}</strong> имаат sell-through над 60% со под 3
                месеци залиха. Кај првите продажбата е веќе изгубена, кај вторите само што ќе биде.
                Тоа е единствената стока што заслужува нови пари додека turnover е под 2×.{' '}
                <Link href="/admin/capital" className="underline font-medium">
                  Види го буџетот
                </Link>
                .
              </span>
            </div>
            <button
              onClick={copyWinners}
              className="mt-2.5 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-semibold hover:bg-slate-900"
            >
              <ClipboardCopy className="h-3.5 w-3.5" />
              {copied ? 'Копирано' : 'Копирај ја листата'}
            </button>
          </div>
        )}

        {stale.length > 0 && (
          <div className="mb-6 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 flex gap-2 shadow-sm">
            <HelpCircle className="h-4 w-4 shrink-0 mt-0.5 text-slate-400" />
            <span>
              Уште <strong>{stale.length} модели</strong> се распродадени, но последната продажба им е
              пред повеќе од {RESTOCK_RECENCY_DAYS} дена. Тоа не е дупка на полица туку угаснат
              модел — никој не го побарал доволно за да се забележи речиси година, а и добавувачот
              веројатно веќе не го носи. Стојат во листата „Распродадена“, не во набавката.
            </span>
          </div>
        )}

        {buyLater.length > 0 && (
          <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 flex gap-2">
            <CalendarClock className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Уште <strong>{buyLater.length} модели</strong> имаат докажана побарувачка, но
              прозорецот им се затвора — <strong>не се купуваат сега</strong>. Докажана продажба не е
              причина за набавка денес: поло што се распродало во август се докажало, а во септември
              сепак е погрешна набавка, зашто следниот купувач доаѓа во април. Тие одат во
              пред-сезонската листа за {laterWindows.join(' / ')}.
            </span>
          </div>
        )}

        {/* category level — where rates are actually reliable */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-6 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/60">
            <h2 className="font-bold text-slate-800 text-sm">Темпо по категорија</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Темпото е сигурно на ова ниво, не по модел — четириесет модели шум се собираат во
              употреблива бројка, а и набавката се одлучува по категорија. За категорија со
              <strong> затворен прозорец</strong> темпото се мери на 12 месеци, не на 90 дена: 90
              дена тишина во пред-сезона го мери мртвиот дел од годината и месеците залиха тогаш
              читаат во стотици — точна аритметика, бескорисен факт.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  {['Категорија', 'Фаза', 'Модели', 'Парчиња', 'Продажби 90д', 'Парч./мес.', 'Месеци залиха', 'Sell-through', 'Набавна'].map((h, i) => (
                    <th key={h} className={`px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider ${i < 2 ? 'text-left' : 'text-right'}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {model.cats.map((c) => {
                  const phase = phaseOf(c.category, month);
                  // A shut window makes the 90-day rate a measure of the dead
                  // part of the year, so the annual one is used instead and the
                  // swap is stated rather than hidden.
                  const shut = phase === 'preseason' || phase === 'offseason';
                  const rate = shut ? c.perMonthAnnual : c.perMonth;
                  const supply = shut ? c.monthsSupplyAnnual : c.monthsSupply;
                  return (
                    <tr key={c.category}>
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-700">{c.category}</td>
                      <td className="px-3 py-2.5 text-[11px] text-slate-500">{PHASE_LABEL[phase]}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{c.models}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{c.onHand}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{c.sold90}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">
                        {rate.toFixed(1)}
                        {shut && (
                          <span className="ml-1 text-[10px] text-blue-600" title="мерено на 12 месеци, прозорецот е затворен">
                            год.
                          </span>
                        )}
                      </td>
                      <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${
                        supply === null ? 'text-slate-300'
                          : supply > SLOW_MONTHS ? 'text-red-700' : 'text-green-700'
                      }`}>
                        {supply === null ? 'нема продажби' : supply.toFixed(1)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{pct(c.sellThrough)}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-800 font-medium">{fmt(c.cost)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* model level */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/60 flex flex-wrap items-center gap-2">
            <h2 className="font-bold text-slate-800 text-sm">По модел</h2>
            <div className="ml-auto flex flex-wrap gap-1.5">
              {(['all', ...CLASS_ORDER] as const).map((k) => {
                const n = k === 'all' ? model.entries.length : model.counts.get(k)?.models ?? 0;
                if (n === 0) return null;
                return (
                  <button
                    key={k}
                    onClick={() => setTab(k)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                      tab === k ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600'
                    }`}
                  >
                    {k === 'all' ? `Сите (${n})` : `${CLASS_LABEL[k]} (${n})`}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="px-4 py-2 border-b border-slate-100 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-500">Подреди:</span>
            {([
              ['sellThrough', 'Sell-through'],
              ['supply', 'Месеци залиха'],
              ['recent', 'Последна продажба'],
              ['cost', 'Врзан капитал'],
            ] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setSort(k)}
                className={`px-2 py-0.5 rounded-lg font-medium transition-colors ${
                  sort === k ? 'bg-slate-200 text-slate-800' : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {shown.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-400">Нема модели во оваа група.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    {['Модел', 'Класа', 'Продадено / примено', 'Sell-through', 'Останува', 'Парч./мес.', 'Месеци', 'Од последна', 'Возраст', 'Набавна'].map((h, i) => (
                      <th key={h} className={`px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider ${i < 2 ? 'text-left' : 'text-right'}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {shown.map(({ p, m, cost }) => (
                    <tr key={p.id} className="hover:bg-slate-50/60">
                      <td className="px-3 py-2.5 max-w-[220px]">
                        <Link
                          href={`/admin/product/${p.id}`}
                          className="block font-medium text-slate-800 hover:text-blue-600 text-xs truncate"
                        >
                          {getProductDisplayName(p.name, p.category, p.brand)}
                        </Link>
                        <p className="text-[10px] text-slate-400 font-mono truncate">
                          {p.category}
                          {p.isVisible === false ? ' · скриен' : ''}
                        </p>
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${CLASS_TONE[m.klass]}`}>
                          {CLASS_LABEL[m.klass]}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-xs text-slate-600">
                        {m.soldEver} / {m.receivedEst}
                        {m.thin && (
                          <span
                            className="ml-1 text-amber-600"
                            title="Мала серија — една продажба менува голем дел од бројката"
                          >
                            ⚠
                          </span>
                        )}
                      </td>
                      <td className={`px-3 py-2.5 text-right tabular-nums font-semibold text-xs ${
                        m.sellThrough === null ? 'text-slate-300'
                          : m.sellThrough >= 0.6 ? 'text-green-700'
                          : m.sellThrough >= 0.3 ? 'text-slate-700' : 'text-red-700'
                      }`}>
                        {pct(m.sellThrough)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-600 text-xs">{m.onHand}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-600 text-xs">
                        {m.perMonth > 0 ? m.perMonth.toFixed(1) : '—'}
                      </td>
                      <td className={`px-3 py-2.5 text-right tabular-nums text-xs ${
                        m.monthsSupply === null ? 'text-slate-300'
                          : m.monthsSupply > SLOW_MONTHS ? 'text-red-700' : 'text-slate-700'
                      }`}>
                        {m.monthsSupply === null ? '—' : m.monthsSupply.toFixed(1)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-500 text-xs">
                        {m.daysSinceLastSale === null ? 'никогаш' : `${m.daysSinceLastSale}д`}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-500 text-xs">
                        {m.ageDays === null ? '—' : `${m.ageDays}д`}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-800 font-medium text-xs">
                        {fmt(cost)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {list.length > shown.length && (
                <p className="px-4 py-3 text-xs text-slate-400 text-center">
                  … и уште {list.length - shown.length}.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="mt-4 space-y-2">
          <p className="text-[11px] text-slate-400 flex items-start gap-1.5">
            <HelpCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>
              „Примено“ е проценка: што е на полица плус што заминало. Тоа е <strong>долна
              граница</strong> — отпис без запис во <code>sold[]</code> не се брои, што ја намалува
              примената количина и со тоа го <em>зголемува</em> sell-through. Подароци и лична
              потрошувачка се бројат како заминато, но не како побарувачка (D-005), што повлекува во
              спротивна насока.
            </span>
          </p>
          <p className="text-[11px] text-slate-400 flex items-start gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
            <span>
              Модел под {MIN_AGE_TO_JUDGE} дена на полица не се суди — рано судење е начин добра
              стока да се расчисти по грешка. Зимска јакна без продажба во јули не е бавна, туку вон
              прозорец; но сезоната е изговор само еднаш — цела година без продажба веќе ја
              содржела својата сезона.
              {model.undated > 0 && (
                <> {model.undated} модели немаат датум на прием, па возраста им е празна.</>
              )}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function VelocityPage() {
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

  return <VelocityView />;
}
