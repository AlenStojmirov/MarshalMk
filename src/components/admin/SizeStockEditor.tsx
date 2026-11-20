'use client';

/**
 * Sizes and the pieces on the shelf, in the product form (owner, 2026-11-20).
 *
 * The list is always in the one order (S, M, L … XXXXXXL, then 30, 31 …;
 * `sortShelf` in sizes.ts): a size added later lands in its place, never at
 * the end. A whole series is one click (D-029: tops come S–XXL, jeans 30–38),
 * one piece of each. Only canonical labels go in (9.8).
 */

import { useState } from 'react';
import { Minus, Plus, X } from 'lucide-react';
import type { ProductSize } from '@/types';
import { SIZE_PRESETS, canonicalSize, sizeLabel, sortShelf, storedCanonicalLabel } from '@/lib/sizes';
import { inputClass } from './ProductFormParts';

/** The runs the shop buys in (series.ts, D-029). */
export const SIZE_SERIES: ReadonlyArray<{ label: string; sizes: readonly string[] }> = [
  { label: 'S–XXL', sizes: ['S', 'M', 'L', 'XL', 'XXL'] },
  { label: 'M–XXXL', sizes: ['M', 'L', 'XL', 'XXL', 'XXXL'] },
  { label: '30–38', sizes: ['30', '31', '32', '33', '34', '36', '38'] },
  { label: '46–56', sizes: ['46', '48', '50', '52', '54', '56'] },
];

/** A label the way the shelf keeps it: canonical (2xl → XXL), letters upper case. */
export function shelfLabel(raw: string): string {
  const typed = storedCanonicalLabel(raw);
  return /^[a-z]+$/i.test(typed) ? typed.toUpperCase() : typed;
}

export default function SizeStockEditor({
  sizes, onChange, editing,
}: { sizes: ProductSize[]; onChange: (s: ProductSize[]) => void; editing: boolean }) {
  const [other, setOther] = useState('');
  const [note, setNote] = useState<string | null>(null);

  const find = (label: string) => sizes.find((s) => canonicalSize(s.size) === canonicalSize(label));
  const total = sizes.reduce((a, s) => a + (Number(s.quantity) || 0), 0);

  const add = (labels: readonly string[], quantity = 1) => {
    const next = [...sizes];
    const already: string[] = [];
    for (const raw of labels) {
      const label = shelfLabel(raw);
      if (!label) continue;
      const there = next.find((s) => canonicalSize(s.size) === canonicalSize(label));
      if (there) { already.push(there.size === label ? label : `${label} (= ${there.size})`); continue; }
      next.push({ size: label, quantity });
    }
    setNote(already.length && labels.length === 1 ? `${already.join(', ')} веќе е во листата.` : null);
    onChange(sortShelf(next));
  };

  const setQty = (size: string, q: number) =>
    onChange(sizes.map((s) => (s.size === size ? { ...s, quantity: Math.max(0, Math.floor(q) || 0) } : s)));

  const remove = (size: string) => {
    const s = sizes.find((x) => x.size === size);
    if (s && s.quantity > 0 && !window.confirm(`Големината ${size} има ${s.quantity} ${s.quantity === 1 ? 'парче' : 'парчиња'} на полица. Да се отстрани?`)) return;
    onChange(sizes.filter((x) => x.size !== size));
  };

  return (
    <div className="space-y-4">
      {sizes.length > 0 ? (
        <div>
          <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 lg:grid-cols-3">
            {sizes.map((s) => {
              const alias = sizeLabel(s.size) !== s.size ? sizeLabel(s.size) : null;
              return (
                <div
                  key={s.size}
                  className={`flex items-center gap-2 rounded-lg border px-2.5 py-1.5 ${s.quantity > 0 ? 'border-slate-300 bg-white' : 'border-dashed border-slate-300 bg-slate-50'}`}
                >
                  <span className="min-w-[3.5rem] text-sm font-semibold text-slate-900">
                    {s.size}
                    {alias && <span className="ml-1 text-[11px] font-normal text-slate-400" title="Истата големина под канонско име">= {alias}</span>}
                  </span>
                  <div className="ml-auto flex items-center">
                    <button
                      type="button"
                      aria-label={`${s.size}: едно помалку`}
                      disabled={s.quantity <= 0}
                      onClick={() => setQty(s.size, s.quantity - 1)}
                      className="flex h-8 w-8 items-center justify-center rounded-l-lg border border-slate-300 text-slate-600 hover:bg-slate-100 disabled:opacity-30"
                    >
                      <Minus className="h-3.5 w-3.5" />
                    </button>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      aria-label={`${s.size}: парчиња`}
                      value={s.quantity}
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => setQty(s.size, parseInt(e.target.value, 10) || 0)}
                      className="h-8 w-12 border-y border-slate-300 text-center text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                    />
                    <button
                      type="button"
                      aria-label={`${s.size}: едно повеќе`}
                      onClick={() => setQty(s.size, s.quantity + 1)}
                      className="flex h-8 w-8 items-center justify-center rounded-r-lg border border-slate-300 text-slate-600 hover:bg-slate-100"
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <button
                    type="button"
                    title="Отстрани ја големината"
                    aria-label={`Отстрани ${s.size}`}
                    onClick={() => remove(s.size)}
                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-sm text-slate-600">
            Вкупно на полица: <strong className="tabular-nums text-slate-900">{total}</strong> {total === 1 ? 'парче' : 'парчиња'} во {sizes.length} {sizes.length === 1 ? 'големина' : 'големини'}
          </p>
        </div>
      ) : (
        <p className="rounded-lg border border-dashed border-slate-300 p-4 text-sm text-slate-500">
          Уште нема големини. Додај цела серија или кликни на големините подолу.
        </p>
      )}

      <div className="space-y-2 rounded-lg bg-slate-50 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-full text-xs font-medium text-slate-500 sm:w-28">Цела серија</span>
          {SIZE_SERIES.map((series) => {
            const complete = series.sizes.every((l) => find(l));
            return (
              <button
                key={series.label}
                type="button"
                disabled={complete}
                onClick={() => add(series.sizes)}
                title={`По едно парче: ${series.sizes.join(', ')}`}
                className="rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:border-blue-500 hover:text-blue-700 disabled:cursor-default disabled:opacity-40"
              >
                + {series.label}
              </button>
            );
          })}
        </div>
        {SIZE_PRESETS.map((group) => (
          <div key={group.label} className="flex flex-wrap items-center gap-1.5">
            <span className="w-full text-xs font-medium text-slate-500 sm:w-28">{group.label}</span>
            {group.sizes.map((label) => {
              const there = find(label);
              return (
                <button
                  key={label}
                  type="button"
                  aria-pressed={!!there}
                  onClick={() => (there ? remove(there.size) : add([label]))}
                  title={there ? 'Кликни за да ја отстраниш' : 'Додај (1 парче)'}
                  className={`min-w-[2.5rem] rounded-md border px-2 py-1 text-xs font-medium ${there ? 'border-blue-600 bg-blue-600 text-white hover:bg-blue-700' : 'border-slate-300 bg-white text-slate-700 hover:border-blue-500 hover:text-blue-700'}`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        ))}
        <div className="flex gap-2 pt-1">
          <input
            type="text"
            value={other}
            onChange={(e) => setOther(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add([other]); setOther(''); } }}
            placeholder="Друга големина (на пр. 1200ml)"
            className={inputClass}
          />
          <button
            type="button"
            onClick={() => { add([other]); setOther(''); }}
            className="flex shrink-0 items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-100"
          >
            <Plus className="h-4 w-4" /> Додај
          </button>
        </div>
        {note && <p className="text-xs text-amber-700">{note}</p>}
      </div>

      {editing && (
        <p className="text-xs text-slate-500">
          Количините се попис: се запишуваат само ако ги смениш, и само ако на полицата ништо не се сменило (продажба, нарачка) додека формата е отворена.
        </p>
      )}
    </div>
  );
}
