'use client';

/**
 * Measurements in centimetres, per size (Task 9.5).
 *
 * Suppliers give none (owner, 2026-09-26), so the garments are measured by
 * hand in the shop. The job is to make that quick:
 *   * only the sizes on the shelf are asked for — the rest can be shown
 *   * only the measures the category has (attributes.ts templates)
 *   * "copy from a similar model" — same internal brand and category, which
 *     usually share a pattern — so only the differences are typed
 *   * the how-to beside every measure, so two people measuring the same shirt
 *     write the same number
 *
 * Values must be 0.1–300 cm: the database refuses anything else (010), and a
 * chest of 540 is millimetres typed by mistake.
 */

import { useMemo, useState } from 'react';
import { Copy, HelpCircle } from 'lucide-react';
import type { Measurements, ProductSize } from '@/types';
import { MEASURES, templateOf } from '@/lib/attributes';

export interface MeasurementSource {
  productId: string;
  label: string;
  measurements: Measurements;
}

const MIN_CM = 0.1;
const MAX_CM = 300;

/** Typed text → centimetres, or undefined for empty. Comma or point, one decimal. */
function parseCm(text: string): number | undefined {
  const t = text.trim().replace(',', '.');
  if (!t) return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? Math.round(n * 10) / 10 : NaN;
}

export function measurementErrors(m: Measurements): string[] {
  const out: string[] = [];
  for (const [size, row] of Object.entries(m)) {
    for (const [k, v] of Object.entries(row)) {
      if (!(v >= MIN_CM && v <= MAX_CM)) out.push(`${size} · ${MEASURES[k]?.label ?? k}: ${v} cm не е можно`);
    }
  }
  return out;
}

export default function MeasurementsEditor({
  category, sizes, value, onChange, sources = [], onLoadSources,
}: {
  category: string;
  sizes: Pick<ProductSize, 'size' | 'quantity'>[];
  value: Measurements;
  onChange: (m: Measurements) => void;
  /** Similar models that already have measurements, best first. */
  sources?: MeasurementSource[];
  /** Called the first time the copy list is opened, for callers that load it lazily. */
  onLoadSources?: () => void;
}) {
  const measures = templateOf(category).measures;
  const [showAll, setShowAll] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [showCopy, setShowCopy] = useState(false);
  // Raw text per cell, so "54," can be typed on the way to "54,5".
  const [draft, setDraft] = useState<Record<string, string>>({});

  const rows = useMemo(() => {
    const all = sizes.map((s) => s.size);
    const onShelf = sizes.filter((s) => Number(s.quantity) >= 1).map((s) => s.size);
    const list = showAll ? all : onShelf;
    // A size measured before but now sold out stays visible, so it can be corrected.
    return [...new Set([...list, ...Object.keys(value).filter((s) => all.includes(s))])];
  }, [sizes, showAll, value]);

  if (measures.length === 0) {
    return <p className="text-xs text-gray-500">Оваа категорија нема мерки.</p>;
  }

  const cellKey = (size: string, m: string) => `${size}\u0000${m}`;

  const setCell = (size: string, m: string, text: string) => {
    setDraft((d) => ({ ...d, [cellKey(size, m)]: text }));
    const cm = parseCm(text);
    const next: Measurements = { ...value, [size]: { ...(value[size] ?? {}) } };
    if (cm === undefined || Number.isNaN(cm)) delete next[size][m];
    else next[size][m] = cm;
    if (Object.keys(next[size]).length === 0) delete next[size];
    onChange(next);
  };

  const copyFrom = (src: MeasurementSource) => {
    const next: Measurements = { ...value };
    for (const size of rows) {
      const from = src.measurements[size];
      if (!from) continue;
      next[size] = { ...(next[size] ?? {}) };
      for (const m of measures) if (from[m] !== undefined) next[size][m] = from[m];
    }
    setDraft({});
    onChange(next);
    setShowCopy(false);
  };

  const errors = measurementErrors(value);
  const filled = rows.filter((s) => value[s] && Object.keys(value[s]).length > 0).length;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <span className="text-gray-600 tabular-nums">Измерени {filled} од {rows.length} големини</span>
        <button type="button" onClick={() => { setShowCopy((v) => !v); if (!showCopy) onLoadSources?.(); }} className="flex items-center gap-1 text-blue-700 hover:underline">
          <Copy className="h-4 w-4" /> копирај од сличен модел
        </button>
        <button type="button" onClick={() => setShowHelp((v) => !v)} className="flex items-center gap-1 text-blue-700 hover:underline">
          <HelpCircle className="h-4 w-4" /> како се мери
        </button>
        <label className="flex items-center gap-1 text-gray-600">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} className="h-3.5 w-3.5" />
          и големините без залиха
        </label>
      </div>

      {showCopy && (
        <div className="rounded-lg border border-gray-200 bg-white p-2">
          {sources.length === 0 ? (
            <p className="text-xs text-gray-500">Нема измерен сличен модел (ист бренд и категорија) уште.</p>
          ) : (
            <ul className="space-y-1">
              {sources.map((s) => (
                <li key={s.productId}>
                  <button type="button" onClick={() => copyFrom(s)} className="w-full text-left text-sm px-2 py-1 rounded hover:bg-blue-50">
                    {s.label} <span className="text-xs text-gray-500">· {Object.keys(s.measurements).join(', ')}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-1 text-[11px] text-gray-500">Се копираат само големините што ги има овој производ. Потоа поправи ја разликата.</p>
        </div>
      )}

      {showHelp && (
        <ul className="rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-1 text-xs text-gray-700">
          {measures.map((m) => (
            <li key={m}><strong>{MEASURES[m]?.label}:</strong> {MEASURES[m]?.howTo}</li>
          ))}
        </ul>
      )}

      {rows.length === 0 ? (
        <p className="text-xs text-gray-500">Нема големини на залиха. Штиклирај „и големините без залиха“ за да ги измериш.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="text-sm">
            <thead>
              <tr>
                <th className="pr-2 text-left text-xs font-medium text-gray-500">cm</th>
                {measures.map((m) => (
                  <th key={m} className="px-1 text-left text-xs font-medium text-gray-600 whitespace-nowrap" title={MEASURES[m]?.howTo}>
                    {MEASURES[m]?.label ?? m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((size) => (
                <tr key={size}>
                  <td className="pr-2 py-1 font-medium text-gray-900 whitespace-nowrap">{size}</td>
                  {measures.map((m) => {
                    const k = cellKey(size, m);
                    const stored = value[size]?.[m];
                    const text = draft[k] ?? (stored === undefined ? '' : String(stored).replace('.', ','));
                    const bad = text.trim() !== '' && (() => { const c = parseCm(text); return c === undefined || Number.isNaN(c) || c < MIN_CM || c > MAX_CM; })();
                    return (
                      <td key={m} className="px-1 py-1">
                        <input
                          inputMode="decimal"
                          value={text}
                          onChange={(e) => setCell(size, m, e.target.value)}
                          className={`w-16 px-2 py-1 border rounded text-sm tabular-nums focus:outline-none focus:ring-2 focus:ring-blue-500 ${bad ? 'border-red-400 bg-red-50' : 'border-gray-300'}`}
                          aria-label={`${size} ${MEASURES[m]?.label ?? m}`}
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {errors.length > 0 && <p className="text-xs text-red-700">{errors.join(' · ')}</p>}
    </div>
  );
}

/**
 * Similar models to copy from, best first: same internal brand and category,
 * then same category. Only rows that hold measurements; most recent first.
 */
export function rankMeasurementSources(
  target: { id: string; brand?: string; category: string },
  candidates: Array<{ id: string; label: string; brand?: string; category: string; measurements: Measurements; updatedAt?: Date }>,
  limit = 6,
): MeasurementSource[] {
  return candidates
    .filter((c) => c.id !== target.id && c.category === target.category && Object.keys(c.measurements).length > 0)
    .sort((a, b) =>
      Number(b.brand === target.brand) - Number(a.brand === target.brand)
      || (b.updatedAt?.getTime() ?? 0) - (a.updatedAt?.getTime() ?? 0))
    .slice(0, limit)
    .map((c) => ({
      productId: c.id,
      label: `${c.label}${c.brand && c.brand === target.brand ? ' · ист бренд' : ''}`,
      measurements: c.measurements,
    }));
}
