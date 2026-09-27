'use client';

/**
 * Old title next to the generated one, for every product (Task 9.6).
 *
 * PREVIEW. The storefront still shows getProductDisplayName() — "Кошули -
 * #BT045" — and will until the owner decides on Task 9.7. Nothing here writes.
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Product, ProductAttributes } from '@/types';
import { getProductDisplayName } from '@/lib/product-display';
import { generateDescription, generateTitles } from '@/lib/product-title';

type Filter = 'all' | 'complete' | 'incomplete' | 'twins';

export default function TitlePreview({ items }: { items: Array<{ p: Product; a: ProductAttributes }> }) {
  const [filter, setFilter] = useState<Filter>('all');

  const titles = useMemo(
    () => generateTitles(items.map(({ p, a }) => ({ id: p.id, category: p.category, attrs: a }))),
    [items],
  );
  const byId = useMemo(() => new Map(items.map((x) => [x.p.id, x.p])), [items]);

  // A twin only counts once the title is complete: with the colour missing,
  // every shirt is "Кошула", and that is a gap, not a collision.
  const stateOf = useMemo(() => {
    const m = new Map<string, Exclude<Filter, 'all'>>();
    for (const [id, t] of titles) m.set(id, t.missing.length ? 'incomplete' : t.twins.length ? 'twins' : 'complete');
    return m;
  }, [titles]);
  const counts = { complete: 0, incomplete: 0, twins: 0 };
  stateOf.forEach((v) => { counts[v] += 1; });

  const shown = items.filter(({ p }) => filter === 'all' || stateOf.get(p.id) === filter);

  return (
    <div>
      <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
        <strong>Само преглед.</strong> Сајтот и понатаму ги прикажува старите наслови. Ништо не се менува додека не одлучиш
        (картичка 9.7). Насловот се составува сам од категоријата, составот, бојата, кројот и деталите — без бренд.
      </div>

      <div className="flex flex-wrap gap-2 mb-3">
        {([
          ['all', `Сите · ${items.length}`],
          ['complete', `Готов наслов · ${counts.complete}`],
          ['incomplete', `Фали податок · ${counts.incomplete}`],
          ['twins', `Ист наслов · ${counts.twins}`],
        ] as Array<[Filter, string]>).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={`px-3 py-1.5 rounded-full text-sm border ${filter === k ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-300'}`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm divide-y divide-slate-100">
        <div className="hidden md:grid grid-cols-[minmax(10rem,0.8fr)_minmax(14rem,1.4fr)_minmax(14rem,1.4fr)] gap-4 px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          <span>Сега на сајтот</span>
          <span>Нов наслов</span>
          <span>Нов опис</span>
        </div>
        {shown.slice(0, 300).map(({ p, a }) => {
          const t = titles.get(p.id)!;
          const desc = generateDescription(p.category, a);
          return (
            <div key={p.id} className="grid grid-cols-1 md:grid-cols-[minmax(10rem,0.8fr)_minmax(14rem,1.4fr)_minmax(14rem,1.4fr)] gap-2 md:gap-4 px-4 py-3">
              <div className="min-w-0">
                <Link href={`/admin/product/${p.id}`} className="text-sm text-slate-500 hover:text-blue-600 truncate block">
                  {getProductDisplayName(p.name, p.category, p.brand)}
                </Link>
              </div>
              <div className="min-w-0">
                <p className={`text-sm font-semibold ${t.missing.length ? 'text-slate-400' : 'text-slate-900'}`}>{t.title}</p>
                {t.missing.length > 0 && (
                  <p className="text-xs text-amber-700 mt-0.5">фали: {t.missing.join(', ')}</p>
                )}
                {!t.missing.length && t.twins.length > 0 && (
                  <p className="text-xs text-rose-700 mt-0.5">
                    ист наслов како {t.twins.map((id) => byId.get(id)?.name || id).join(', ')} — додади шара, детал или материјал
                  </p>
                )}
              </div>
              <div className="min-w-0 text-xs text-slate-600 space-y-0.5">
                {desc.length ? desc.map((l, i) => <p key={i}>{l}</p>) : <p className="text-slate-400">Нема податоци за опис.</p>}
              </div>
            </div>
          );
        })}
        {shown.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-500">Нема производи за овој филтер.</p>}
      </div>
      {shown.length > 300 && <p className="mt-2 text-xs text-slate-500">Прикажани првите 300 од {shown.length}.</p>}
    </div>
  );
}
