'use client';

/**
 * Stock ageing — the clearance workspace (action A2 in docs/TURNAROUND.md).
 *
 * 429.576 den. of capital sits above a healthy level, and the question that
 * frees it is not "what is old" but "what is old *and* not selling". Age alone
 * condemns a slow, high-margin line that is doing nothing wrong; age with no
 * sales behind it is money that has stopped moving.
 *
 * Ages come from `first_received_at`. For anything received before that field
 * existed the date is inferred from the earliest sale or the sync date, which
 * is an upper bound on arrival — so an estimated age is a *lower* bound. Those
 * rows are marked, because an estimate read as a measurement is worse than no
 * estimate at all.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useProducts } from '@/hooks/useProducts';
import { Product } from '@/types';
import { getEffectivePrice, isOnSale } from '@/lib/pricing';
import { grossMargin } from '@/lib/cost';
import { getProductDisplayName } from '@/lib/product-display';
import { AlertTriangle, ArrowLeft, Clock, HelpCircle } from 'lucide-react';

const DAY = 86_400_000;
const fmt = (n: number) => Math.round(n).toLocaleString('mk-MK');
const NON_MERCHANDISE = new Set(['vaucer']);

/** Health targets from docs/TURNAROUND.md. */
const DEAD_TARGET = 0.08;
const SLOW_TARGET = 0.2;

const BUCKETS = [
  { label: '0–30 дена', min: 0, max: 30, tone: 'text-green-700' },
  { label: '31–90', min: 31, max: 90, tone: 'text-green-700' },
  { label: '91–180', min: 91, max: 180, tone: 'text-amber-700' },
  { label: '181–365', min: 181, max: 365, tone: 'text-red-700' },
  { label: 'над 365', min: 366, max: Infinity, tone: 'text-red-800' },
];

interface Entry {
  p: Product;
  units: number;
  cost: number;
  retail: number;
  age: number | null;
  estimated: boolean;
  sold90: number;
  sold365: number;
  margin: number | null;
}

function AgingView() {
  const { products, loading } = useProducts();
  const [tab, setTab] = useState<'clearance' | 'all'>('clearance');

  // Frozen once per mount rather than read during render: ages do not need to
  // tick, and reading the clock inside a memo makes the render impure.
  const [now] = useState(() => Date.now());

  const model = useMemo(() => {
    const entries: Entry[] = products
      .filter((p) => !NON_MERCHANDISE.has(p.category))
      .map((p) => {
        const units = (p.sizes ?? []).reduce((a, s) => a + Math.max(0, Number(s.quantity) || 0), 0);
        const price = getEffectivePrice(p);
        const soldSince = (d: number) =>
          (p.sold ?? []).filter(
            (s) => Number(s.price) > 0 && Date.parse(String(s.soldDate)) >= now - d * DAY
          ).length;
        return {
          p,
          units,
          cost: units * (p.purchasePrice ?? 0),
          retail: units * price,
          age: p.firstReceivedAt ? Math.floor((now - p.firstReceivedAt.getTime()) / DAY) : null,
          estimated: p.firstReceivedEstimated === true,
          sold90: soldSince(90),
          sold365: soldSince(365),
          margin: grossMargin(price, p.purchasePrice),
        };
      })
      .filter((e) => e.units > 0);

    const totalCost = entries.reduce((a, e) => a + e.cost, 0);
    const dated = entries.filter((e) => e.age !== null);
    const undated = entries.filter((e) => e.age === null);

    const buckets = BUCKETS.map((b) => {
      const inB = dated.filter((e) => e.age! >= b.min && e.age! <= b.max);
      return {
        ...b,
        models: inB.length,
        units: inB.reduce((a, e) => a + e.units, 0),
        cost: inB.reduce((a, e) => a + e.cost, 0),
        retail: inB.reduce((a, e) => a + e.retail, 0),
      };
    });

    const dead = dated.filter((e) => e.age! > 180);
    const slow = dated.filter((e) => e.age! >= 91 && e.age! <= 180);

    // The clearance list: old, and nothing sold in a year. Age alone is not a
    // verdict — a slow high-margin line can be perfectly healthy.
    const clearance = dated
      .filter((e) => e.age! > 180 && e.sold365 === 0)
      .sort((a, b) => b.cost - a.cost);

    return {
      entries, dated, undated, buckets, totalCost,
      deadCost: dead.reduce((a, e) => a + e.cost, 0),
      slowCost: slow.reduce((a, e) => a + e.cost, 0),
      clearance,
      estimatedCount: dated.filter((e) => e.estimated).length,
    };
  }, [products, now]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const deadPct = model.totalCost > 0 ? model.deadCost / model.totalCost : 0;
  const slowPct = model.totalCost > 0 ? model.slowCost / model.totalCost : 0;
  const list = tab === 'clearance' ? model.clearance : [...model.dated].sort((a, b) => (b.age ?? 0) - (a.age ?? 0));

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        <Link href="/admin" className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-800 mb-4 text-sm">
          <ArrowLeft className="h-4 w-4" />
          Назад на таблата
        </Link>

        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Стареење на залихата</h1>
        <p className="text-sm text-slate-500 mt-1 mb-6">
          Возраста сама по себе не е пресуда — бавна стока со добра маржа не прави ништо лошо.
          Стара стока <strong>без ниту една продажба</strong> е пари што застанале.
        </p>

        {model.undated.length > 0 && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex gap-2">
            <HelpCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              <strong>{model.undated.length}</strong> модели со залиха немаат датум на прием, па не влегуваат
              во пресметката. Пушти <code className="font-mono text-xs">npm run ageing:estimate apply</code> за да
              се процени од најраната продажба.
            </span>
          </div>
        )}

        {/* health */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Капитал во залиха</p>
            <p className="text-xl font-bold text-slate-800 tabular-nums">{fmt(model.totalCost)}</p>
            <p className="text-[11px] text-slate-400">денари, по набавна</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Мртва (над 180д)</p>
            <p className={`text-xl font-bold tabular-nums ${deadPct > DEAD_TARGET ? 'text-red-700' : 'text-green-700'}`}>
              {(deadPct * 100).toFixed(1)}%
            </p>
            <p className="text-[11px] text-slate-400">{fmt(model.deadCost)} ден. · цел под 8%</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Бавна (91–180д)</p>
            <p className={`text-xl font-bold tabular-nums ${slowPct > SLOW_TARGET ? 'text-amber-700' : 'text-green-700'}`}>
              {(slowPct * 100).toFixed(1)}%
            </p>
            <p className="text-[11px] text-slate-400">{fmt(model.slowCost)} ден. · цел под 20%</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">За расчистување</p>
            <p className="text-xl font-bold text-red-700 tabular-nums">{model.clearance.length}</p>
            <p className="text-[11px] text-slate-400">
              {fmt(model.clearance.reduce((a, e) => a + e.cost, 0))} ден. заглавени
            </p>
          </div>
        </div>

        {/* buckets */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-6 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/60 flex items-center gap-2">
            <Clock className="h-4 w-4 text-slate-500" />
            <h2 className="font-bold text-slate-800 text-sm">По возраст</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  {['Возраст', 'Модели', 'Парчиња', 'Набавна', 'Продажна', 'Дел од капитал'].map((h, i) => (
                    <th key={h} className={`px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider ${i === 0 ? 'text-left' : 'text-right'}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {model.buckets.map((b) => (
                  <tr key={b.label}>
                    <td className={`px-3 py-2.5 font-medium ${b.tone}`}>{b.label}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{b.models || '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{b.units || '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-800">{b.cost ? fmt(b.cost) : '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{b.retail ? fmt(b.retail) : '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                      {model.totalCost > 0 ? ((b.cost / model.totalCost) * 100).toFixed(1) + '%' : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* list */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/60 flex items-center gap-2">
            <h2 className="font-bold text-slate-800 text-sm">
              {tab === 'clearance' ? 'Кандидати за расчистување' : 'Сите со датум, најстари прво'}
            </h2>
            <div className="ml-auto flex gap-1.5">
              {(['clearance', 'all'] as const).map((k) => (
                <button
                  key={k}
                  onClick={() => setTab(k)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors ${
                    tab === k ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600'
                  }`}
                >
                  {k === 'clearance' ? `Расчистување (${model.clearance.length})` : `Сите (${model.dated.length})`}
                </button>
              ))}
            </div>
          </div>

          {tab === 'clearance' && (
            <p className="px-4 py-2 text-xs text-slate-500 bg-amber-50/50 border-b border-slate-100">
              Над 180 дена и <strong>ниту една продажба во последната година</strong>. Рано и плитко намалување
              враќа повеќе кеш од доцно и длабоко — парите се враќаат во циклус што уште има сезона пред себе.
            </p>
          )}

          {list.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-400">
              {model.dated.length === 0 ? 'Нема производи со датум на прием.' : 'Нема ништо во оваа листа.'}
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {list.slice(0, 60).map((e) => (
                <div key={e.p.id} className="flex items-center gap-3 px-3 sm:px-4 py-3 hover:bg-slate-50/60">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/admin/product/${e.p.id}`}
                      className="block font-semibold text-slate-800 hover:text-blue-600 text-sm truncate"
                    >
                      {getProductDisplayName(e.p.name, e.p.category, e.p.brand)}
                    </Link>
                    <p className="text-[11px] text-slate-400 font-mono truncate">
                      {e.p.id}
                      {e.p.isVisible === false ? ' · скриен' : ''}
                      {isOnSale(e.p) ? ' · веќе на попуст' : ''}
                    </p>
                  </div>
                  <div className="text-right w-20 shrink-0">
                    <p className="text-sm font-semibold text-slate-800 tabular-nums">
                      {e.age} <span className="text-[11px] font-normal text-slate-400">дена</span>
                    </p>
                    {e.estimated && <p className="text-[10px] text-amber-600">проценка</p>}
                  </div>
                  <div className="text-right w-14 shrink-0 tabular-nums">
                    <p className="text-sm text-slate-700">{e.units}</p>
                    <p className="text-[11px] text-slate-400">парч.</p>
                  </div>
                  <div className="hidden sm:block text-right w-20 shrink-0 tabular-nums">
                    <p className="text-sm font-semibold text-slate-800">{fmt(e.cost)}</p>
                    <p className="text-[11px] text-slate-400">набавна</p>
                  </div>
                  <div className="hidden md:block text-right w-16 shrink-0 tabular-nums">
                    <p className="text-sm text-slate-700">{e.sold365}</p>
                    <p className="text-[11px] text-slate-400">год.</p>
                  </div>
                  <div className="hidden lg:block text-right w-14 shrink-0 tabular-nums">
                    <p className={`text-sm font-semibold ${
                      e.margin === null ? 'text-slate-300' : e.margin < 0.25 ? 'text-red-700' : 'text-slate-700'
                    }`}>
                      {e.margin === null ? '—' : (e.margin * 100).toFixed(0) + '%'}
                    </p>
                    <p className="text-[11px] text-slate-400">маржа</p>
                  </div>
                </div>
              ))}
              {list.length > 60 && (
                <p className="px-4 py-3 text-xs text-slate-400 text-center">
                  … и уште {list.length - 60}. Целосната листа е во `npm run baseline`.
                </p>
              )}
            </div>
          )}
        </div>

        {model.estimatedCount > 0 && (
          <p className="text-[11px] text-slate-400 mt-4 flex items-start gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
            {model.estimatedCount} од {model.dated.length} возрасти се проценети од најраната продажба,
            не измерени при прием. Проценката е долна граница — таа стока е барем толку стара, можеби постара.
          </p>
        )}
      </div>
    </div>
  );
}

export default function AgingPage() {
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

  return <AgingView />;
}
