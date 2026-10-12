'use client';

/**
 * Where the next purchase money should go (D-023, D-028).
 *
 * Three answers, in the order they are needed:
 *
 *  1. **Zero.** What a month has to sell to cover its costs, at the margin the
 *     shop actually makes — and how far the last twelve months were from it.
 *  2. **How much.** The shop keeps STOCK_TARGET_COST of stock at cost. What the
 *     next thirty days sell is replaced, less whatever the shelf is above target,
 *     or plus a third of what it is below.
 *  3. **Where.** Each category's share of the target follows what it sells in
 *     the coming half year; the money goes to the categories below their share.
 *     By raw category, not by group (D-030): inside a group, summer shorts
 *     would stand in for winter jeans. The groups are headings over them, and a
 *     share resting on fewer than MIN_SHARE_SALES sales is marked an estimate.
 *
 * The arithmetic is in `src/lib/open-to-buy.ts`, shared with the reorder plan
 * and the dashboard, so the three screens cannot disagree about the number.
 */

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useProducts } from '@/hooks/useProducts';
import { useTranslation } from '@/lib/i18n';
import { Expense, expensesForPeriod, getExpenses, periodOf } from '@/lib/expenses';
import { knownOpex } from '@/lib/break-even';
import {
  CategoryCapital, FILL_FROM, MIN_SHARE_SALES, OTB_HORIZON_DAYS, SHARE_WINDOW_DAYS, STOCK_TARGET_COST,
  STOP_CHECK_DAYS, STOP_MIN_MODELS, STOP_SELL_THROUGH, StockLine, TARGET_FILL_MONTHS, openToBuy,
} from '@/lib/open-to-buy';
import { phaseOf, shouldBuyNow } from '@/lib/seasons';
import { ArrowLeft, Coins, PackagePlus, Scale, Target } from 'lucide-react';

const fmt = (n: number) => Math.round(n).toLocaleString('mk-MK');
const signed = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n));

/** A share resting on few sales keeps its own figure, and says what it rests on (D-030). */
function EstimateTag({ c }: { c: CategoryCapital }) {
  if (!c.estimate) return null;
  return (
    <span
      className="ml-1.5 inline-block px-1.5 rounded bg-amber-100 text-amber-800 text-[10px] font-semibold whitespace-nowrap"
      title={`Делот е од ${c.shareSales} продажби. Под ${MIN_SHARE_SALES} тоа е проценка, не мерење.`}
    >
      проценка · {c.shareSales} прод.
    </span>
  );
}

function CapitalView() {
  const { products, loading } = useProducts();
  const { t } = useTranslation();
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
  const buying = otb.categories.filter((c) => c.buy > 0);
  const maxBuy = Math.max(1, ...buying.map((c) => c.buy));
  const label = (category: string) => {
    const l = t(`categoryNames.${category}`);
    return l === `categoryNames.${category}` ? category : l;
  };
  // The money is a ceiling; the reorder plan buys nothing whose window is shut.
  const outOfSeason = (c: CategoryCapital) => !shouldBuyNow(phaseOf(c.name));

  const cells = (l: StockLine) => (
    <>
      <td className="px-3 py-2 text-right tabular-nums text-slate-700">{fmt(l.cost)}</td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-500">{fmt(l.target)}</td>
      <td className={`px-3 py-2 text-right tabular-nums font-medium ${l.overTarget > 0 ? 'text-amber-700' : 'text-green-700'}`}>
        {signed(l.overTarget)}
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-500">{fmt(l.expectedCogs)}</td>
      <td className="px-3 py-2 text-right tabular-nums font-semibold text-slate-800">
        {l.buy > 0 ? fmt(l.buy) : '—'}
      </td>
      <td className={`px-3 py-2 text-right tabular-nums ${
        l.gmroi >= 1.3 ? 'text-green-700' : l.gmroi >= 0.9 ? 'text-amber-700' : 'text-red-700'
      }`}>
        {l.gmroi.toFixed(2)}
      </td>
      <td className={`px-3 py-2 text-right tabular-nums ${
        l.monthsOfSupply > 18 ? 'text-red-700' : l.monthsOfSupply > 12 ? 'text-amber-700' : 'text-slate-600'
      }`}>
        {Number.isFinite(l.monthsOfSupply) ? l.monthsOfSupply.toFixed(1) : '∞'}
      </td>
    </>
  );

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
                {otb.overTarget > 0
                  ? `${fmt(otb.expectedCogs)} − ${fmt(otb.overTarget)}`
                  : `${fmt(otb.expectedCogs)} + ${fmt(otb.fillThisMonth)} (дел од ${fmt(-otb.overTarget)} што фали)`}
              </p>
            </div>
          </div>
          <p className="text-xs text-slate-600">
            {otb.budget > 0
              ? otb.overTarget > 0
                ? <>Толку купено ја враќа залихата на {fmt(otb.target)} по продажбите на следниот месец.</>
                : <>Толку купено ја приближува залихата кон {fmt(otb.target)}: разликата се пополнува за{' '}
                    {TARGET_FILL_MONTHS} месеци, не одеднаш, за новата стока прво да покаже дека се продава.</>
              : <>Залихата е толку над целта што продажбите на следниот месец не ја враќаат под неа — овој месец не се купува, се продава.</>}{' '}
            Докажаните модели за дополнување, со овој буџет веќе поставен, се во{' '}
            <Link href="/admin/reorder" className="underline font-medium">Планот за набавка</Link>.
          </p>
        </section>

        {/* 2b · the stop rule on the new money (D-028, 11.4) */}
        <section className={`rounded-xl border p-5 mb-5 shadow-sm ${otb.newStock.held ? 'border-red-200 bg-red-50' : 'border-slate-200 bg-white'}`}>
          <h2 className={`font-bold text-sm mb-1 ${otb.newStock.held ? 'text-red-900' : 'text-slate-800'}`}>
            Правило за стоп: нова стока од {FILL_FROM.split('-').reverse().join('.')}
            {otb.newStock.held ? ' — пополнувањето е запрено' : ''}
          </h2>
          <p className="text-xs text-slate-600 mb-3">
            Нов модел се суди по {STOP_CHECK_DAYS} дена на полица. Ако барем {STOP_MIN_MODELS} се судени и заедно продале
            помалку од {Math.round(STOP_SELL_THROUGH * 100)}% од тоа што стигнало, следната третина до целта не се купува;
            продаденото и понатаму се дополнува. Дополнување на постоечки модел (попис во формата) не остава датум на
            прием, па не се суди.
          </p>
          {otb.newStock.models.length === 0 ? (
            <p className="text-sm text-slate-500">Уште нема нови модели внесени од {FILL_FROM.split('-').reverse().join('.')}.</p>
          ) : (
            <>
              <p className="text-sm text-slate-700 mb-2">
                {otb.newStock.models.length} нови модели · судени {otb.newStock.judged}
                {otb.newStock.sellThrough !== null && <> · продадено <strong>{Math.round(otb.newStock.sellThrough * 100)}%</strong></>}
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-[11px] uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="py-1 text-left">Модел</th>
                      <th className="py-1 text-right">Дена</th>
                      <th className="py-1 text-right">Продадено</th>
                      <th className="py-1 text-right">На полица</th>
                      <th className="py-1 text-right">%</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {otb.newStock.models.map((m) => (
                      <tr key={m.id} className={m.judged ? '' : 'text-slate-400'}>
                        <td className="py-1">
                          <Link href={`/admin/product/${m.id}`} className="hover:text-blue-700">{m.name}</Link>{' '}
                          <span className="text-[11px] text-slate-400">{m.category}</span>
                        </td>
                        <td className="py-1 text-right tabular-nums">{m.ageDays}</td>
                        <td className="py-1 text-right tabular-nums">{m.sold}</td>
                        <td className="py-1 text-right tabular-nums">{m.onHand}</td>
                        <td className={`py-1 text-right tabular-nums ${m.judged && m.sellThrough < STOP_SELL_THROUGH ? 'text-red-700 font-semibold' : ''}`}>
                          {Math.round(m.sellThrough * 100)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        {/* 3 · where, by raw category (D-030) */}
        <section className="bg-white rounded-xl border border-slate-200 p-4 mb-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Coins className="h-4 w-4 text-slate-500" />
            <h2 className="font-bold text-slate-800 text-sm">Каде: категориите под својот дел од целта</h2>
          </div>
          {buying.length === 0 ? (
            <p className="text-sm text-slate-500">Нема буџет за поделба овој месец.</p>
          ) : (
            <div className="space-y-2">
              {buying.map((c) => (
                <div key={c.name} className="flex items-center gap-2 sm:gap-3">
                  <div className="w-32 sm:w-48 shrink-0 min-w-0">
                    <p className="text-sm text-slate-700 truncate">
                      {label(c.name)} <span className="text-[10px] text-slate-400 font-mono">{c.name}</span>
                    </p>
                    <p className="text-[10px] text-slate-400 leading-tight">
                      {c.group}
                      <EstimateTag c={c} />
                      {outOfSeason(c) && <span className="block text-amber-700">вон сезона: планот не купува сега</span>}
                    </p>
                  </div>
                  <div className="flex-1 h-6 bg-slate-100 rounded overflow-hidden">
                    <div className="h-full bg-green-500" style={{ width: `${(c.buy / maxBuy) * 100}%` }} />
                  </div>
                  <span className="w-16 sm:w-24 shrink-0 text-right text-sm font-semibold text-slate-800 tabular-nums">
                    {fmt(c.buy)}
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-slate-400 mt-3">
            Делот на секоја категорија од {fmt(otb.target)} е колку продала (по набавна) во наредните{' '}
            {Math.round(SHARE_WINDOW_DAYS / 30)} месеци лани, така зимската стока добива место пред зимата.
            Буџетот оди на категориите под својот дел, сразмерно колку им фали. Се смета по категорија, не по
            група: шорцевите на полица не ги заменуваат фармерките во декември. Категорија со под{' '}
            {MIN_SHARE_SALES} продажби во тој прозорец ја има својата бројка, но таа е <strong>проценка</strong>.
          </p>
        </section>

        {/* detail: categories under their group headings */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/60 flex items-center gap-2">
            <PackagePlus className="h-4 w-4 text-slate-500" />
            <h2 className="font-bold text-slate-800 text-sm">По категорија, под својата група</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  {['Категорија', 'Залиха', 'Дел од целта', 'Над / под', `${OTB_HORIZON_DAYS} дена лани`, 'Купи', 'GMROI', 'Месеци залиха'].map((h, i) => (
                    <th key={h} className={`px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider ${i === 0 ? 'text-left' : 'text-right'}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {otb.groups.map((g) => (
                  <Fragment key={g.name}>
                    <tr className="bg-slate-50 border-t border-slate-200 font-semibold">
                      <td className="px-3 py-2 text-slate-800">{g.name}</td>
                      {cells(g)}
                    </tr>
                    {g.categories.map((c) => (
                      <tr key={c.name} className="border-t border-slate-50 hover:bg-slate-50/60">
                        <td className="pl-7 pr-3 py-2 text-slate-700">
                          {label(c.name)} <span className="text-[10px] text-slate-400 font-mono">{c.name}</span>
                          <EstimateTag c={c} />
                        </td>
                        {cells(c)}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <div className="mt-4 text-[11px] text-slate-400 space-y-1">
          <p>
            <strong>Над целта</strong> значи дека парите за таа категорија веќе стојат на полица: таа не добива
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
