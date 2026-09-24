'use client';

/**
 * The reorder plan — EPIC 4, tasks 4.1 to 4.3 in one screen.
 *
 * Four screens each hold a piece of this answer: `/admin/velocity` knows which
 * models proved themselves, `/admin/season` knows whether the window is open,
 * `/admin/sizes` knows which sizes are missing, `/admin/capital` knows whether
 * there is any money. Joining four lists in your head is not a plan, and the
 * joining is where the mistake gets made. So this page does the join and hands
 * over one order: model, sizes, pieces, price, ranked, cut off at the budget.
 *
 * The budget goes first and is allowed to say zero. It currently does, and the
 * page does not soften that — it names the only exception the plan permits (A5:
 * refilling proven, in-window sellers) and makes the exception's price visible
 * before it is spent, rather than presenting a shopping list as if the money
 * were there.
 *
 * The arithmetic and its guardrails are in `src/lib/reorder.ts`.
 */

import { Fragment, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useProducts } from '@/hooks/useProducts';
import { getProductDisplayName } from '@/lib/product-display';
import { MIN_TURNOVER_TO_BUY, openToBuy } from '@/lib/open-to-buy';
import {
  MONTH_LABEL, NON_MERCHANDISE, PHASE_LABEL, monthAhead, monthOf, phaseOf,
} from '@/lib/seasons';
import {
  CAP_LABEL, MAX_UNITS_PER_MODEL, TARGET_COVER_MONTHS, planReorder,
} from '@/lib/reorder';
import {
  ArrowLeft, Ban, CalendarClock, ClipboardCopy, PackagePlus, ShieldAlert, AlertTriangle,
} from 'lucide-react';

const fmt = (n: number) => Math.round(n).toLocaleString('mk-MK');
const pct = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`);

/**
 * The A5 exception, as a number.
 *
 * `/admin/sizes` measured the whole size-gap top-up at 39.231 den. for proven
 * sizes. Rounding to 40.000 gives the exception a shape: large enough to refill
 * what sells, small enough that being wrong costs less than a month of opex.
 * An exception without a ceiling is not an exception, it is a policy.
 */
const EXCEPTION_BUDGET = 40_000;

/**
 * How far ahead the plan can look, in weeks (Task 6.2).
 *
 * Six weeks is the lead time a pre-season order needs — ordered, delivered and
 * photographed before the window opens. The longer steps exist because the
 * calendar does not change every month: from September nothing opens until
 * February, so a chooser offering only "+6 weeks" would hand back the same plan
 * and look broken. The buttons are labelled by the month they land in, because
 * that is what is being planned for.
 */
const HORIZONS = [0, 6, 13, 21];

/**
 * Who the order goes to.
 *
 * The suppliers table is empty and no product carries a supplier_id, but every
 * product has a brand — it is even the prefix of its id — and in a shop this
 * size one brand comes from one supplier. So brand is the grouping that works
 * today without anyone entering anything. Admin-only: the customer-facing site
 * still hides brands behind their codes.
 */
const brandOf = (p: { brand?: string; id: string }) =>
  (p.brand && p.brand.trim()) || p.id.split('-')[0];

function ReorderView() {
  const { products, loading } = useProducts();
  const [budgetInput, setBudgetInput] = useState(String(EXCEPTION_BUDGET));
  const [cover, setCover] = useState(TARGET_COVER_MONTHS);
  const [copied, setCopied] = useState(false);

  const [now] = useState(() => Date.now());
  // Six weeks is the lead time a pre-season order needs: the goods have to be
  // ordered, delivered and photographed before the window opens, and a list
  // that only appears once the season has started has already missed it.
  const [horizon, setHorizon] = useState(0);
  const month = useMemo(() => monthAhead(horizon, now), [horizon, now]);
  const today = useMemo(() => monthOf(now), [now]);

  const budget = Math.max(0, Number(budgetInput) || 0);

  const merch = useMemo(
    () => products.filter((p) => !NON_MERCHANDISE.has(p.category)),
    [products]
  );

  const otb = useMemo(() => openToBuy(merch, now), [merch, now]);

  const plan = useMemo(
    () => planReorder(merch, { now, month, budget, coverMonths: cover }),
    [merch, now, month, budget, cover]
  );

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const inBudget = plan.lines.filter((l) => l.withinBudget);

  // An unchanged plan is worth saying out loud: it means the calendar has no
  // door opening between now and then, not that the control is broken.
  const sameAsToday =
    horizon > 0 &&
    planReorder(merch, { now, month: today, budget, coverMonths: cover }).lines.length ===
      plan.lines.length;

  // The copied text is split one section per brand, because that is how it
  // gets used: one message to each supplier, not one list to read through.
  // In-budget lines grouped by brand, biggest order first. The ranked table
  // stays the main view — the budget is cut down the ranking, and a grouped
  // table would hide where that cut falls.
  const byBrand = [...inBudget.reduce((m, l) => {
    const b = brandOf(l.p);
    const g = m.get(b) ?? { brand: b, lines: [] as typeof inBudget, units: 0, cost: 0 };
    g.lines.push(l);
    g.units += l.units;
    g.cost += l.cost;
    return m.set(b, g);
  }, new Map<string, { brand: string; lines: typeof inBudget; units: number; cost: number }>()).values()]
    .sort((a, b) => b.cost - a.cost);

  const copyOrder = async () => {
    if (inBudget.length === 0) return;
    const text =
      `НАБАВКА — ${inBudget.length} модели · ${plan.units} парчиња · ${fmt(plan.cost)} ден.\n` +
      `Цел: ${cover} месеци покриеност. Враќа ${fmt(plan.revenue)} ден. по продажна.\n` +
      `${new Date(now).toLocaleDateString('mk-MK')}\n\n` +
      byBrand
        .map((g) =>
          `━━ ${g.brand.toUpperCase()} — ${g.lines.length} модели · ${g.units} парчиња · ${fmt(g.cost)} ден.\n\n` +
          g.lines.map(
          (l) =>
            `${getProductDisplayName(l.p.name, l.p.category, l.p.brand)} [${l.p.id}]\n` +
            `  ${l.sizes.length > 0
              ? l.sizes.map((s) => `${s.size}×${s.qty}`).join('  ')
              : `${l.units} парчиња (без големина)`}` +
            `  ·  ${fmt(l.cost)} ден.` +
            `\n  досега ${l.m.soldEver}/${l.m.receivedEst} (${pct(l.m.sellThrough)})` +
            ` · ${l.rate.toFixed(1)} парч./мес` +
            (l.capped ? ` · ${CAP_LABEL[l.capped]}` : '')
          ).join('\n\n')
        )
        .join('\n\n\n');
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

        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">План за набавка</h1>
        <p className="text-sm text-slate-500 mt-1 mb-6">
          Четири страни држат по дел од овој одговор — што се докажало, дали прозорецот е отворен,
          кои големини недостасуваат, и дали воопшто има пари. Спојувањето на четири листи во глава
          не е план, а токму во спојувањето се прави грешката.
        </p>

        {/* the gate, first and allowed to say zero */}
        <div className={`mb-6 rounded-xl border px-4 py-3 ${
          otb.canBuy ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'
        }`}>
          <div className="flex items-start gap-2">
            {otb.canBuy
              ? <PackagePlus className="h-4 w-4 shrink-0 mt-0.5 text-green-700" />
              : <Ban className="h-4 w-4 shrink-0 mt-0.5 text-red-700" />}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-bold ${otb.canBuy ? 'text-green-900' : 'text-red-900'}`}>
                Open-to-buy: {fmt(otb.budget)} ден.
              </p>
              <p className="text-xs text-slate-600 mt-1">
                Turnover <strong>{otb.turnover.toFixed(2)}×</strong> (праг {MIN_TURNOVER_TO_BUY.toFixed(1)}×) ·
                залиха <strong>{fmt(otb.totalCost)}</strong> ден. наспроти здрав максимум{' '}
                <strong>{fmt(otb.maxStock)}</strong> ден. ·{' '}
                {otb.headroom < 0
                  ? <>над таванот за <strong>{fmt(-otb.headroom)}</strong> ден.</>
                  : <>простор <strong>{fmt(otb.headroom)}</strong> ден.</>}
              </p>
              {!otb.canBuy && (
                <p className="text-xs text-red-900 mt-2">
                  Формулата дава <strong>нула</strong> и тоа е точно (A4). Единствениот исклучок што
                  планот дозволува е <strong>A5</strong> — дополнување на докажани модели чиј прозорец
                  е отворен. Затоа буџетот подолу е рачен, и затоа е важно да се види пред да се
                  потроши.{' '}
                  <Link href="/admin/capital" className="underline font-medium">Види ја пресметката</Link>.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* controls */}
        <div className="mb-6 bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-3 flex flex-wrap items-end gap-4">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Буџет (ден.)
            </label>
            <input
              type="number"
              min={0}
              step={1000}
              value={budgetInput}
              onChange={(e) => { setBudgetInput(e.target.value); setCopied(false); }}
              className="w-32 px-3 py-1.5 rounded-lg border border-slate-200 text-sm tabular-nums text-right"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Покриеност (месеци)
            </label>
            <div className="flex gap-1.5">
              {[1, 2, 3].map((v) => (
                <button
                  key={v}
                  onClick={() => { setCover(v); setCopied(false); }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                    cover === v ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600'
                  }`}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-1">
              Планирај за
            </label>
            <div className="flex gap-1.5">
              {HORIZONS.map((w) => (
                <button
                  key={w}
                  onClick={() => { setHorizon(w); setCopied(false); }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                    horizon === w ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600'
                  }`}
                >
                  {w === 0 ? 'сега' : MONTH_LABEL[monthAhead(w, now) - 1]}
                </button>
              ))}
            </div>
          </div>
          <p className="text-[11px] text-slate-400 flex-1 min-w-[200px]">
            Плитка покриеност е намерна: брза кошула на 2 месеци може да се докупи повторно наскоро,
            а длабоко купување е начинот како се дојде до 14 месеци залиха.
          </p>
        </div>

        {horizon > 0 && (
          <div className="mb-6 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900 flex gap-2">
            <CalendarClock className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Планирано за <strong>{MONTH_LABEL[month - 1]}</strong>, не за{' '}
              {MONTH_LABEL[today - 1]}.{' '}
              {sameAsToday && (
                <strong>
                  Планот е ист како денешниот — ниту еден прозорец не се менува дотогаш.{' '}
                </strong>
              )}
              Прозорците се поместени, но{' '}
              <strong>побарувачката останува мерена денес</strong> — тогаш е измерена. Да се
              помести и часовникот би ги стеснило сите прозорци за продажби и тивко би ги
              фрлило доказите. Шест недели е рокот што му треба на пред-сезонска нарачка:
              стоката мора да се нарача, испорача и фотографира пред прозорецот да се отвори.
            </span>
          </div>
        )}

        {/* totals */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Во планот</p>
            <p className="text-xl font-bold text-slate-800 tabular-nums">{inBudget.length}</p>
            <p className="text-[11px] text-slate-400">модели · {plan.units} парчиња</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Чини</p>
            <p className="text-xl font-bold text-slate-800 tabular-nums">{fmt(plan.cost)}</p>
            <p className="text-[11px] text-slate-400">ден. набавна</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Враќа</p>
            <p className="text-xl font-bold text-green-700 tabular-nums">{fmt(plan.revenue)}</p>
            <p className="text-[11px] text-slate-400">
              ден. по продажна · бруто {fmt(plan.revenue - plan.cost)}
            </p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Блокирано</p>
            <p className={`text-xl font-bold tabular-nums ${plan.blockedLines > 0 ? 'text-amber-700' : 'text-slate-300'}`}>
              {plan.blockedLines}
            </p>
            <p className="text-[11px] text-slate-400">
              {plan.blockedLines > 0 ? `${fmt(plan.blockedCost)} ден. над буџет` : 'сè влезе'}
            </p>
          </div>
        </div>

        {plan.lines.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm px-4 py-10 text-center">
            <p className="text-sm text-slate-500">
              Нема модел што ги поминува сите три филтри денес: докажана побарувачка, свеж доказ и
              отворен прозорец.
            </p>
            <Link href="/admin/velocity" className="text-sm text-blue-600 hover:text-blue-700 underline mt-2 inline-block">
              Види ги кандидатите
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/60 flex flex-wrap items-center gap-2">
              <h2 className="font-bold text-slate-800 text-sm">Нарачка, рангирана по поврат на денар</h2>
              <button
                onClick={copyOrder}
                disabled={inBudget.length === 0}
                className="ml-auto inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-semibold hover:bg-slate-900 disabled:opacity-40"
              >
                <ClipboardCopy className="h-3.5 w-3.5" />
                {copied ? 'Копирано' : 'Копирај ја нарачката'}
              </button>
            </div>

            {byBrand.length > 0 && (
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-2">
                  По бренд · {byBrand.length} {byBrand.length === 1 ? 'нарачка' : 'нарачки'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {byBrand.map((g) => (
                    <span
                      key={g.brand}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 text-xs text-slate-700 tabular-nums"
                    >
                      <strong className="text-slate-900">{g.brand}</strong>
                      {g.lines.length} мод. · {g.units} парч. · {fmt(g.cost)} ден.
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[860px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    {['Модел', 'Фаза', 'Големини', 'Парч.', 'Темпо', 'Досега', 'Markup', 'Набавна', 'Продажна'].map((h, i) => (
                      <th key={h} className={`px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider ${i < 3 ? 'text-left' : 'text-right'}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {plan.lines.map((l, i) => {
                    const first = !l.withinBudget && plan.lines[i - 1]?.withinBudget;
                    return (
                      <Fragment key={l.p.id}>
                        {first && (
                          <tr>
                            <td colSpan={9} className="px-3 py-2 bg-amber-50 border-y border-amber-200">
                              <p className="text-[11px] font-semibold text-amber-900 flex items-center gap-1.5">
                                <ShieldAlert className="h-3.5 w-3.5" />
                                Буџетот од {fmt(budget)} ден. се потроши тука. Подолу е што
                                продавницата ѝ треба но не може да го плати — прикажано намерно,
                                зашто тивко скратен план го крие јазот.
                              </p>
                            </td>
                          </tr>
                        )}
                        <tr className={l.withinBudget ? 'hover:bg-slate-50/60' : 'opacity-40'}>
                          <td className="px-3 py-2.5 max-w-[210px]">
                            <Link
                              href={`/admin/product/${l.p.id}`}
                              className="block font-medium text-slate-800 hover:text-blue-600 text-xs truncate"
                            >
                              {getProductDisplayName(l.p.name, l.p.category, l.p.brand)}
                            </Link>
                            <p className="text-[10px] text-slate-400 font-mono truncate">
                              <span className="text-slate-600">{brandOf(l.p)}</span> · {l.p.category}
                              {l.m.onHand === 0 ? ' · НУЛА на полица' : ` · ост. ${l.m.onHand}`}
                            </p>
                          </td>
                          <td className="px-3 py-2.5 text-[11px] text-slate-500">
                            {PHASE_LABEL[phaseOf(l.p.category, month)]}
                          </td>
                          <td className="px-3 py-2.5">
                            {l.sizes.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {l.sizes.map((s) => (
                                  <span key={s.size} className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 text-[11px] font-semibold tabular-nums">
                                    {s.size}×{s.qty}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400">без големина</span>
                            )}
                            {l.capped && (
                              <p className="text-[10px] text-amber-600 mt-0.5">{CAP_LABEL[l.capped]}</p>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums font-semibold text-slate-800 text-xs">
                            {l.units}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-600 text-xs">
                            {l.rate.toFixed(1)}
                            <span className="text-slate-400">/мес</span>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-600 text-xs">
                            {l.m.soldEver}/{l.m.receivedEst}
                            <span className="text-slate-400"> ({pct(l.m.sellThrough)})</span>
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-600 text-xs">
                            {pct(l.gmroi)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-slate-800 font-medium text-xs">
                            {fmt(l.cost)}
                          </td>
                          <td className="px-3 py-2.5 text-right tabular-nums text-green-700 text-xs">
                            {fmt(l.revenue)}
                          </td>
                        </tr>
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="mt-4 space-y-2">
          <p className="text-[11px] text-slate-400 flex items-start gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
            <span>
              Темпото е мерено врз <strong>животот на продажба</strong> — од прием до последната
              продажба за распродаден модел, до денес за оној што уште има залиха. Последните 90 дена
              би читале нула за сè што се распродало напролет, а нула темпо не нарачува ништо, што е
              токму обратно од точното.
            </span>
          </p>
          <p className="text-[11px] text-slate-400 flex items-start gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
            <span>
              Количината <strong>никогаш не надминува првата набавка</strong>, ниту{' '}
              {MAX_UNITS_PER_MODEL} парчиња. Модел што се испразнил за три недели пресметува темпо
              што би оправдало десет парчиња — а десет парчиња од што и да е е начинот како се дојде
              до 14 месеци залиха. Големините доаѓаат од <strong>категоријата</strong>, коригирани од
              моделот: моделот има пет-шест продажби, категоријата има стотици. Измерената крива е
              L &gt; M &gt; XL &gt; XXL &gt; S, не рамна.
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ReorderPage() {
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

  return <ReorderView />;
}
