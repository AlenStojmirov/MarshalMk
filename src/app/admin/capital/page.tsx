'use client';

/**
 * Where the next purchase money should go (D-023).
 *
 * Three answers, in the order they are needed:
 *
 *  1. **Zero.** What a month has to sell to cover its costs, at the margin the
 *     shop actually makes — and how far the last twelve months were from it.
 *  2. **How much.** The shop keeps 600.000 den. of stock at cost. What the next
 *     thirty days sell is replaced, less whatever the shelf is above target.
 *  3. **Where.** Each group's share of the 600.000 follows what it sells in the
 *     coming half year; the money goes to the groups below their share.
 *
 * The arithmetic is in `src/lib/open-to-buy.ts`, shared with the reorder plan
 * and the dashboard, so the three screens cannot disagree about the number.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useProducts } from '@/hooks/useProducts';
import { Expense, expensesForPeriod, getExpenses, periodOf } from '@/lib/expenses';
import { knownOpex } from '@/lib/break-even';
import {
  OTB_HORIZON_DAYS, SHARE_WINDOW_DAYS, STOCK_TARGET_COST, openToBuy,
} from '@/lib/open-to-buy';
import { ArrowLeft, Coins, PackagePlus, Scale, Target } from 'lucide-react';

const fmt = (n: number) => Math.round(n).toLocaleString('mk-MK');
const signed = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n));

function CapitalView() {
  const { products, loading } = useProducts();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    // Optional: without entered costs the owner's 65.000 estimate is used.
    getExpenses().then(setExpenses).catch(() => setExpenses([]));
  }, []);

  const otb = useMemo(() => {
    const e = expensesForPeriod(expenses, periodOf(new Date(now)));
    // Only a whole month counts (break-even.ts): the rent alone would put zero at a tenth of itself.
    return openToBuy(products, { now, opex: knownOpex(e.items) });
  }, [products, expenses, now]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const short = otb.revenueGap > 0;
  const monthsAtZero = Number.isFinite(otb.breakEvenCogs) && otb.breakEvenCogs > 0
    ? otb.target / otb.breakEvenCogs
    : null;
  const buying = otb.groups.filter((g) => g.buy > 0);
  const maxBuy = Math.max(1, ...buying.map((g) => g.buy));

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        <Link href="/admin" className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-800 mb-4 text-sm">
          <ArrowLeft className="h-4 w-4" />
          Назад на таблата
        </Link>

        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Каде да одат следните денари</h1>
        <p className="text-sm text-slate-500 mt-1 mb-6">
          Целта е {fmt(STOCK_TARGET_COST)} ден. залиха по набавна. Што ќе се продаде — се докупува,
          таму каде што фали.
        </p>

        {/* 1 · zero */}
        <section className={`rounded-xl border p-5 mb-5 shadow-sm ${short ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
          <div className="flex items-center gap-2 mb-3">
            <Scale className={`h-5 w-5 ${short ? 'text-red-700' : 'text-green-700'}`} />
            <h2 className={`font-bold ${short ? 'text-red-900' : 'text-green-900'}`}>
              Нула: {fmt(otb.breakEvenRevenue)} ден. промет месечно
            </h2>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            {[
              { k: 'Трошоци месечно', v: fmt(otb.opex), hint: otb.opexKnown ? 'внесени за овој месец' : 'претпоставка — внеси ги во Финансии' },
              { k: 'Маржа 12 м.', v: `${(otb.grossMargin * 100).toFixed(1)}%`, hint: `1 ден. набавна се продава за ${otb.markupMultiple.toFixed(2)}` },
              { k: 'Промет 12 м., просек', v: fmt(otb.monthlyRevenue), hint: `бруто ${fmt(otb.monthlyGross)} месечно` },
              { k: short ? 'Фали месечно' : 'Над нулата', v: fmt(Math.abs(otb.revenueGap)), hint: 'промет', tone: short ? 'text-red-700' : 'text-green-700' },
            ].map((x) => (
              <div key={x.k} className="bg-white/70 rounded-lg px-3 py-2">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{x.k}</p>
                <p className={`text-lg font-bold tabular-nums ${x.tone ?? 'text-slate-800'}`}>{x.v}</p>
                <p className="text-[10px] text-slate-400">{x.hint}</p>
              </div>
            ))}
          </div>
          <p className="text-sm text-slate-700">
            Бруто профитот треба да ги покрие трошоците: {fmt(otb.opex)} ÷ {(otb.grossMargin * 100).toFixed(1)}% ={' '}
            <strong>{fmt(otb.breakEvenRevenue)}</strong> ден. промет, односно{' '}
            <strong>{fmt(otb.breakEvenCogs)}</strong> ден. стока по набавна што излегува од полиците секој месец.
            При маржа од 100% (500 → 1.000) би било {fmt(otb.opex * 2)}.
          </p>
          {monthsAtZero !== null && (
            <p className="text-xs text-slate-600 mt-2">
              Со {fmt(otb.target)} залиха, нулата бара залихата да се продаде за околу{' '}
              <strong>{monthsAtZero.toFixed(1)} месеци</strong> (обрт {otb.breakEvenTurnover.toFixed(2)}× годишно).
              Сега се продава за <strong>{Number.isFinite(otb.monthsOfSupply) ? otb.monthsOfSupply.toFixed(1) : '∞'} месеци</strong>{' '}
              (обрт {otb.turnover.toFixed(2)}×) — пократкото доаѓа од повеќе продажба, не од помалку стока.
            </p>
          )}
        </section>

        {/* 2 · how much */}
        <section className={`rounded-xl border p-5 mb-5 shadow-sm ${otb.budget > 0 ? 'border-green-200 bg-white' : 'border-amber-200 bg-amber-50'}`}>
          <div className="flex items-center gap-2 mb-3">
            <Target className="h-5 w-5 text-slate-600" />
            <h2 className="font-bold text-slate-900">
              Набавка за следните {OTB_HORIZON_DAYS} дена: {fmt(otb.budget)} ден.
            </h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
            <div className="bg-slate-50 rounded-lg px-3 py-2">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Залиха по набавна</p>
              <p className="text-lg font-bold text-slate-800 tabular-nums">{fmt(otb.stockCost)}</p>
              <p className={`text-[11px] ${otb.overTarget > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                {otb.overTarget > 0 ? `${fmt(otb.overTarget)} над целта` : `${fmt(-otb.overTarget)} под целта`} од {fmt(otb.target)}
              </p>
            </div>
            <div className="bg-slate-50 rounded-lg px-3 py-2">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Ќе излезе од полиците</p>
              <p className="text-lg font-bold text-slate-800 tabular-nums">{fmt(otb.expectedCogs)}</p>
              <p className="text-[11px] text-slate-500">по набавна, истите {OTB_HORIZON_DAYS} дена лани</p>
            </div>
            <div className="bg-slate-50 rounded-lg px-3 py-2">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Смее да се купи</p>
              <p className={`text-lg font-bold tabular-nums ${otb.budget > 0 ? 'text-green-700' : 'text-amber-700'}`}>{fmt(otb.budget)}</p>
              <p className="text-[11px] text-slate-500">
                {fmt(otb.expectedCogs)} {otb.overTarget > 0 ? '−' : '+'} {fmt(Math.abs(otb.overTarget))}
              </p>
            </div>
          </div>
          <p className="text-xs text-slate-600">
            {otb.budget > 0
              ? <>Толку купено ја враќа залихата на {fmt(otb.target)} по продажбите на следниот месец.</>
              : <>Залихата е толку над целта што продажбите на следниот месец не ја враќаат под неа — овој месец не се купува, се продава.</>}{' '}
            Докажаните модели за дополнување, со овој буџет веќе поставен, се во{' '}
            <Link href="/admin/reorder" className="underline font-medium">Планот за набавка</Link>.
          </p>
        </section>

        {/* 3 · where */}
        <section className="bg-white rounded-xl border border-slate-200 p-4 mb-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Coins className="h-4 w-4 text-slate-500" />
            <h2 className="font-bold text-slate-800 text-sm">Каде: групите под својот дел од целта</h2>
          </div>
          {buying.length === 0 ? (
            <p className="text-sm text-slate-500">Нема буџет за поделба овој месец.</p>
          ) : (
            <div className="space-y-1.5">
              {buying.map((g) => (
                <div key={g.name} className="flex items-center gap-3">
                  <span className="w-36 shrink-0 text-sm text-slate-700 truncate">{g.name}</span>
                  <div className="flex-1 h-6 bg-slate-100 rounded overflow-hidden">
                    <div className="h-full bg-green-500" style={{ width: `${(g.buy / maxBuy) * 100}%` }} />
                  </div>
                  <span className="w-24 shrink-0 text-right text-sm font-semibold text-slate-800 tabular-nums">
                    {fmt(g.buy)}
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-slate-400 mt-3">
            Делот на секоја група од {fmt(otb.target)} е колку продала (по набавна) во наредните{' '}
            {Math.round(SHARE_WINDOW_DAYS / 30)} месеци лани — така зимската стока добива место пред зимата.
            Буџетот оди на групите под својот дел, сразмерно колку им фали.
          </p>
        </section>

        {/* detail */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/60 flex items-center gap-2">
            <PackagePlus className="h-4 w-4 text-slate-500" />
            <h2 className="font-bold text-slate-800 text-sm">По група</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  {['Група', 'Залиха', 'Дел од целта', 'Над / под', `${OTB_HORIZON_DAYS} дена лани`, 'Купи', 'GMROI', 'Месеци залиха'].map((h, i) => (
                    <th key={h} className={`px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider ${i === 0 ? 'text-left' : 'text-right'}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {otb.groups.map((g) => (
                  <tr key={g.name} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2.5 font-medium text-slate-800">{g.name}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{fmt(g.cost)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{fmt(g.target)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums font-medium ${g.overTarget > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                      {signed(g.overTarget)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{fmt(g.expectedCogs)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-slate-800">
                      {g.buy > 0 ? fmt(g.buy) : '—'}
                    </td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${
                      g.gmroi >= 1.3 ? 'text-green-700' : g.gmroi >= 0.9 ? 'text-amber-700' : 'text-red-700'
                    }`}>
                      {g.gmroi.toFixed(2)}
                    </td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${
                      g.monthsOfSupply > 18 ? 'text-red-700' : g.monthsOfSupply > 12 ? 'text-amber-700' : 'text-slate-600'
                    }`}>
                      {Number.isFinite(g.monthsOfSupply) ? g.monthsOfSupply.toFixed(1) : '∞'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="mt-4 text-[11px] text-slate-400 space-y-1">
          <p>
            <strong>Над целта</strong> значи дека парите за таа група веќе стојат на полица: таа не добива
            набавка додека продажбите не ја спуштат — а ако не се продава, место за неа се прави со попуст
            (<Link href="/admin/season" className="underline">сезона</Link>,{' '}
            <Link href="/admin/aging" className="underline">стареење</Link>).
          </p>
          <p>
            <strong>GMROI</strong> = бруто профит за 12 месеци ÷ залиха по набавна: колку денари носи секој
            денар врзан во стока. <strong>Месеци залиха</strong> = залиха ÷ месечна набавна вредност на
            продаденото. Со залиха од {fmt(otb.target)} и продажба колку за нулата, тоа е околу{' '}
            {monthsAtZero !== null ? monthsAtZero.toFixed(0) : '9'} за целата продавница.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function CapitalPage() {
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

  return <CapitalView />;
}
