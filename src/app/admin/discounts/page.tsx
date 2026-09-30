'use client';

/**
 * Discounts by the rule (D-027, Task 11.3).
 *
 * The owner's rule: a discount only on models with one or two sizes left;
 * dead stock down the ladder, never below the floor; other leftovers wait for
 * their pre-season; everything else at full price. This page brings the site's
 * sale prices in line with it — the products on sale that the rule does not
 * allow, with one button to take them back to full price — and lists the ones
 * that may keep their discount, flagged where it sits below the floor.
 *
 * The till is where most discounts are given, and there the rule is the badge
 * (`DiscountBadge`) on the sale screen, not this page.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useProducts, updateProduct } from '@/hooks/useProducts';
import { Product, ProductFormData } from '@/types';
import { getEffectivePrice, getPercentOff, isOnSale } from '@/lib/pricing';
import { discountVerdict, DiscountVerdict, DEAD_LADDER, MAX_SIZES_FOR_DISCOUNT } from '@/lib/discount-rule';
import { getProductDisplayName } from '@/lib/product-display';
import { ArrowLeft, BadgePercent, Ban, Check } from 'lucide-react';

const fmt = (n: number) => Math.round(n).toLocaleString('mk-MK');

interface Row {
  p: Product;
  v: DiscountVerdict;
  price: number;
  pct: number;
  belowFloor: boolean;
}

function DiscountsView() {
  const { products, loading, refetch } = useProducts();
  const [now] = useState(() => Date.now());
  const [selected, setSelected] = useState<Set<string> | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ done: number; failed: number } | null>(null);

  const model = useMemo(() => {
    const live = products.filter((p) => (p.sizes ?? []).some((s) => (Number(s.quantity) || 0) >= 1));
    const rows: Row[] = live.filter(isOnSale).map((p) => {
      const v = discountVerdict(p, now);
      const price = getEffectivePrice(p);
      return { p, v, price, pct: getPercentOff(p), belowFloor: v.floorPrice !== null && price < v.floorPrice };
    });
    const remove = rows.filter((r) => !r.v.allowed).sort((a, b) => b.pct - a.pct);
    const keep = rows.filter((r) => r.v.allowed).sort((a, b) => Number(b.belowFloor) - Number(a.belowFloor) || b.pct - a.pct);
    let mayCount = 0;
    for (const p of live) if (discountVerdict(p, now).allowed) mayCount++;
    return { live: live.length, remove, keep, mayCount };
  }, [products, now]);

  // Everything in "remove" starts selected: that list is the rule, not a suggestion.
  const chosen = selected ?? new Set(model.remove.map((r) => r.p.id));
  const toggle = (id: string) => {
    setResult(null);
    const next = new Set(chosen);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelected(next);
  };

  const disable = async () => {
    const targets = model.remove.filter((r) => chosen.has(r.p.id)).map((r) => r.p);
    if (targets.length === 0) return;
    if (!confirm(`Да се исклучи попустот на ${targets.length} производи? Цената на сајтот се враќа на полна.`)) return;
    setRunning(true);
    setResult(null);
    let done = 0;
    let failed = 0;
    const BATCH = 10;
    for (let i = 0; i < targets.length; i += BATCH) {
      const results = await Promise.allSettled(
        targets.slice(i, i + BATCH).map((p) =>
          updateProduct(p.id, {
            // Same shape as the catalogue's bulk freeze: the old percentage stays
            // as a record, inert while isActive is false.
            sale: { isActive: false, salePrice: 0, percentageOff: p.sale?.percentageOff ?? 0 },
          } as Partial<ProductFormData>)
        )
      );
      results.forEach((r) => (r.status === 'fulfilled' ? done++ : failed++));
    }
    setRunning(false);
    setResult({ done, failed });
    setSelected(null);
    refetch();
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const chosenCount = model.remove.filter((r) => chosen.has(r.p.id)).length;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        <Link href="/admin" className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-800 mb-4 text-sm">
          <ArrowLeft className="h-4 w-4" />
          Назад на таблата
        </Link>

        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Попусти по правилото</h1>
        <p className="text-sm text-slate-500 mt-1 mb-6">
          Попуст само на модели со најмногу {MAX_SIZES_FOR_DISCOUNT} големини на полица.
          Мртва стока по скалилото ({DEAD_LADDER.map((s) => `−${s}%`).join(' → ')}), никогаш под подот.
          Останатите остатоци чекаат пред-сезона. Сè друго оди по полна цена (D-027).
        </p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          {[
            { k: 'Модели на полица', v: model.live },
            { k: 'Смеат попуст', v: model.mayCount, tone: 'text-green-700' },
            { k: 'На попуст, не смеат', v: model.remove.length, tone: model.remove.length ? 'text-red-700' : 'text-green-700' },
            { k: 'На попуст, смеат', v: model.keep.length },
          ].map((x) => (
            <div key={x.k} className="bg-white rounded-xl border border-slate-200 px-3 py-2 shadow-sm">
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{x.k}</p>
              <p className={`text-2xl font-bold tabular-nums ${x.tone ?? 'text-slate-800'}`}>{x.v}</p>
            </div>
          ))}
        </div>

        <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <strong>На каса:</strong> при продажба (Продажба во дуќан и страната на производот) секој модел има ознака{' '}
          <span className="font-semibold text-green-800">🟢 Може попуст</span> или{' '}
          <span className="font-semibold text-slate-700">🔴 Полна цена</span>. Ако се внесе попуст што правилото не го дава,
          под цената се појавува предупредување. Продажбата не се блокира.
        </div>

        {/* remove */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm mb-6">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3 border-b border-slate-100">
            <Ban className="h-4 w-4 text-red-600" />
            <h2 className="font-bold text-slate-800 text-sm flex-1">На попуст, а по правилото оди по полна цена ({model.remove.length})</h2>
            <button
              onClick={disable}
              disabled={running || chosenCount === 0}
              className="px-3 py-1.5 rounded-lg bg-red-600 text-white text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {running ? 'Се исклучува…' : `Исклучи попуст (${chosenCount})`}
            </button>
          </div>
          {result && (
            <p className={`px-4 py-2 text-sm ${result.failed ? 'text-red-700' : 'text-green-700'}`}>
              Исклучено: {result.done}{result.failed ? ` · не успеа: ${result.failed}` : ''}
            </p>
          )}
          {model.remove.length === 0 ? (
            <p className="px-4 py-6 text-sm text-green-700 flex items-center gap-2"><Check className="h-4 w-4" /> Нема попуст надвор од правилото.</p>
          ) : (
            <RowTable rows={model.remove} chosen={chosen} onToggle={toggle} />
          )}
        </section>

        {/* keep */}
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
            <BadgePercent className="h-4 w-4 text-green-600" />
            <h2 className="font-bold text-slate-800 text-sm">На попуст и смеат ({model.keep.length})</h2>
          </div>
          {model.keep.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">Нема.</p>
          ) : (
            <RowTable rows={model.keep} />
          )}
        </section>
      </div>
    </div>
  );
}

function RowTable({ rows, chosen, onToggle }: { rows: Row[]; chosen?: Set<string>; onToggle?: (id: string) => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-[11px] uppercase tracking-wider text-slate-500 bg-slate-50">
          <tr>
            {onToggle && <th className="px-3 py-2 w-8" />}
            <th className="px-3 py-2 text-left">Модел</th>
            <th className="px-3 py-2 text-left">Зошто</th>
            <th className="px-3 py-2 text-right">Големини</th>
            <th className="px-3 py-2 text-right">Цена</th>
            <th className="px-3 py-2 text-right">Попуст</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => (
            <tr key={r.p.id} className={r.belowFloor ? 'bg-amber-50' : ''}>
              {onToggle && (
                <td className="px-3 py-2">
                  <input type="checkbox" checked={chosen?.has(r.p.id) ?? false} onChange={() => onToggle(r.p.id)} />
                </td>
              )}
              <td className="px-3 py-2">
                <Link href={`/admin/product/${r.p.id}`} className="font-medium text-slate-800 hover:text-blue-700">
                  {getProductDisplayName(r.p.name, r.p.category, r.p.brand)}
                </Link>
                <p className="text-[11px] text-slate-400">{r.p.id}</p>
              </td>
              <td className="px-3 py-2 text-slate-600">
                {r.v.reason}
                {r.belowFloor && r.v.floorPrice !== null && (
                  <p className="text-[11px] text-amber-700">под подот од {fmt(r.v.floorPrice)} ден.</p>
                )}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{r.v.liveSizes}</td>
              <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                {fmt(r.price)} <span className="text-[11px] text-slate-400 line-through">{fmt(r.p.price)}</span>
              </td>
              <td className="px-3 py-2 text-right tabular-nums">−{r.pct}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function DiscountsPage() {
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
        <Link href="/admin" className="text-blue-600 hover:text-blue-700 font-medium">Најави се</Link>
      </div>
    );
  }
  return <DiscountsView />;
}
