'use client';

/**
 * Where the next purchase money should go — and whether there should be any.
 *
 * The order of the two questions matters. Stock currently sits at roughly twelve
 * months of supply against a healthy three to four, so a screen that cheerfully
 * splits a budget across categories would contradict the plan it is meant to
 * serve (A4 in docs/TURNAROUND.md: no buying until turnover clears 2x). The
 * open-to-buy gate comes first and can return zero; the split is what to do with
 * a budget that has been earned, not an invitation to spend.
 *
 * GMROI is the ranking metric rather than revenue or margin alone: it is gross
 * profit per denar tied up, which is the only one of the three that answers
 * "where does capital work hardest".
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useProducts } from '@/hooks/useProducts';
import { Product } from '@/types';
import { MAX_MONTHS_OF_STOCK, MIN_TURNOVER_TO_BUY } from '@/lib/open-to-buy';

import { ArrowLeft, Ban, Coins, TrendingUp } from 'lucide-react';

const DAY = 86_400_000;
const fmt = (n: number) => Math.round(n).toLocaleString('mk-MK');

const CATEGORY_GROUPS: Record<string, string> = {
  tShirts: 'Маици & Поло', oversizeTshirts: 'Маици & Поло', polos: 'Маици & Поло',
  shirts: 'Кошули', shortSleevedShirt: 'Кошули', blouses: 'Кошули',
  cardigans: 'Плетиво', turtleNecks: 'Плетиво', halfZips: 'Плетиво',
  hoodies: 'Дуксери', fullZips: 'Дуксери',
  jeans: 'Фармерки', shortsJeans: 'Фармерки',
  pants: 'Панталони', cargoTrousers: 'Панталони',
  jackets: 'Јакни & Мантили', coats: 'Јакни & Мантили', vests: 'Јакни & Мантили',
  suits: 'Свечено', blazers: 'Свечено', suitJackets: 'Свечено',
  belts: 'Аксесоари', accessories: 'Аксесоари',
};
const NON_MERCHANDISE = new Set(['vaucer']);
const groupOf = (c: string) => CATEGORY_GROUPS[c] ?? c ?? '—';

/** Groups that sell from autumn into winter. */
const AUTUMN_GROUPS = new Set(['Јакни & Мантили', 'Плетиво', 'Дуксери']);

// The gate itself lives in lib/open-to-buy so this screen and the reorder plan
// cannot disagree about where the line is.
/** Guardrails so one strong category cannot take everything. */
const MIN_SHARE = 0.05;
const MAX_SHARE = 0.35;

interface GroupStat {
  name: string;
  models: number;
  units: number;
  cost: number;
  soldUnits: number;
  revenue: number;
  grossProfit: number;
  gmroi: number;
  /** Of what was on hand over the year, how much moved. A proxy, not a true
   *  sell-through: goods received historically were never recorded. */
  sellThrough: number;
  monthsOfSupply: number;
  score: number;
  share: number;
  autumn: boolean;
}

function CapitalView() {
  const { products, loading } = useProducts();
  const [budgetInput, setBudgetInput] = useState('100000');
  const [now] = useState(() => Date.now());

  const model = useMemo(() => {
    const merch = products.filter((p) => !NON_MERCHANDISE.has(p.category));
    const unitsOf = (p: Product) =>
      (p.sizes ?? []).reduce((a, s) => a + Math.max(0, Number(s.quantity) || 0), 0);

    const raw = new Map<string, GroupStat>();
    let totalCost = 0;
    let totalCogs = 0;
    let totalRevenue = 0;

    for (const p of merch) {
      const g = groupOf(p.category);
      const st = raw.get(g) ?? {
        name: g, models: 0, units: 0, cost: 0, soldUnits: 0, revenue: 0,
        grossProfit: 0, gmroi: 0, sellThrough: 0, monthsOfSupply: 0,
        score: 0, share: 0, autumn: AUTUMN_GROUPS.has(g),
      };

      const units = unitsOf(p);
      const cost = p.purchasePrice;
      if (units > 0) {
        st.models += 1;
        st.units += units;
        if (cost !== undefined) {
          st.cost += units * cost;
          totalCost += units * cost;
        }
      }

      for (const s of p.sold ?? []) {
        const price = Number(s.price) || 0;
        if (price <= 0) continue; // giveaways are not demand
        if (Date.parse(String(s.soldDate)) < now - 365 * DAY) continue;
        st.soldUnits += 1;
        st.revenue += price;
        totalRevenue += price;
        if (cost !== undefined) {
          st.grossProfit += price - cost;
          totalCogs += cost;
        }
      }

      raw.set(g, st);
    }

    const groups = [...raw.values()].filter((g) => g.units > 0 || g.soldUnits > 0);
    for (const g of groups) {
      g.gmroi = g.cost > 0 ? g.grossProfit / g.cost : 0;
      const hadOnHand = g.soldUnits + g.units;
      g.sellThrough = hadOnHand > 0 ? g.soldUnits / hadOnHand : 0;
      const perMonth = g.soldUnits / 12;
      g.monthsOfSupply = perMonth > 0 ? g.units / perMonth : Infinity;
      // Both halves matter: return per denar tied up, and whether it clears.
      g.score = Math.max(0, g.gmroi) * Math.max(0, g.sellThrough);
    }

    // Guardrails, applied by clamping then redistributing the remainder among
    // the groups that are not yet clamped, so the shares still sum to one.
    const scored = groups.filter((g) => g.score > 0);
    const totalScore = scored.reduce((a, g) => a + g.score, 0);
    if (totalScore > 0) {
      for (const g of groups) g.share = g.score / totalScore;

      for (let pass = 0; pass < 4; pass += 1) {
        const over = groups.filter((g) => g.share > MAX_SHARE);
        const under = groups.filter((g) => g.share > 0 && g.share < MIN_SHARE);
        if (over.length === 0 && under.length === 0) break;

        let freed = 0;
        for (const g of over) { freed += g.share - MAX_SHARE; g.share = MAX_SHARE; }
        for (const g of under) { freed -= MIN_SHARE - g.share; g.share = MIN_SHARE; }

        const flexible = groups.filter(
          (g) => g.share > 0 && g.share < MAX_SHARE && g.share > MIN_SHARE
        );
        const flexTotal = flexible.reduce((a, g) => a + g.share, 0);
        if (flexTotal <= 0) break;
        for (const g of flexible) g.share += (freed * g.share) / flexTotal;
      }
    }

    groups.sort((a, b) => b.gmroi - a.gmroi);

    const monthlyCogs = totalCogs / 12;
    const annualCogs = totalCogs;
    const turnover = totalCost > 0 ? annualCogs / totalCost : 0;
    const maxStock = monthlyCogs * MAX_MONTHS_OF_STOCK;
    const headroom = maxStock - totalCost;

    return {
      groups, totalCost, monthlyCogs, annualCogs, totalRevenue,
      turnover, maxStock, headroom,
      canBuy: turnover >= MIN_TURNOVER_TO_BUY && headroom > 0,
    };
  }, [products, now]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const budget = Math.max(0, Number(budgetInput) || 0);
  const month = new Date().getMonth() + 1;
  const preSeason = month >= 7 && month <= 10;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        <Link href="/admin" className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-800 mb-4 text-sm">
          <ArrowLeft className="h-4 w-4" />
          Назад на таблата
        </Link>

        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Каде да одат следните денари</h1>
        <p className="text-sm text-slate-500 mt-1 mb-6">
          Прво прашање е дали воопшто да се купува. Дури потоа — каде.
        </p>

        {/* the gate */}
        <div className={`rounded-xl border p-5 mb-6 shadow-sm ${
          model.canBuy ? 'border-green-300 bg-green-50' : 'border-red-300 bg-red-50'
        }`}>
          <div className="flex items-center gap-2 mb-3">
            {model.canBuy
              ? <TrendingUp className="h-5 w-5 text-green-700" />
              : <Ban className="h-5 w-5 text-red-700" />}
            <h2 className={`font-bold ${model.canBuy ? 'text-green-900' : 'text-red-900'}`}>
              {model.canBuy
                ? `Простор за набавка: ${fmt(model.headroom)} ден.`
                : 'Буџет за набавка: нула'}
            </h2>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            {[
              { k: 'Залиха по набавна', v: fmt(model.totalCost) + ' ден.' },
              { k: 'COGS месечно', v: fmt(model.monthlyCogs) + ' ден.' },
              { k: 'Здрав максимум', v: fmt(model.maxStock) + ' ден.', hint: `${MAX_MONTHS_OF_STOCK}× месечен COGS` },
              { k: 'Turnover', v: model.turnover.toFixed(2) + '×', hint: `праг за набавка ${MIN_TURNOVER_TO_BUY}×` },
            ].map((x) => (
              <div key={x.k} className="bg-white/70 rounded-lg px-3 py-2">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{x.k}</p>
                <p className="text-lg font-bold text-slate-800 tabular-nums">{x.v}</p>
                {x.hint && <p className="text-[10px] text-slate-400">{x.hint}</p>}
              </div>
            ))}
          </div>

          {!model.canBuy && (
            <div className="text-sm text-red-900 space-y-1.5">
              <p>
                Залихата е <strong>{fmt(model.totalCost)}</strong> ден. наспроти здрав максимум од{' '}
                <strong>{fmt(model.maxStock)}</strong> — тоа е{' '}
                <strong>{(model.totalCost / Math.max(1, model.maxStock)).toFixed(1)}×</strong> над,
                односно околу <strong>{(model.totalCost / Math.max(1, model.monthlyCogs)).toFixed(0)} месеци</strong> залиха
                при здрави 3–4.
              </p>
              <p>
                Нулата не е грешка во пресметката — тоа е одговорот. Парите за набавка веќе се
                потрошени и стојат на полица; следниот денар не купува, туку го ослободува тоа
                што е таму (A2).
              </p>
              <p className="text-red-800">
                <strong>Единствен исклучок:</strong> докупување на M/L/XL за модели со докажана
                продажба (A5). Тоа не додава асортиман — го поправа тоа што веќе се продава.
              </p>
            </div>
          )}
        </div>

        {/* allocation */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Coins className="h-4 w-4 text-slate-500" />
            <h2 className="font-bold text-slate-800 text-sm">Ако имаше буџет, вака би се поделил</h2>
          </div>
          <div className="flex items-center gap-2 mb-4">
            <label className="text-xs text-slate-500">Износ</label>
            <input
              type="number"
              min="0"
              step="1000"
              value={budgetInput}
              onChange={(e) => setBudgetInput(e.target.value)}
              className="w-32 px-3 py-1.5 text-sm border border-slate-300 rounded-lg tabular-nums"
            />
            <span className="text-xs text-slate-500">ден.</span>
            {!model.canBuy && (
              <span className="text-xs text-red-700 ml-2">
                хипотетички — вистинскиот буџет е нула
              </span>
            )}
          </div>

          <div className="space-y-1.5">
            {model.groups.filter((g) => g.share > 0).map((g) => (
              <div key={g.name} className="flex items-center gap-3">
                <span className="w-36 shrink-0 text-sm text-slate-700 truncate">{g.name}</span>
                <div className="flex-1 h-6 bg-slate-100 rounded overflow-hidden">
                  <div
                    className={`h-full ${g.gmroi >= 1.3 ? 'bg-green-500' : g.gmroi >= 0.9 ? 'bg-amber-400' : 'bg-red-400'}`}
                    style={{ width: `${Math.min(100, g.share * 100 * 2.5)}%` }}
                  />
                </div>
                <span className="w-12 shrink-0 text-right text-xs text-slate-500 tabular-nums">
                  {(g.share * 100).toFixed(0)}%
                </span>
                <span className="w-24 shrink-0 text-right text-sm font-semibold text-slate-800 tabular-nums">
                  {fmt(budget * g.share)}
                </span>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-slate-400 mt-3">
            Поделбата е GMROI × sell-through, ограничена на најмалку {MIN_SHARE * 100}% и најмногу{' '}
            {MAX_SHARE * 100}% по група — една силна категорија не смее да земе сè.
          </p>
          {preSeason && (
            <p className="text-[11px] text-amber-700 mt-1">
              Сезонска забелешка: есенските групи (јакни, плетиво, дуксери) се мерат надвор од
              својата сезона, па нивниот GMROI е потценет во овој месец.
            </p>
          )}
        </div>

        {/* detail */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/60">
            <h2 className="font-bold text-slate-800 text-sm">По група, подредено по GMROI</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead>
                <tr className="border-b border-slate-100">
                  {['Група', 'Залиха', 'Бруто 12м', 'GMROI', 'Sell-through', 'Месеци залиха', 'Дел од буџет'].map((h, i) => (
                    <th key={h} className={`px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider ${i === 0 ? 'text-left' : 'text-right'}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {model.groups.map((g) => (
                  <tr key={g.name} className="hover:bg-slate-50/60">
                    <td className="px-3 py-2.5 font-medium text-slate-800">
                      {g.name}
                      {g.autumn && preSeason && (
                        <span className="ml-1.5 text-[10px] text-amber-600">вон сезона</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{fmt(g.cost)}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{fmt(g.grossProfit)}</td>
                    <td className={`px-3 py-2.5 text-right tabular-nums font-semibold ${
                      g.gmroi >= 1.3 ? 'text-green-700' : g.gmroi >= 0.9 ? 'text-amber-700' : 'text-red-700'
                    }`}>
                      {g.gmroi.toFixed(2)}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-600">
                      {(g.sellThrough * 100).toFixed(0)}%
                    </td>
                    <td className={`px-3 py-2.5 text-right tabular-nums ${
                      g.monthsOfSupply > 12 ? 'text-red-700' : g.monthsOfSupply > 6 ? 'text-amber-700' : 'text-slate-600'
                    }`}>
                      {Number.isFinite(g.monthsOfSupply) ? g.monthsOfSupply.toFixed(1) : '∞'}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-800 font-semibold">
                      {g.share > 0 ? (g.share * 100).toFixed(0) + '%' : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-4 text-[11px] text-slate-400 space-y-1">
          <p>
            <strong>GMROI</strong> = бруто профит за 12 месеци ÷ вредност на залихата по набавна.
            Колку денари носи секој денар врзан во стока. Здраво за мода е 2,5–3,0.
          </p>
          <p>
            <strong>Sell-through</strong> тука е приближен: продадено ÷ (продадено + на залиха).
            Вистинскиот бара примени количини, кои историски не се запишувани — од приемот наваму
            ќе бидат.
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
