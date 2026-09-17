'use client';

/**
 * The season calendar, applied to what is actually on the shelf.
 *
 * Age tells you what has been sitting; season tells you what is about to stop
 * selling. They are different questions and the second one has a deadline. A
 * pair of shorts in September is not old — it is three weeks from being worth
 * nothing until next June, and the twelve months of capital that costs is
 * invisible to every other screen here.
 *
 * The measurements and the two windows are in `src/lib/seasons.ts`. This page
 * only joins them to stock and puts the markdown button next to the answer,
 * because a list without the action beside it is how the clearance list sat
 * unused for a month.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useProducts, updateProduct } from '@/hooks/useProducts';
import { Product, ProductFormData } from '@/types';
import { isOnSale } from '@/lib/pricing';
import { getProductDisplayName } from '@/lib/product-display';
import { priceMarkdown, markdownTotals, FLOOR_PCT } from '@/lib/markdown';
import {
  MONTH_LABEL, MONTH_SHORT, PHASE_ACTION, PHASE_LABEL, SEASON_LABEL,
  CONFIDENCE_MIN, NON_MERCHANDISE, SeasonPhase, monthOf, phaseForSeason,
  seasonOf, suggestedMarkdown,
} from '@/lib/seasons';
import { ArrowLeft, Camera, CalendarDays, Tag, AlertTriangle, Sun, Snowflake } from 'lucide-react';

const fmt = (n: number) => Math.round(n).toLocaleString('mk-MK');

/** Most urgent first — the order the work should actually be done in. */
const PHASE_ORDER: SeasonPhase[] = ['endofseason', 'late', 'offseason', 'preseason', 'inseason', 'always'];

const PHASE_TONE: Record<SeasonPhase, { chip: string; border: string; bg: string }> = {
  endofseason: { chip: 'bg-red-100 text-red-800', border: 'border-red-200', bg: 'bg-red-50' },
  late: { chip: 'bg-amber-100 text-amber-800', border: 'border-amber-200', bg: 'bg-amber-50' },
  offseason: { chip: 'bg-slate-200 text-slate-700', border: 'border-slate-200', bg: 'bg-slate-50' },
  preseason: { chip: 'bg-blue-100 text-blue-800', border: 'border-blue-200', bg: 'bg-blue-50' },
  inseason: { chip: 'bg-green-100 text-green-800', border: 'border-green-200', bg: 'bg-green-50' },
  always: { chip: 'bg-slate-100 text-slate-600', border: 'border-slate-200', bg: 'bg-slate-50' },
};

/** Phases where a markdown is the instruction rather than a judgement call. */
const MARKDOWN_PHASES = new Set<SeasonPhase>(['late', 'endofseason', 'offseason']);

interface Row {
  p: Product;
  units: number;
  cost: number;
  phase: SeasonPhase;
}

interface CatStat {
  category: string;
  phase: SeasonPhase;
  models: number;
  units: number;
  cost: number;
  retail: number;
  hidden: number;
}

function SeasonView() {
  const { products, loading, refetch } = useProducts();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [pct, setPct] = useState<number | null>(null);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<{ done: number; clamped: number; failed: number } | null>(null);

  // Frozen per mount. The month does not change while the page is open, and
  // reading the clock during render makes the render impure.
  const [month] = useState(() => monthOf());

  const model = useMemo(() => {
    const rows: Row[] = [];
    const byCat = new Map<string, CatStat>();
    const unknown = new Set<string>();

    for (const p of products) {
      if (NON_MERCHANDISE.has(p.category)) continue;

      const units = (p.sizes ?? []).reduce((a, s) => a + Math.max(0, Number(s.quantity) || 0), 0);
      if (units === 0) continue;

      const profile = seasonOf(p.category);
      if (!profile) unknown.add(p.category);
      const phase = profile ? phaseForSeason(profile.season, month) : 'always';
      const cost = units * (p.purchasePrice ?? 0);

      rows.push({ p, units, cost, phase });

      const c = byCat.get(p.category) ?? {
        category: p.category, phase, models: 0, units: 0, cost: 0, retail: 0, hidden: 0,
      };
      c.models += 1;
      c.units += units;
      c.cost += cost;
      c.retail += units * p.price;
      if (p.isVisible === false) c.hidden += 1;
      byCat.set(p.category, c);
    }

    const cats = [...byCat.values()].sort(
      (a, b) => PHASE_ORDER.indexOf(a.phase) - PHASE_ORDER.indexOf(b.phase) || b.cost - a.cost
    );

    const capitalByPhase = new Map<SeasonPhase, { cost: number; units: number; models: number }>();
    for (const r of rows) {
      const e = capitalByPhase.get(r.phase) ?? { cost: 0, units: 0, models: 0 };
      e.cost += r.cost;
      e.units += r.units;
      e.models += 1;
      capitalByPhase.set(r.phase, e);
    }

    // Everything the calendar says to mark down today, worst phase first and
    // biggest capital first inside it.
    const dueList = rows
      .filter((r) => MARKDOWN_PHASES.has(r.phase) && r.p.price > 0)
      .sort(
        (a, b) => PHASE_ORDER.indexOf(a.phase) - PHASE_ORDER.indexOf(b.phase) || b.cost - a.cost
      );

    const preseason = cats.filter((c) => c.phase === 'preseason');

    return {
      rows, cats, capitalByPhase, dueList, preseason,
      unknown: [...unknown],
      totalCost: rows.reduce((a, r) => a + r.cost, 0),
      dueCost: dueList.reduce((a, r) => a + r.cost, 0),
    };
  }, [products, month]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const ssPhase = phaseForSeason('SS', month);
  const awPhase = phaseForSeason('AW', month);

  // The default is what the calendar asks for, not a round number. The worst
  // phase on the shelf sets it, so the button is right without being touched.
  const suggested = model.dueList.length
    ? suggestedMarkdown(model.dueList[0].phase, month)
    : 0;
  const activePct = pct ?? suggested;

  const shown = model.dueList.slice(0, 80);
  const chosen = shown.filter((r) => selected.has(r.p.id));
  const priced = priceMarkdown(
    chosen.map((r) => ({ id: r.p.id, listPrice: r.p.price, cost: r.p.purchasePrice, units: r.units })),
    activePct
  );
  const totals = markdownTotals(priced);
  const pricedById = new Map(priced.map((p) => [p.id, p]));
  const chosenCost = chosen.reduce((a, r) => a + r.cost, 0);

  const toggle = (id: string) => {
    setResult(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allShown = shown.length > 0 && shown.every((r) => selected.has(r.p.id));
  const toggleAll = () => {
    setResult(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (allShown) shown.forEach((r) => next.delete(r.p.id));
      else shown.forEach((r) => next.add(r.p.id));
      return next;
    });
  };

  const applyMarkdown = async () => {
    if (priced.length === 0) return;
    const msg =
      `Да се стави −${activePct}% на ${priced.length} производи?\n` +
      (totals.clamped > 0
        ? `${totals.clamped} ќе бидат ограничени на подот од ${FLOOR_PCT}% над набавната.\n`
        : '') +
      `Очекуван поврат ако сè се продаде: ${fmt(totals.cash)} ден.`;
    if (!confirm(msg)) return;

    setApplying(true);
    setResult(null);
    let done = 0;
    let failed = 0;
    const BATCH = 10;

    for (let i = 0; i < priced.length; i += BATCH) {
      const res = await Promise.allSettled(
        priced.slice(i, i + BATCH).map((p) =>
          updateProduct(p.id, {
            sale: { isActive: true, salePrice: p.salePrice, percentageOff: p.effectivePct },
          } as Partial<ProductFormData>)
        )
      );
      res.forEach((r) => (r.status === 'fulfilled' ? done++ : failed++));
    }

    setApplying(false);
    setResult({ done, clamped: totals.clamped, failed });
    setSelected(new Set());
    refetch();
  };

  const rail = (season: 'SS' | 'AW', phase: SeasonPhase) => {
    const tone = PHASE_TONE[phase];
    const cap = model.cats
      .filter((c) => seasonOf(c.category)?.season === season)
      .reduce((a, c) => a + c.cost, 0);
    return (
      <div className={`rounded-xl border ${tone.border} ${tone.bg} p-4`}>
        <div className="flex items-center gap-2">
          {season === 'SS'
            ? <Sun className="h-4 w-4 text-amber-600" />
            : <Snowflake className="h-4 w-4 text-blue-600" />}
          <p className="text-sm font-bold text-slate-800">{SEASON_LABEL[season]}</p>
          <span className={`ml-auto px-2 py-0.5 rounded-full text-[11px] font-semibold ${tone.chip}`}>
            {PHASE_LABEL[phase]}
          </span>
        </div>
        <p className="text-xs text-slate-600 mt-2">{PHASE_ACTION[phase]}</p>
        <p className="text-[11px] text-slate-500 mt-2 tabular-nums">
          {fmt(cap)} ден. набавна на полица
          {suggestedMarkdown(phase, month) > 0
            ? ` · предлог −${suggestedMarkdown(phase, month)}%`
            : ' · полна цена'}
        </p>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        <Link href="/admin" className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-800 mb-4 text-sm">
          <ArrowLeft className="h-4 w-4" />
          Назад на таблата
        </Link>

        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Сезонски календар</h1>
        <p className="text-sm text-slate-500 mt-1 mb-6">
          Возраста кажува што стои. Сезоната кажува што <strong>ќе престане да се продава</strong> — и
          тоа има рок. Шорцеви во септември не се стари; три недели се од тоа да не вредат ништо до
          јуни, а тие дванаесет месеци капитал не се гледаат никаде на другите страни.
        </p>

        <div className="mb-6 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-slate-500 shrink-0" />
          <p className="text-sm text-slate-700">
            Денес е <strong>{MONTH_LABEL[month - 1]}</strong>.
            {ssPhase !== awPhase && (
              <span className="text-slate-500">
                {' '}Двете гардероби се во различна фаза — истиот месец носи спротивни упатства.
              </span>
            )}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
          {rail('SS', ssPhase)}
          {rail('AW', awPhase)}
        </div>

        {/* what the calendar asks for today */}
        {model.dueList.length > 0 && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-6 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/60 flex items-center gap-2">
              <Tag className="h-4 w-4 text-slate-500" />
              <h2 className="font-bold text-slate-800 text-sm">За намалување сега</h2>
              <span className="ml-auto text-xs text-slate-500 tabular-nums">
                {model.dueList.length} модели · {fmt(model.dueCost)} ден. набавна
              </span>
            </div>

            <div className="px-3 sm:px-4 py-3 border-b border-slate-200 flex flex-wrap items-center gap-2">
              <button
                onClick={toggleAll}
                className="px-2.5 py-1 rounded-lg text-xs font-medium bg-white border border-slate-200 text-slate-700 hover:bg-slate-50"
              >
                {allShown ? 'Одзначи ги сите' : `Означи ги сите (${shown.length})`}
              </button>
              {selected.size > 0 && (
                <button
                  onClick={() => { setSelected(new Set()); setResult(null); }}
                  className="text-xs text-slate-500 hover:text-slate-800 underline"
                >
                  исчисти ({selected.size})
                </button>
              )}
              <div className="ml-auto flex items-center gap-1.5">
                <span className="text-xs text-slate-500 hidden sm:inline">Намалување:</span>
                {[20, 35, 50].map((v) => (
                  <button
                    key={v}
                    onClick={() => setPct(v)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors ${
                      activePct === v
                        ? 'bg-red-600 text-white'
                        : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    −{v}%
                    {v === suggested && <span className="ml-1 opacity-70">★</span>}
                  </button>
                ))}
                <input
                  type="number"
                  min={5}
                  max={80}
                  value={activePct}
                  onChange={(ev) => setPct(Math.max(5, Math.min(80, Number(ev.target.value) || 0)))}
                  className="w-16 px-2 py-1 rounded-lg border border-slate-200 text-xs tabular-nums text-right"
                  aria-label="Процент на намалување"
                />
              </div>
            </div>

            {suggested > 0 && (
              <p className="px-4 py-2 text-[11px] text-slate-500 bg-amber-50/50 border-b border-slate-100">
                ★ = што календарот го предлага за најитната фаза на полица (−{suggested}%). Скалилото е
                намерно плитко на почетокот: рано намалување враќа повеќе кеш од доцно и длабоко.
              </p>
            )}

            {priced.length > 0 && (
              <div className="px-3 sm:px-4 py-3 border-b border-slate-200 bg-slate-50">
                <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-600">
                  <span>
                    <strong className="text-slate-800">{totals.models}</strong> производи ·{' '}
                    <strong className="text-slate-800 tabular-nums">{totals.units}</strong> парчиња
                  </span>
                  <span>
                    Врзан капитал:{' '}
                    <strong className="text-slate-800 tabular-nums">{fmt(chosenCost)}</strong> ден.
                  </span>
                  <span>
                    Поврат ако сè се продаде:{' '}
                    <strong className="text-green-700 tabular-nums">{fmt(totals.cash)}</strong> ден.
                  </span>
                </div>
                {totals.clamped > 0 && (
                  <p className="mt-2 text-[11px] text-amber-700 flex items-start gap-1.5">
                    <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-px" />
                    {totals.clamped} од нив нема да добијат цели −{activePct}%: цената застанува на{' '}
                    {FLOOR_PCT}% над набавната.
                  </p>
                )}
                <button
                  onClick={applyMarkdown}
                  disabled={applying}
                  className="mt-2.5 inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold hover:bg-red-700 disabled:opacity-50"
                >
                  <Tag className="h-3.5 w-3.5" />
                  {applying ? 'Се применува…' : `Стави −${activePct}% на ${priced.length}`}
                </button>
              </div>
            )}

            {result && (
              <div
                className={`px-4 py-2 text-xs border-b border-slate-100 ${
                  result.failed > 0 ? 'bg-amber-50 text-amber-900' : 'bg-green-50 text-green-800'
                }`}
              >
                Ставен попуст на <strong>{result.done}</strong> производи
                {result.clamped > 0 ? `, од кои ${result.clamped} на подот` : ''}
                {result.failed > 0 ? ` · ${result.failed} не успеаја` : ''}.
              </div>
            )}

            <div className="divide-y divide-slate-100">
              {shown.map((r) => {
                const pm = pricedById.get(r.p.id);
                return (
                  <div
                    key={r.p.id}
                    className={`flex items-center gap-3 px-3 sm:px-4 py-3 ${
                      selected.has(r.p.id) ? 'bg-red-50/60' : 'hover:bg-slate-50/60'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected.has(r.p.id)}
                      onChange={() => toggle(r.p.id)}
                      className="h-4 w-4 shrink-0 rounded border-slate-300 accent-red-600"
                      aria-label={`Избери ${r.p.name}`}
                    />
                    <div className="min-w-0 flex-1">
                      <Link
                        href={`/admin/product/${r.p.id}`}
                        className="block font-semibold text-slate-800 hover:text-blue-600 text-sm truncate"
                      >
                        {getProductDisplayName(r.p.name, r.p.category, r.p.brand)}
                      </Link>
                      <p className="text-[11px] text-slate-400 truncate">
                        <span className={`inline-block px-1.5 rounded ${PHASE_TONE[r.phase].chip}`}>
                          {PHASE_LABEL[r.phase]}
                        </span>
                        <span className="ml-1.5 font-mono">{r.p.category}</span>
                        {r.p.isVisible === false ? ' · скриен' : ''}
                        {isOnSale(r.p) ? ' · веќе на попуст' : ''}
                      </p>
                      {pm && (
                        <p className="text-[11px] mt-0.5 tabular-nums">
                          <span className="text-slate-400 line-through">{fmt(pm.listPrice)}</span>
                          <span className="mx-1 text-slate-300">→</span>
                          <span className="font-semibold text-red-700">{fmt(pm.salePrice)} ден.</span>
                          <span className="ml-1 text-slate-400">(−{pm.effectivePct}%)</span>
                          {pm.clamped && <span className="ml-1 text-amber-600">под</span>}
                        </p>
                      )}
                    </div>
                    <div className="text-right w-14 shrink-0 tabular-nums">
                      <p className="text-sm text-slate-700">{r.units}</p>
                      <p className="text-[11px] text-slate-400">парч.</p>
                    </div>
                    <div className="hidden sm:block text-right w-20 shrink-0 tabular-nums">
                      <p className="text-sm font-semibold text-slate-800">{fmt(r.cost)}</p>
                      <p className="text-[11px] text-slate-400">набавна</p>
                    </div>
                  </div>
                );
              })}
              {model.dueList.length > shown.length && (
                <p className="px-4 py-3 text-xs text-slate-400 text-center">
                  … и уште {model.dueList.length - shown.length}.
                </p>
              )}
            </div>
          </div>
        )}

        {/* preseason — the buy/publish side of the same calendar */}
        {model.preseason.length > 0 && (
          <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 flex gap-2">
            <Camera className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              <strong>Пред сезона:</strong>{' '}
              {model.preseason.map((c) => c.category).join(', ')} — вкупно{' '}
              {fmt(model.preseason.reduce((a, c) => a + c.cost, 0))} ден. набавна, од кои{' '}
              <strong>{model.preseason.reduce((a, c) => a + c.hidden, 0)} модели се скриени</strong>.
              Тоа е редицата за фотографирање сега, пред прозорецот да се отвори — не летната
              гардероба, чија сезона штотуку заврши.{' '}
              <Link href="/admin/publishing" className="underline font-medium">
                Отвори објавување
              </Link>
              .
            </span>
          </div>
        )}

        {/* the calendar itself */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/60">
            <h2 className="font-bold text-slate-800 text-sm">Гардероба по сезона</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              „Топло“ е делот од продажбите во април–септември, измерен од твојата историја.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  {['Категорија', 'Сезона', 'Фаза', 'Топло', 'Твој врв', 'Парчиња', 'Набавна'].map((h, i) => (
                    <th
                      key={h}
                      className={`px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider ${
                        i < 3 ? 'text-left' : 'text-right'
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {model.cats.map((c) => {
                  const prof = seasonOf(c.category);
                  const thin = !prof || prof.measured < CONFIDENCE_MIN;
                  return (
                    <tr key={c.category}>
                      <td className="px-3 py-2.5 font-mono text-xs text-slate-700">
                        {c.category}
                        {c.hidden > 0 && (
                          <span className="ml-1.5 text-[10px] text-slate-400">{c.hidden} скриени</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-xs text-slate-600">
                        {prof ? SEASON_LABEL[prof.season] : '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`px-1.5 py-0.5 rounded text-[11px] font-semibold ${PHASE_TONE[c.phase].chip}`}>
                          {PHASE_LABEL[c.phase]}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-xs">
                        {prof ? (
                          <span className={thin ? 'text-slate-400' : 'text-slate-700'}>
                            {Math.round(prof.warmShare * 100)}%
                            <span className="text-slate-400"> · {prof.measured}</span>
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-right text-xs text-slate-500">
                        {prof && prof.peak.length > 0
                          ? prof.peak.map((m) => MONTH_SHORT[m - 1]).join(', ')
                          : <span className="text-slate-300">малку податоци</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">{c.units}</td>
                      <td className="px-3 py-2.5 text-right tabular-nums text-slate-800 font-medium">
                        {fmt(c.cost)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <p className="text-[11px] text-slate-400 mt-4 flex items-start gap-1.5">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-amber-500" />
          Сезоната е доделена по <strong>сурова категорија</strong>, не по група за извештаи — групите
          мешаат сезони и просекот тогаш не опишува ништо. „Кошули“ содржи <code>shirts</code> (52%
          топло, се продава сите 12 месеци) заедно со <code>blouses</code> (9% топло, зимска), а
          „Фармерки“ содржи <code>jeans</code> со <code>shortsJeans</code> (92% топло).
          Категорија со под {CONFIDENCE_MIN} измерени продажби е обоена
          бледо — таму сезоната е проценка, не мерење.
          {model.unknown.length > 0 && (
            <>
              {' '}Без доделена сезона: {model.unknown.join(', ')}.
            </>
          )}
        </p>
      </div>
    </div>
  );
}

export default function SeasonPage() {
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

  return <SeasonView />;
}
