'use client';

/**
 * "Предложи цена" in the product form (owner, 2026-11-20, D-049): the purchase
 * price, the share of the shop's costs and of advertising it carries, and the
 * profit, from the last twelve months (`src/lib/price-suggestion.ts`). Admin
 * only: it reads the ledger and the expenses.
 */

import { useState } from 'react';
import { Calculator, ChevronDown, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { AD_BUDGET } from '@/lib/break-even';
import { mkDen, mkNumber } from '@/lib/mk-format';
import {
  fetchOverheadBasis, suggestPrice, SUGGEST_PROFIT_MAX, SUGGEST_PROFIT_SHARE, type OverheadBasis,
} from '@/lib/price-suggestion';

// One read per visit to the back office: the twelve months do not move while the form is open.
let basisOnce: Promise<OverheadBasis | null> | null = null;

const periodMk = (p: string) => `${p.slice(5, 7)}.${p.slice(0, 4)}`;

export default function PriceSuggestionPanel({
  cost, price, salePrice, onApply,
}: {
  cost: number | undefined;
  /** The list price as typed. */
  price: number;
  /** The price on sale, when the product is on one. */
  salePrice?: number;
  onApply: (price: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const [basis, setBasis] = useState<OverheadBasis | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profitPct, setProfitPct] = useState(Math.round(SUGGEST_PROFIT_SHARE * 100));
  const [marketing, setMarketing] = useState(AD_BUDGET);
  const [why, setWhy] = useState(false);

  const start = async () => {
    setOpen(true);
    if (basis) return;
    setLoading(true);
    setError(null);
    try {
      basisOnce ??= fetchOverheadBasis(supabase);
      const b = await basisOnce;
      if (!b || !(b.cogsPerMonth > 0)) setError('Нема доволно продажби со набавна цена за пресметка.');
      setBasis(b);
    } catch (e) {
      basisOnce = null;
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={start}
        className="flex w-full items-center justify-center gap-2 rounded-lg border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm font-semibold text-indigo-800 hover:bg-indigo-100"
      >
        <Calculator className="h-4 w-4" /> Предложи цена од трошоците
      </button>
    );
  }

  const s = suggestPrice(cost, basis, { profitShare: profitPct / 100, marketingPerMonth: marketing });
  const gap = s && price > 0 ? price - s.fullCost : null;
  const saleGap = s && salePrice !== undefined && salePrice > 0 ? salePrice - s.fullCost : null;

  return (
    <div className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold text-indigo-900">
          <Calculator className="h-4 w-4" /> Предлог од трошоците
        </p>
        <button type="button" aria-label="Затвори" onClick={() => setOpen(false)} className="rounded p-1 text-indigo-700 hover:bg-indigo-100">
          <X className="h-4 w-4" />
        </button>
      </div>

      {loading && <p className="text-sm text-slate-600">Се пресметува од последните 12 месеци…</p>}
      {error && <p className="text-sm text-red-700">{error}</p>}
      {!loading && !error && basis && !s && (
        <p className="text-sm text-slate-700">Внеси ја набавната цена: предлогот тргнува од неа.</p>
      )}

      {s && basis && (
        <>
          <dl className="space-y-1 text-sm tabular-nums">
            <Row label="Набавна" value={mkDen(s.cost)} />
            <Row label={`Трошоци на дуќанот (${mkNumber(s.overheadRate, 2)} ден. на секој денар набавна)`} value={`+ ${mkDen(Math.round(s.overhead))}`} />
            <Row label={`Маркетинг (${mkDen(marketing)} месечно)`} value={`+ ${mkDen(Math.round(s.marketing))}`} />
            <div className="my-1 border-t border-indigo-200" />
            <Row label="Целосна цена на парчето" value={mkDen(Math.round(s.fullCost))} strong />
            <Row label="Најниска цена без загуба" value={mkDen(s.breakEven)} muted />
            <Row label={`Со добивка ${profitPct}%`} value={mkDen(s.suggested)} strong big />
          </dl>
          <p className="mt-1 text-xs text-slate-600">
            Маржа по предлогот {mkNumber(s.marginAtSuggested * 100, 1)}% · цената е {mkNumber(s.suggested / s.cost, 2)}× набавната
          </p>

          {gap !== null && (
            <p className={`mt-2 rounded-lg px-3 py-2 text-xs font-medium ${gap < 0 ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'}`}>
              {gap < 0
                ? `Сегашната цена ${mkDen(price)} е ${mkDen(Math.round(-gap))} под целосната цена: при ова темпо секое парче продадено по неа е загуба.`
                : `Сегашната цена ${mkDen(price)} ги покрива трошоците и остава ${mkDen(Math.round(gap))} по парче.`}
            </p>
          )}
          {saleGap !== null && saleGap < 0 && (
            <p className="mt-2 rounded-lg bg-red-100 px-3 py-2 text-xs font-medium text-red-800">
              На попуст, по {mkDen(salePrice!)}, секое парче е {mkDen(Math.round(-saleGap))} под целосната цена.
            </p>
          )}

          <div className="mt-3 grid grid-cols-2 gap-2">
            <label className="block">
              <span className="mb-0.5 block text-[11px] font-medium text-slate-600">Добивка (% од цената)</span>
              <input
                type="number"
                min={0}
                max={Math.round(SUGGEST_PROFIT_MAX * 100)}
                value={profitPct}
                onChange={(e) => setProfitPct(Math.min(Math.round(SUGGEST_PROFIT_MAX * 100), Math.max(0, parseInt(e.target.value, 10) || 0)))}
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
              />
            </label>
            <label className="block">
              <span className="mb-0.5 block text-[11px] font-medium text-slate-600">Маркетинг месечно (ден.)</span>
              <input
                type="number"
                min={0}
                step={500}
                value={marketing}
                onChange={(e) => setMarketing(Math.max(0, parseInt(e.target.value, 10) || 0))}
                className="w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm"
              />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onApply(s.suggested)}
              className="rounded-lg bg-indigo-700 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-800"
            >
              Стави {mkDen(s.suggested)}
            </button>
            <button
              type="button"
              onClick={() => onApply(s.breakEven)}
              className="rounded-lg border border-indigo-300 bg-white px-3 py-2 text-sm font-medium text-indigo-800 hover:bg-indigo-50"
            >
              Стави {mkDen(s.breakEven)} (без добивка)
            </button>
          </div>

          <button type="button" onClick={() => setWhy((w) => !w)} className="mt-3 flex items-center gap-1 text-xs font-medium text-indigo-800">
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${why ? 'rotate-180' : ''}`} /> Од каде овие бројки
          </button>
          {why && (
            <div className="mt-1 space-y-1 text-xs text-slate-700">
              <p>
                Од {periodMk(basis.from)} до {periodMk(basis.to)} трошоците на дуќанот (кирија, плати, сметководство и друго, без рекламите)
                беа просечно {mkDen(Math.round(basis.opexPerMonth))} месечно, а продадената стока чинеше {mkDen(Math.round(basis.cogsPerMonth))} по набавна
                ({mkNumber(basis.unitsPerMonth)} парчиња месечно). Затоа секој денар набавна носи {mkNumber(s.overheadRate, 2)} ден. трошоци.
                Рекламите се делат исто, по буџетот.
              </p>
              {basis.estimatedMonths > 0 && (
                <p>За {basis.estimatedMonths} {basis.estimatedMonths === 1 ? 'месец' : 'месеци'} трошоците не беа внесени цели, па важи претпоставката од 65.000 ден.</p>
              )}
              <p>
                Делот за трошоците паѓа кога се продава повеќе. Ако цената подоцна се спушти на попуст, попустот оди од добивката: под најниската цена без загуба секое парче е загуба.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Row({ label, value, strong, muted, big }: { label: string; value: string; strong?: boolean; muted?: boolean; big?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={`${muted ? 'text-slate-500' : 'text-slate-700'} ${strong ? 'font-semibold text-slate-900' : ''}`}>{label}</dt>
      <dd className={`shrink-0 ${strong ? 'font-semibold text-slate-900' : 'text-slate-700'} ${muted ? 'text-slate-500' : ''} ${big ? 'text-lg text-indigo-900' : ''}`}>{value}</dd>
    </div>
  );
}
