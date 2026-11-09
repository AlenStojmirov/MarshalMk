'use client';

/**
 * One product in a stock count (Task 17.2): the numbers the system holds, size
 * by size, each kept as it is or corrected to what is on the shelf.
 *
 * The numbers are read fresh when the panel opens: the shelf plus what open
 * orders still hold in the shop (a reserved piece is gone from the shelf
 * numbers but not yet from the shop). Saving checks the shelf has not moved
 * since; if it has, the numbers are read again and the counter looks again.
 */

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import { Check, Loader2, Minus, Plus, X } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Product } from '@/types';
import { getProductDisplayName } from '@/lib/product-display';
import {
  countDiff, expectedOnShelf, heldByOrders, lineStatus,
  type CountLine, type CountSize, type Held,
} from '@/lib/stock-count';
import { CountError, fetchHoldingOrders, readShelf, recordCount, type Shelf } from '@/lib/stock-count-db';

const sizeLabel = (s: string) => s || 'Без големина';

export function countWhen(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()}.${d.getMonth() + 1}. во ${hh}:${mm}`;
}

/** The shelf, fresh, and what open orders hold of the product. */
async function readCountBasis(sb: SupabaseClient, productId: string): Promise<{ shelf: Shelf; held: Map<string, Held> }> {
  const [shelf, orders] = await Promise.all([readShelf(sb, productId), fetchHoldingOrders(sb)]);
  if (!shelf) throw new Error('Производот не постои (можеби е избришан).');
  return { shelf, held: heldByOrders(productId, orders) };
}

export const sizesText = (list: CountSize[] | null | undefined) =>
  (list ?? []).map((s) => `${s.size || '—'}·${s.quantity}`).join('  ') || '—';

export default function StockCountPanel({
  sb,
  countId,
  product,
  line,
  onSaved,
  onClose,
}: {
  sb: SupabaseClient;
  countId: number;
  product: Product;
  line: CountLine | null;
  onSaved: (line: CountLine) => void;
  onClose: () => void;
}) {
  const [shelf, setShelf] = useState<Shelf | null>(null);
  const [held, setHeld] = useState<Map<string, Held>>(new Map());
  const [values, setValues] = useState<Record<string, number>>({});
  const [added, setAdded] = useState<string[]>([]);
  const [newSize, setNewSize] = useState('');
  const [adding, setAdding] = useState(false);
  const status = line ? lineStatus(line) : 'pending';
  const resolved = status === 'applied' || status === 'dismissed';
  const [loading, setLoading] = useState(!resolved);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Every number starts as the system's: confirming is one tap.
  const take = ({ shelf: s, held: h }: { shelf: Shelf; held: Map<string, Held> }) => {
    setShelf(s);
    setHeld(h);
    setValues(Object.fromEntries(expectedOnShelf(s.sizes, s.stock, h).map((x) => [x.size, x.quantity])));
    setAdded([]);
    setLoading(false);
  };
  const fail = (err: unknown) => {
    setError(err instanceof Error ? err.message : String(err));
    setLoading(false);
  };

  useEffect(() => {
    if (resolved) return;
    let live = true;
    readCountBasis(sb, product.id).then((r) => live && take(r), (err) => live && fail(err));
    return () => { live = false; };
  }, [sb, product.id, resolved]);

  const expected = useMemo(
    () => (shelf ? expectedOnShelf(shelf.sizes, shelf.stock, held) : []),
    [shelf, held],
  );
  const rows = useMemo(
    () => [...expected, ...added.map((size) => ({ size, quantity: 0 }))],
    [expected, added],
  );
  const counted: CountSize[] = rows.map((r) => ({ size: r.size, quantity: values[r.size] ?? r.quantity }));
  const changes = rows.filter((r) => (values[r.size] ?? r.quantity) !== r.quantity).length;

  const set = (size: string, n: number) => setValues((v) => ({ ...v, [size]: Math.max(0, Math.min(999, Math.trunc(n) || 0)) }));

  const addSize = () => {
    const s = newSize.trim();
    if (!s || rows.some((r) => r.size.toLowerCase() === s.toLowerCase())) return;
    setAdded((a) => [...a, s]);
    setValues((v) => ({ ...v, [s]: 1 }));
    setNewSize('');
    setAdding(false);
  };

  const save = async () => {
    if (!shelf || saving) return;
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await recordCount(sb, countId, product.id, shelf.updatedAt, expected, counted);
      onSaved(saved);
    } catch (err) {
      if (err instanceof CountError && err.hint === 'stale') {
        setLoading(true);
        await readCountBasis(sb, product.id).then(take, fail);
        setMessage(err.message);
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white z-10 flex items-start gap-3 p-4 border-b border-slate-100">
          <div className="relative w-16 h-20 rounded-lg overflow-hidden bg-slate-100 shrink-0">
            {product.imageUrl && <Image src={product.imageUrl} alt="" fill className="object-cover" sizes="64px" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-slate-900 leading-tight">
              {getProductDisplayName(product.name, product.category, product.brand)}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">{product.name}</p>
            <p className="text-[11px] text-slate-400 truncate">{product.id}</p>
            {line && !line.listed && (
              <p className="text-[11px] text-blue-700 mt-0.5">Најдено надвор од листата</p>
            )}
          </div>
          <button onClick={onClose} className="p-2 -m-1 rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Затвори">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4">
          {resolved && line ? (
            <div>
              <p className="text-sm text-slate-700 mb-3">
                {status === 'applied'
                  ? 'Разликата е применета во залихата.'
                  : 'Админот одлучи залихата да остане како што беше.'}{' '}
                Не може повторно да се брои.
              </p>
              <DiffTable line={line} />
            </div>
          ) : loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600" />
            </div>
          ) : (
            <>
              {line?.countedAt && (
                <p className="text-xs text-slate-500 mb-3">
                  Веќе попишано {countWhen(line.countedAt)}{line.countedBy ? ` (${line.countedBy})` : ''}: {sizesText(line.counted)}.
                  Ново броење го заменува.
                </p>
              )}
              {message && (
                <p className="mb-3 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900">{message}</p>
              )}

              <div className="grid grid-cols-[1fr_auto] gap-x-3 text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1 px-1">
                <span>Големина · во системот</span>
                <span className="text-right pr-1">На полица</span>
              </div>
              <ul className="space-y-2">
                {rows.map((r) => {
                  const v = values[r.size] ?? r.quantity;
                  const change = v - r.quantity;
                  const h = held.get(r.size);
                  return (
                    <li
                      key={r.size || '∅'}
                      className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${
                        change !== 0 ? 'border-amber-300 bg-amber-50' : 'border-slate-200'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-slate-900">{sizeLabel(r.size)}</p>
                        <p className="text-xs text-slate-500">
                          во системот <span className="font-semibold tabular-nums">{r.quantity}</span>
                          {change !== 0 && (
                            <span className="ml-2 font-semibold text-amber-800 tabular-nums">
                              {change > 0 ? `+${change}` : change}
                            </span>
                          )}
                        </p>
                        {h && h.quantity > 0 && (
                          <p className="text-[11px] text-blue-700">
                            од нив {h.quantity} во нарачка {h.orders.join(', ')}: брои ги и ако се спакувани
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => set(r.size, v - 1)}
                          disabled={v <= 0}
                          className="h-11 w-11 flex items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 disabled:opacity-30"
                          aria-label={`Помалку ${sizeLabel(r.size)}`}
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={999}
                          value={v}
                          onChange={(e) => set(r.size, Number(e.target.value))}
                          onFocus={(e) => e.target.select()}
                          className="h-11 w-14 rounded-lg border border-slate-300 text-center text-lg font-semibold tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500"
                          aria-label={`На полица ${sizeLabel(r.size)}`}
                        />
                        <button
                          type="button"
                          onClick={() => set(r.size, v + 1)}
                          className="h-11 w-11 flex items-center justify-center rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50"
                          aria-label={`Повеќе ${sizeLabel(r.size)}`}
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {(shelf?.sizes.length ?? 0) > 0 && (
                adding ? (
                  <div className="mt-3 flex gap-2">
                    <input
                      autoFocus
                      value={newSize}
                      onChange={(e) => setNewSize(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addSize()}
                      maxLength={20}
                      placeholder="на пр. XXL или 36"
                      className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
                    />
                    <button onClick={addSize} className="px-3 py-2 rounded-lg bg-slate-800 text-white text-sm">Додај</button>
                  </div>
                ) : (
                  <button onClick={() => setAdding(true)} className="mt-3 text-xs text-blue-700 hover:underline">
                    + Големина што ја нема во системот
                  </button>
                )
              )}

              {error && <p className="mt-3 text-sm text-red-700">{error}</p>}

              <button
                onClick={save}
                disabled={saving || !shelf}
                className={`mt-4 w-full h-12 rounded-xl font-semibold text-white flex items-center justify-center gap-2 disabled:opacity-50 ${
                  changes === 0 ? 'bg-green-600 hover:bg-green-700' : 'bg-amber-600 hover:bg-amber-700'
                }`}
              >
                {saving ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : changes === 0 ? (
                  <><Check className="h-5 w-5" /> Сè е точно</>
                ) : (
                  <>Зачувај · {changes === 1 ? '1 големина не се совпаѓа' : `${changes} големини не се совпаѓаат`}</>
                )}
              </button>
              <p className="mt-2 text-[11px] text-slate-400 text-center">
                Залихата не се менува: разликата ја гледа админот и одлучува.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

/** Size by size: the system, the count, the difference. */
export function DiffTable({ line }: { line: CountLine }) {
  const diff = countDiff(line.expected, line.counted);
  return (
    <table className="w-full text-sm tabular-nums">
      <thead>
        <tr className="text-[11px] text-slate-500 uppercase tracking-wide">
          <th className="text-left font-medium py-1">Големина</th>
          <th className="text-right font-medium py-1">Систем</th>
          <th className="text-right font-medium py-1">Попишано</th>
          <th className="text-right font-medium py-1">Разлика</th>
        </tr>
      </thead>
      <tbody>
        {diff.map((d) => (
          <tr key={d.size || '∅'} className={d.change !== 0 ? 'text-slate-900 font-semibold' : 'text-slate-400'}>
            <td className="py-0.5">{d.size || '—'}</td>
            <td className="text-right">{d.expected}</td>
            <td className="text-right">{d.counted}</td>
            <td className={`text-right ${d.change < 0 ? 'text-red-700' : d.change > 0 ? 'text-blue-700' : ''}`}>
              {d.change === 0 ? '·' : d.change > 0 ? `+${d.change}` : d.change}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
