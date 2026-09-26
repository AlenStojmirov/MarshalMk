'use client';

/**
 * Inputs for product_attributes (Task 9.4), shared by the product form and the
 * /admin/catalog screen so both offer the same words and the same checks.
 * Vocabulary: src/lib/attributes.ts.
 */

import { useState } from 'react';
import { Plus, Trash, ClipboardPaste } from 'lucide-react';
import type { FiberShare, SizeAdvice } from '@/types';
import {
  COLORS, COLOR_FAMILIES, COMPOSITION_PRESETS, DETAIL_FIELDS, FIBERS, FITS, PATTERNS, SIZE_ADVICE,
  templateOf, validateComposition,
} from '@/lib/attributes';
import { parseDescription } from '@/lib/parse-description';

const inputCls = 'px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

// ---------------------------------------------------------------------------
// Composition
// ---------------------------------------------------------------------------

export function CompositionEditor({ value, onChange }: { value: FiberShare[]; onChange: (v: FiberShare[]) => void }) {
  const [pasting, setPasting] = useState(false);
  const [pasted, setPasted] = useState('');
  const [pasteNote, setPasteNote] = useState<string | null>(null);
  const sum = value.reduce((s, f) => s + (Number(f.pct) || 0), 0);
  const errors = validateComposition(value);
  const used = new Set(value.map((f) => f.fiber));

  const setRow = (i: number, patch: Partial<FiberShare>) =>
    onChange(value.map((f, j) => (j === i ? { ...f, ...patch } : f)));

  const addRow = () => {
    const next = Object.keys(FIBERS).find((k) => !used.has(k)) ?? 'cotton';
    onChange([...value, { fiber: next, pct: Math.max(0, 100 - sum) }]);
  };

  const readPasted = () => {
    const p = parseDescription(pasted);
    if (p.composition.length) {
      onChange(p.composition);
      setPasteNote(p.unparsed.length ? `Непрочитано: ${p.unparsed.join('; ')}` : null);
      setPasted('');
      setPasting(false);
    } else {
      setPasteNote(p.compositionErrors[0] ?? 'Не е пронајден состав. Пример: „98% памук / 2% еластин“.');
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {COMPOSITION_PRESETS.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={() => onChange(p.composition.map((f) => ({ ...f })))}
            className="px-2 py-1 text-xs rounded-full border border-gray-300 text-gray-700 hover:bg-blue-50 hover:border-blue-400"
          >
            {p.label}
          </button>
        ))}
      </div>

      {value.map((f, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={100}
            step="0.5"
            value={f.pct}
            onChange={(e) => setRow(i, { pct: Number(e.target.value) })}
            className={`${inputCls} w-20 tabular-nums`}
            aria-label="Процент"
          />
          <span className="text-sm text-gray-500">%</span>
          <select value={f.fiber} onChange={(e) => setRow(i, { fiber: e.target.value })} className={`${inputCls} flex-1`}>
            {Object.entries(FIBERS).map(([k, fib]) => (
              <option key={k} value={k} disabled={k !== f.fiber && used.has(k)}>{fib.mk}</option>
            ))}
          </select>
          <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} className="p-1 text-gray-400 hover:text-red-600" title="Отстрани">
            <Trash className="h-4 w-4" />
          </button>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={addRow} className="flex items-center gap-1 text-sm text-blue-700 hover:underline">
          <Plus className="h-4 w-4" /> влакно
        </button>
        <button type="button" onClick={() => setPasting((v) => !v)} className="flex items-center gap-1 text-sm text-blue-700 hover:underline">
          <ClipboardPaste className="h-4 w-4" /> залепи од етикета
        </button>
        {value.length > 0 && (
          <span className={`text-sm font-medium tabular-nums ${errors.length ? 'text-red-700' : 'text-green-700'}`}>
            Збир: {sum}%
          </span>
        )}
      </div>

      {pasting && (
        <div className="flex gap-2">
          <input
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), readPasted())}
            placeholder="98% памук / 2% еластин"
            className={`${inputCls} flex-1`}
          />
          <button type="button" onClick={readPasted} className="px-3 py-1.5 text-sm bg-gray-100 rounded-lg hover:bg-gray-200">Прочитај</button>
        </div>
      )}
      {pasteNote && <p className="text-xs text-amber-700">{pasteNote}</p>}
      {value.length > 0 && errors.length > 0 && <p className="text-xs text-red-700">{errors.join(' · ')}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

/** Swatches grouped by family: quick to click in the form. */
export function ColorSwatches({ value, onChange }: { value?: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(COLORS).map(([k, c]) => (
          <button
            key={k}
            type="button"
            onClick={() => onChange(value === k ? '' : k)}
            title={c.mk}
            aria-label={c.mk}
            aria-pressed={value === k}
            className={`h-7 w-7 rounded-full border ${value === k ? 'ring-2 ring-offset-1 ring-blue-600 border-blue-600' : 'border-gray-300'}`}
            style={{ background: k === 'multi' ? 'conic-gradient(#c0392b, #e8c547, #2e7d4f, #2f5fb3, #7d3c98, #c0392b)' : c.hex }}
          />
        ))}
      </div>
      <p className="text-xs text-gray-500">{value && COLORS[value] ? COLORS[value].mk : 'Не е избрана'}</p>
    </div>
  );
}

/** Compact, for a table row. */
export function ColorSelect({ value, onChange, className = '' }: { value?: string; onChange: (v: string) => void; className?: string }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={`${inputCls} ${className}`}>
      <option value="">— боја —</option>
      {Object.entries(COLOR_FAMILIES).map(([fk, fam]) => (
        <optgroup key={fk} label={fam.mk}>
          {Object.entries(COLORS).filter(([, c]) => c.family === fk).map(([k, c]) => (
            <option key={k} value={k}>{c.mk}</option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Pattern, fit, size advice
// ---------------------------------------------------------------------------

export function PatternSelect({ value, onChange, className = '' }: { value?: string; onChange: (v: string) => void; className?: string }) {
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={`${inputCls} ${className}`}>
      <option value="">— шара —</option>
      {Object.entries(PATTERNS).map(([k, p]) => <option key={k} value={k}>{p.mk}</option>)}
    </select>
  );
}

export function FitSelect({ category, value, onChange, className = '' }: { category: string; value?: string; onChange: (v: string) => void; className?: string }) {
  const fits = templateOf(category).fits;
  if (fits.length === 0) return <span className="text-xs text-gray-400">—</span>;
  return (
    <select value={value ?? ''} onChange={(e) => onChange(e.target.value)} className={`${inputCls} ${className}`}>
      <option value="">— крој —</option>
      {fits.map((k) => <option key={k} value={k}>{FITS[k]?.mk ?? k}</option>)}
    </select>
  );
}

export function SizeAdviceButtons({ value, onChange, compact = false }: { value?: SizeAdvice; onChange: (v: SizeAdvice | '') => void; compact?: boolean }) {
  return (
    <div className="inline-flex rounded-lg border border-gray-300 overflow-hidden">
      {(Object.keys(SIZE_ADVICE) as SizeAdvice[]).map((k) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(value === k ? '' : k)}
          aria-pressed={value === k}
          title={SIZE_ADVICE[k].hint}
          className={`px-2 py-1 text-xs border-r last:border-r-0 border-gray-300 ${value === k ? 'bg-blue-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
        >
          {compact ? { true: 'точно', larger: '+1', smaller: '−1' }[k] : SIZE_ADVICE[k].mk}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Per-category details
// ---------------------------------------------------------------------------

export function DetailsEditor({
  category, value, onChange,
}: { category: string; value: Record<string, string | number | boolean>; onChange: (v: Record<string, string | number | boolean>) => void }) {
  const fields = templateOf(category).details;
  const set = (k: string, v: string | boolean) => {
    const next = { ...value };
    if (v === '' || v === false) delete next[k];
    else next[k] = v;
    onChange(next);
  };
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {fields.map((k) => {
        const f = DETAIL_FIELDS[k];
        if (!f) return null;
        return f.options ? (
          <label key={k} className="block">
            <span className="block text-xs font-medium text-gray-600 mb-1">{f.label}</span>
            <select value={String(value[k] ?? '')} onChange={(e) => set(k, e.target.value)} className={`${inputCls} w-full`}>
              <option value="">—</option>
              {Object.entries(f.options).map(([ok, ol]) => <option key={ok} value={ok}>{ol}</option>)}
            </select>
          </label>
        ) : (
          <label key={k} className="flex items-center gap-2 pt-5">
            <input type="checkbox" checked={value[k] === true} onChange={(e) => set(k, e.target.checked)} className="h-4 w-4" />
            <span className="text-sm text-gray-700">{f.label}</span>
          </label>
        );
      })}
    </div>
  );
}
