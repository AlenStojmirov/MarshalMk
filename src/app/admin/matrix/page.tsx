'use client';

/**
 * Speed × margin (Task 5.4) — the screen that decides what a discount means.
 *
 * Every other screen here answers one question about a model. This one crosses
 * two, and the crossing is where the instruction changes sign. The shop has
 * been discounting on one rule — "it is not selling fast enough" — and that
 * rule is right in one quadrant and expensive in another:
 *
 *   clears, fat margin   → never discount. This is where the 19.051 den. a
 *                          month of leakage lives: stock that would have sold
 *                          at full price, sold cheaper.
 *   clears, thin margin  → the price is too low, not the demand too weak.
 *                          Raise it; a discount here sells at a loss.
 *   sticks, fat margin   → a discount is the right tool, and only here. There
 *                          is margin to give and it buys back movement.
 *   sticks, thin margin  → nothing to give and nothing to wait for. Clear it
 *                          at whatever it fetches and do not rebuy.
 *
 * **Speed is measured as sell-through, not as a rate.** At one to five pieces a
 * model, units-per-month is noise; the share of the buy that has left is true
 * at any size (see `src/lib/velocity.ts`). So the horizontal axis is honestly
 * "how much of it cleared", which is what speed means for a shop this size.
 *
 * **The margin axis uses the LIST price, not the charged one**, and getting
 * that wrong first is what taught me why. Classifying on the charged price let
 * the discount decide the quadrant: a product with a healthy 55% list margin,
 * discounted to 35%, landed under "thin margin" — so the largest block of
 * leakage, 11.809 den. a month, showed up in the cell whose advice is "raise
 * the price" instead of the cell whose advice is "stop discounting this". The
 * quadrant became an effect of the discount rather than a property of the
 * product, and the one number this screen exists to produce landed in the wrong
 * box. The axis is now what the product earns at its own price; the discount is
 * a separate column, which is where something you can switch off belongs.
 *
 * The margin line is `MARGIN_WATCH` (40%) — the point below which a sale
 * contributes but not enough to carry its share of the shop. The break-even
 * margin is computed and shown separately, because it depends on revenue and a
 * fixed number would go stale the moment revenue moves.
 *
 * **"Never discount" means never discount IN SEASON**, and measuring this
 * screen against `/admin/season` is what forced the qualifier. The largest
 * discounts in the protect quadrant sit on polos and shorts — stock that does
 * clear at a fat margin, and whose window shuts this month. The season calendar
 * is right to mark those down: a fat margin on something that will not sell
 * again for eight months is not a margin, it is a hope. Without the split this
 * screen would have told the owner to cancel the very discounts the other
 * screen had just told them to apply, and two screens contradicting each other
 * is worse than one screen being vague. So leakage is counted only where the
 * window is open; a markdown inside a closing window is listed separately and
 * called what it is.
 *
 * The calendar excuses the markdown, though, not its depth. A summer shirt cut
 * 45% in September when the ladder asks for 20% is two thirds justified and one
 * third given away, so the excess is apportioned back into leakage rather than
 * waved through — otherwise "the calendar said so" becomes cover for any number
 * at all.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useProducts } from '@/hooks/useProducts';
import { Product } from '@/types';
import { getEffectivePrice, isOnSale, getPercentOff } from '@/lib/pricing';
import { grossMargin, MARGIN_LOW, MARGIN_WATCH } from '@/lib/cost';
import { getProductDisplayName } from '@/lib/product-display';
import { Expense, expensesForPeriod, getExpenses, periodOf } from '@/lib/expenses';
import { NON_MERCHANDISE, PHASE_LABEL, monthOf, phaseOf, suggestedMarkdown } from '@/lib/seasons';
import { VelocityMetrics, isDecidable, velocityOf } from '@/lib/velocity';
import { ArrowLeft, Grid2x2, AlertTriangle, Tag } from 'lucide-react';

const fmt = (n: number) => Math.round(n).toLocaleString('mk-MK');
const pc = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`);

/**
 * Half the buy gone is the midpoint of the decision. Overall sell-through is
 * 62%, so this line sits a little below the shop's own average — deliberately,
 * because the quadrant it defines is the one that gets acted on.
 */
const CLEARS_LINE = 0.5;

/** Fallback monthly operating cost until the expenses screen is filled (1.4). */
const OPEX_FALLBACK = 65_000;

type Quad = 'protect' | 'reprice' | 'discount' | 'clear';

const QUAD: Record<Quad, {
  title: string;
  rule: string;
  why: string;
  tone: string;
  chip: string;
}> = {
  protect: {
    title: 'Чисти се · дебела маржа',
    rule: 'Никогаш попуст.',
    why: 'Оваа стока и така се продава по полна цена. Попустот тука е чиста загуба на маржа — тука живее истекувањето.',
    tone: 'border-green-300 bg-green-50',
    chip: 'bg-green-200 text-green-900',
  },
  reprice: {
    title: 'Чисти се · тенка маржа',
    rule: 'Крени цена, не давај попуст.',
    why: 'Побарувачката е докажана, цената е ниска. Попуст тука продава со губење.',
    tone: 'border-blue-300 bg-blue-50',
    chip: 'bg-blue-200 text-blue-900',
  },
  discount: {
    title: 'Стои · дебела маржа',
    rule: 'Попустот е точната алатка — и само тука.',
    why: 'Има маржа за давање и таа купува движење. Ова е единствениот квадрант каде попуст е добра одлука.',
    tone: 'border-amber-300 bg-amber-50',
    chip: 'bg-amber-200 text-amber-900',
  },
  clear: {
    title: 'Стои · тенка маржа',
    rule: 'Расчисти и не докупувај.',
    why: 'Нема што да се даде и нема што да се чека. Земи што ќе плати пазарот и затвори ја ставката.',
    tone: 'border-red-300 bg-red-50',
    chip: 'bg-red-200 text-red-900',
  },
};

interface Entry {
  p: Product;
  m: VelocityMetrics;
  /** Margin at the product's own price — what it earns when nobody discounts it. */
  listMargin: number;
  /** Margin at the price actually charged today. */
  effMargin: number | null;
  cost: number;
  quad: Quad;
  onSale: boolean;
  /** Margin given away per month on this model, over the last 90 days. */
  leakPerMonth: number;
  /** True when the calendar itself asks for a markdown right now. */
  seasonAsksForIt: boolean;
  /** What the ladder asks for, in percent. Zero when the window is open. */
  seasonPct: number;
  /** The discount actually given, in percent. */
  actualPct: number;
  /** The part of `leakPerMonth` the calendar does not justify. */
  excessPerMonth: number;
}

function quadrantOf(sellThrough: number, margin: number): Quad {
  const clears = sellThrough >= CLEARS_LINE;
  const fat = margin >= MARGIN_WATCH;
  if (clears && fat) return 'protect';
  if (clears && !fat) return 'reprice';
  if (!clears && fat) return 'discount';
  return 'clear';
}

function MatrixView() {
  const { products, loading } = useProducts();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [tab, setTab] = useState<Quad>('protect');
  const [onlyDiscounted, setOnlyDiscounted] = useState(false);

  const [now] = useState(() => Date.now());
  const month = useMemo(() => monthOf(now), [now]);

  useEffect(() => {
    getExpenses().then(setExpenses).catch(() => setExpenses([]));
  }, []);

  const model = useMemo(() => {
    const entries: Entry[] = [];
    let revenue365 = 0;

    for (const p of products) {
      if (NON_MERCHANDISE.has(p.category)) continue;
      const m = velocityOf(p, now, month);
      if (!isDecidable(m)) continue;

      // The axis is the list-price margin: what the product earns at its own
      // price. Using the charged price would let a discount move the product
      // into the quadrant that says "raise the price", which is how the leak
      // ends up filed under the wrong instruction.
      const listMargin = grossMargin(p.price, p.purchasePrice);
      const effMargin = grossMargin(getEffectivePrice(p), p.purchasePrice);
      if (listMargin === null || m.sellThrough === null) continue;

      // What the discount costs, in the only unit that matters: denars a month.
      // List price minus charged price, over the pieces that actually moved.
      const sale = isOnSale(p);
      const given = sale ? Math.max(0, p.price - getEffectivePrice(p)) : 0;
      const leakPerMonth = (given * m.sold90) / 3;

      // Revenue over a full year, monthly-averaged. A 90-day window swings by
      // twenty per cent with the season, and a break-even margin computed from
      // it would swing with it — a threshold that moves is not a threshold.
      for (const s of p.sold ?? []) {
        const price = Number(s.price) || 0;
        if (price <= 0) continue;
        const t = Date.parse(String(s.soldDate));
        if (Number.isFinite(t) && t >= now - 365 * 86_400_000) revenue365 += price;
      }

      const seasonPct = suggestedMarkdown(phaseOf(p.category, month), month);
      const actualPct = sale ? getPercentOff(p) : 0;
      // The calendar justifies a markdown, not any depth of one. Whatever is
      // cut beyond the ladder is apportioned back into leakage.
      const excessPerMonth =
        seasonPct > 0 && actualPct > seasonPct
          ? (leakPerMonth * (actualPct - seasonPct)) / actualPct
          : 0;

      entries.push({
        p, m, listMargin, effMargin,
        cost: m.onHand * (p.purchasePrice ?? 0),
        quad: quadrantOf(m.sellThrough, listMargin),
        onSale: sale,
        leakPerMonth,
        seasonAsksForIt: seasonPct > 0,
        seasonPct,
        actualPct,
        excessPerMonth,
      });
    }

    const cells = new Map<Quad, {
      models: number; units: number; cost: number; onSale: number;
      /** Discount given while the window is open — money simply lost. */
      leak: number;
      /** Discount given inside a closing window, up to the depth asked for. */
      seasonal: number;
      seasonalModels: number;
      /** Models cut deeper than the ladder asks. */
      tooDeep: number;
    }>();
    for (const e of entries) {
      const c = cells.get(e.quad) ?? {
        models: 0, units: 0, cost: 0, onSale: 0, leak: 0, seasonal: 0,
        seasonalModels: 0, tooDeep: 0,
      };
      c.models += 1;
      c.units += e.m.onHand;
      c.cost += e.cost;
      if (e.onSale) c.onSale += 1;
      if (e.seasonAsksForIt) {
        c.seasonal += e.leakPerMonth - e.excessPerMonth;
        c.leak += e.excessPerMonth;
        if (e.onSale) c.seasonalModels += 1;
        if (e.excessPerMonth > 0) c.tooDeep += 1;
      } else {
        c.leak += e.leakPerMonth;
      }
      cells.set(e.quad, c);
    }

    const monthlyRevenue = revenue365 / 12;
    const e = expensesForPeriod(expenses, periodOf(new Date(now)));
    const opex = e.total > 0 ? e.total : OPEX_FALLBACK;
    // The margin the shop would need at this revenue to cover its costs. Not a
    // threshold to filter on — a fact to read the columns against.
    const breakEven = monthlyRevenue > 0 ? opex / monthlyRevenue : null;

    return {
      entries, cells, monthlyRevenue, opex, breakEven,
      opexKnown: e.total > 0,
      totalCost: entries.reduce((a, x) => a + x.cost, 0),
      skipped: products.filter((p) => !NON_MERCHANDISE.has(p.category)).length - entries.length,
    };
  }, [products, expenses, now, month]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const list = model.entries
    .filter((e) => e.quad === tab && (!onlyDiscounted || e.onSale))
    .sort((a, b) => b.leakPerMonth - a.leakPerMonth || b.cost - a.cost);

  const shown = list.slice(0, 60);
  const protectCell = model.cells.get('protect');
  const protectLeak = protectCell?.leak ?? 0;
  const protectSeasonal = protectCell?.seasonal ?? 0;

  const cell = (q: Quad) => {
    const c = model.cells.get(q);
    const meta = QUAD[q];
    const active = tab === q;
    return (
      <button
        key={q}
        onClick={() => setTab(q)}
        className={`text-left rounded-xl border-2 p-4 transition-all ${meta.tone} ${
          active ? 'ring-2 ring-slate-800 ring-offset-1' : 'opacity-90 hover:opacity-100'
        }`}
      >
        <p className="text-[11px] font-semibold text-slate-600 uppercase tracking-wider">{meta.title}</p>
        <p className="text-2xl font-bold text-slate-800 tabular-nums mt-1">{c?.models ?? 0}</p>
        <p className="text-[11px] text-slate-500 tabular-nums">
          {c?.units ?? 0} парчиња · {fmt(c?.cost ?? 0)} ден.
        </p>
        <p className="text-xs font-bold text-slate-800 mt-2">{meta.rule}</p>
        <p className="text-[11px] text-slate-600 mt-1">{meta.why}</p>
        {c && c.onSale > 0 && (
          <div className="mt-2 space-y-1">
            <p className={`text-[11px] font-semibold px-1.5 py-0.5 rounded inline-block ${meta.chip}`}>
              {c.onSale} на попуст
              {c.leak > 0 && ` · ${fmt(c.leak)} ден./мес истекување`}
            </p>
            {c.seasonal > 0 && (
              <p className="text-[11px] text-slate-500">
                + {fmt(c.seasonal)} ден./мес во сезона што се затвора — тоа е оправдано
                {c.tooDeep > 0 && (
                  <span className="block text-amber-700">
                    {c.tooDeep} намалени подлабоко од скалилото; вишокот е веќе во истекувањето
                  </span>
                )}
              </p>
            )}
          </div>
        )}
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        <Link href="/admin" className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-800 mb-4 text-sm">
          <ArrowLeft className="h-4 w-4" />
          Назад на таблата
        </Link>

        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Брзина × маржа</h1>
        <p className="text-sm text-slate-500 mt-1 mb-6">
          Секоја друга страна одговара на едно прашање за модел. Оваа крстосува две — а во
          крстосницата упатството менува знак. Досега попустот се даваше по едно правило („не се
          продава доволно брзо“), а тоа правило е точно во еден квадрант и скапо во друг.
        </p>

        {/* the honest context for reading the columns */}
        <div className="mb-6 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-slate-600">
            <span>
              Приход / месец:{' '}
              <strong className="text-slate-800 tabular-nums">{fmt(model.monthlyRevenue)}</strong> ден.
            </span>
            <span>
              Трошоци:{' '}
              <strong className="text-slate-800 tabular-nums">{fmt(model.opex)}</strong> ден.
              {!model.opexKnown && <span className="text-slate-400"> (претпоставка)</span>}
            </span>
            {model.breakEven !== null && (
              <span>
                Маржа за нула:{' '}
                <strong className="text-red-700 tabular-nums">{pc(model.breakEven)}</strong>
              </span>
            )}
            <span>
              Линија за „дебела“: <strong className="tabular-nums">{pc(MARGIN_WATCH)}</strong> · за
              „чисти се“: <strong className="tabular-nums">{pc(CLEARS_LINE)}</strong>
            </span>
          </div>
          {model.breakEven !== null && model.breakEven > MARGIN_WATCH && (
            <p className="text-[11px] text-slate-500 mt-2">
              При овој приход продавницата би ѝ требала <strong>{pc(model.breakEven)}</strong> маржа за
              да излезе на нула — повисоко од линијата за „дебела“ маржа. Тоа значи дека и горниот лев
              квадрант не е доволен сам: проблемот не е само маржа по производ, туку обем. Линијата на{' '}
              {pc(MARGIN_WATCH)} останува како прагот под кој производот воопшто не ја носи својата
              част.
            </p>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          {(['protect', 'discount', 'reprice', 'clear'] as Quad[]).map(cell)}
        </div>

        {protectLeak > 0 && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900 flex gap-2">
            <Tag className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              <strong>{fmt(protectLeak)} ден. месечно</strong> се дава како попуст на стока што се
              чисти, има дебела маржа <strong>и прозорецот ѝ е отворен</strong> — односно на стока
              што и така би се продала по полна цена. Тоа е <strong>A1</strong> во еден број.
              {protectSeasonal > 0 && (
                <>
                  {' '}Одделно од тоа, {fmt(protectSeasonal)} ден./мес се дава на стока во сезона што
                  се затвора; тоа <em>не</em> е истекување — дебела маржа на нешто што нема да се
                  продаде уште осум месеци не е маржа, туку надеж.{' '}
                  <Link href="/admin/season" className="underline font-medium">Види го календарот</Link>.
                </>
              )}
              {' '}
              <Link href="/admin/aging" className="underline font-medium">Масовно гасење</Link>.
            </span>
          </div>
        )}

        {/* the list behind the selected cell */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/60 flex flex-wrap items-center gap-2">
            <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <Grid2x2 className="h-4 w-4 text-slate-500" />
              {QUAD[tab].title}
            </h2>
            <span className="text-[11px] text-slate-500">{list.length} модели</span>
            <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyDiscounted}
                onChange={() => setOnlyDiscounted((v) => !v)}
                className="h-3.5 w-3.5 rounded border-slate-300 accent-red-600"
              />
              само на попуст
            </label>
          </div>

          {shown.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-400">
              {onlyDiscounted ? 'Ниту еден во овој квадрант не е на попуст.' : 'Нема модели тука.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-sm">
                <thead>
                  <tr className="border-b border-slate-100">
                    {['Модел', 'Фаза', 'Sell-through', 'Маржа редовна', 'По попуст', 'Попуст', 'Дадено/мес', 'Парчиња', 'Набавна'].map((h, i) => (
                      <th key={h} className={`px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider ${i < 2 ? 'text-left' : 'text-right'}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {shown.map((e) => (
                    <tr key={e.p.id} className="hover:bg-slate-50/60">
                      <td className="px-3 py-2.5 max-w-[220px]">
                        <Link
                          href={`/admin/product/${e.p.id}`}
                          className="block font-medium text-slate-800 hover:text-blue-600 text-xs truncate"
                        >
                          {getProductDisplayName(e.p.name, e.p.category, e.p.brand)}
                        </Link>
                        <p className="text-[10px] text-slate-400 font-mono truncate">
                          {e.p.category}
                          {e.p.isVisible === false ? ' · скриен' : ''}
                          {e.m.thin ? ' · мала серија' : ''}
                        </p>
                      </td>
                      <td className="px-3 py-2.5 text-[11px] text-slate-500">
                        {PHASE_LABEL[phaseOf(e.p.category, month)]}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-xs text-slate-700">
                        {pc(e.m.sellThrough)}
                        <span className="text-slate-400"> ({e.m.soldEver}/{e.m.receivedEst})</span>
                      </td>
                      <td className={`px-3 py-2.5 text-right tabular-nums text-xs font-semibold ${
                        e.listMargin >= MARGIN_WATCH ? 'text-green-700' : 'text-amber-700'
                      }`}>
                        {pc(e.listMargin)}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-xs">
                        {e.onSale && e.effMargin !== null ? (
                          <span className={e.effMargin < MARGIN_LOW ? 'text-red-700 font-semibold' : 'text-slate-600'}>
                            {pc(e.effMargin)}
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-xs">
                        {e.onSale ? (
                          <>
                            <span className={
                              e.excessPerMonth > 0 ? 'text-amber-700 font-semibold' : 'text-red-700 font-semibold'
                            }>
                              −{e.actualPct}%
                            </span>
                            {e.seasonPct > 0 && (
                              <span className="block text-[10px] text-slate-400">
                                скалило −{e.seasonPct}%
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                      <td className={`px-3 py-2.5 text-right tabular-nums text-xs ${
                        e.leakPerMonth === 0 ? 'text-slate-300'
                          : e.seasonAsksForIt ? 'text-slate-500' : 'font-semibold text-red-700'
                      }`}>
                        {e.leakPerMonth > 0 ? fmt(e.leakPerMonth) : '—'}
                        {e.leakPerMonth > 0 && e.seasonAsksForIt && (
                          <span className="block text-[10px] text-slate-400">по календар</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-600 text-xs">
                        {e.m.onHand}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-800 font-medium text-xs">
                        {fmt(e.cost)}
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

        <p className="text-[11px] text-slate-400 mt-4 flex items-start gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
          <span>
            Брзината е мерена како <strong>sell-through</strong>, не како темпо: при 1–5 парчиња по
            модел „парчиња на месец“ е шум, а делот од набавката што заминал е точен при секоја
            големина. Оската за маржа е на <strong>редовната</strong> цена — тоа што производот
            заработува по своја цена. Ако беше на наплатената, попустот сам би го местел квадрантот:
            производ со здрава маржа спуштен на 35% би завршил под „тенка маржа“, каде советот е
            „крени цена“ наместо „престани да го намалуваш“. Маржата по попуст е одделна колона,
            зашто работа што може да се изгаси не припаѓа на оска. „Дадено/мес“ е разликата меѓу
            редовната и наплатената цена по парчињата што навистина се продале во последните 90
            дена. Приходот е годишен просек, не 90 дена — прозорец од 90 дена скача со сезоната, а
            праг што се движи не е праг.
            {model.skipped > 0 && (
              <> {model.skipped} модели се надвор — без набавна цена или без ниту еден податок за
              движење, па ниту едната оска не може да се пресмета.</>
            )}
          </span>
        </p>
      </div>
    </div>
  );
}

export default function MatrixPage() {
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

  return <MatrixView />;
}
