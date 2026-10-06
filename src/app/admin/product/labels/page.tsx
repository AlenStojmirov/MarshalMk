'use client';

/**
 * QR labels to print (Task 11.5).
 *
 * One QR per model (owner, 2026-10-06): every piece of a model carries the
 * same code, and the size is picked on the sale screen. The page serves both
 * the first labelling of the whole shop (pick many products) and a single new
 * product (`?ids=…` from the product page). One copy per model by default; the
 * number of copies can be raised, e.g. one per piece.
 *
 * Under /admin/product so staff, who label the stock, can open it (roles.ts).
 * Labels carry no price: prices change, and a label is printed once.
 */

import { Suspense, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useProducts } from '@/hooks/useProducts';
import { Product } from '@/types';
import { getProductDisplayName } from '@/lib/product-display';
import { sellUrl } from '@/lib/product-qr';
import QrCode from '@/components/admin/QrCode';
import { ArrowLeft, Printer } from 'lucide-react';

const shelfOf = (p: Product) => (p.sizes ?? []).filter((s) => s.size && (Number(s.quantity) || 0) >= 1);

function LabelsView() {
  const search = useSearchParams();
  const { products, loading } = useProducts();
  const [picked, setPicked] = useState<Set<string>>(
    () => new Set((search.get('ids') ?? '').split(',').filter(Boolean))
  );
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [query, setQuery] = useState('');

  const live = useMemo(
    () => products.filter((p) => shelfOf(p).length > 0).sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name)),
    [products]
  );
  const q = query.trim().toLowerCase();
  const listed = q
    ? live.filter((p) => `${p.name} ${p.id} ${p.category} ${getProductDisplayName(p.name, p.category, p.brand)}`.toLowerCase().includes(q))
    : live;

  const copiesOf = (id: string) => counts[id] ?? 1;

  const labels = useMemo(() => {
    const out: { p: Product; n: number }[] = [];
    for (const p of live) {
      if (!picked.has(p.id)) continue;
      const copies = Math.max(0, counts[p.id] ?? 1);
      for (let n = 0; n < copies; n++) out.push({ p, n });
    }
    return out;
  }, [live, picked, counts]);

  const toggle = (id: string) => {
    const next = new Set(picked);
    if (next.has(id)) next.delete(id); else next.add(id);
    setPicked(next);
  };
  const allListed = listed.length > 0 && listed.every((p) => picked.has(p.id));
  const toggleAll = () => {
    const next = new Set(picked);
    for (const p of listed) if (allListed) next.delete(p.id); else next.add(p.id);
    setPicked(next);
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 print:bg-white">
      <div className="max-w-5xl mx-auto px-4 py-6 print:hidden">
        <Link href="/admin" className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-800 mb-4 text-sm">
          <ArrowLeft className="h-4 w-4" /> Назад на таблата
        </Link>
        <h1 className="text-2xl font-bold text-slate-800">QR етикети</h1>
        <p className="text-sm text-slate-500 mt-1 mb-4">
          Еден QR за модел, ист за сите големини. Скенирање со камерата на телефонот ја отвора продажбата за
          моделот, а големината се избира таму. Стандардно по една етикета; бројот може да се зголеми.
        </p>

        <div className="flex flex-wrap items-center gap-3 mb-3">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Барај по шифра, име или категорија"
            className="flex-1 min-w-[200px] px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
          <button onClick={toggleAll} className="px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm">
            {allListed ? 'Тргни ги сите' : `Избери ги сите (${listed.length})`}
          </button>
          <button
            onClick={() => window.print()}
            disabled={labels.length === 0}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"
          >
            <Printer className="h-4 w-4" /> Печати {labels.length} етикети
          </button>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm max-h-[50vh] overflow-y-auto divide-y divide-slate-100">
          {listed.map((p) => (
            <div key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2">
              <input type="checkbox" checked={picked.has(p.id)} onChange={() => toggle(p.id)} />
              <div className="flex-1 min-w-[160px]">
                <p className="text-sm font-medium text-slate-800">{getProductDisplayName(p.name, p.category, p.brand)}</p>
                <p className="text-[11px] text-slate-400">{p.id}</p>
              </div>
              <span className="text-[11px] text-slate-400">
                {shelfOf(p).map((s) => `${s.size}·${s.quantity}`).join('  ')}
              </span>
              {picked.has(p.id) && (
                <label className="text-xs text-slate-600 inline-flex items-center gap-1">
                  копии
                  <input
                    type="number"
                    min={0}
                    value={copiesOf(p.id)}
                    onChange={(e) => setCounts({ ...counts, [p.id]: Math.max(0, Number(e.target.value) || 0) })}
                    className="w-14 px-1 py-0.5 border border-slate-300 rounded text-right tabular-nums"
                  />
                </label>
              )}
            </div>
          ))}
        </div>
        {labels.length > 0 && <h2 className="mt-6 mb-2 text-sm font-semibold text-slate-700">Преглед</h2>}
      </div>

      {/* The sheet: 50 × 30 mm labels, as many to a row as the paper takes. */}
      <div className="max-w-5xl mx-auto px-4 pb-10 print:p-0 print:max-w-none flex flex-wrap gap-2 print:gap-0">
        {labels.map(({ p, n }) => (
          <div
            key={`${p.id}-${n}`}
            className="bg-white border border-slate-300 print:border-slate-400 flex items-center gap-[2mm] p-[1.5mm] overflow-hidden break-inside-avoid"
            style={{ width: '50mm', height: '30mm' }}
          >
            <QrCode value={sellUrl(p.id)} size="26mm" className="shrink-0" />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="text-[8pt] text-slate-700 line-clamp-3">{getProductDisplayName(p.name, p.category, p.brand)}</p>
              <p className="text-[6pt] text-slate-500 truncate mt-[1mm]">{p.id}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LabelsPage() {
  return (
    <Suspense fallback={null}>
      <LabelsView />
    </Suspense>
  );
}
