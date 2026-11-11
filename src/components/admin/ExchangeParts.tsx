'use client';

/**
 * Pieces of the exchange screen that redeeming a voucher uses too (Tasks 18.1,
 * 18.2): picking new pieces off the shelf and pricing them like at the till.
 */

import { useState } from 'react';
import Image from 'next/image';
import { Plus, Search, Trash2, X } from 'lucide-react';
import type { Product } from '@/types';
import { getEffectivePrice } from '@/lib/pricing';
import { getProductDisplayName } from '@/lib/product-display';
import { matchesSearch, onShelf } from '@/lib/admin-search';
import { mkDen } from '@/lib/mk-format';
import { daysSince } from '@/lib/exchange';
import DiscountBadge, { discountWarning } from '@/components/admin/DiscountBadge';

/** Today in the shop, YYYY-MM-DD. */
export const localDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Skopje' }).format(d);
/** 2026-11-05 → 5.11.2026, without a time zone in between. */
export const dayText = (day: string) => {
  const [y, m, d] = day.slice(0, 10).split('-');
  return `${Number(d)}.${Number(m)}.${y}`;
};
export const sizeOf = (s: { size?: string | null }) => String(s.size ?? '').trim();
export const title = (p: Product) => getProductDisplayName(p.name, p.category, p.brand);
export const pieces = (n: number) => `${n} ${n === 1 ? 'парче' : 'парчиња'}`;
export const ago = (day: string, today: string) => {
  const n = daysSince(day, today);
  return n <= 0 ? 'денес' : n === 1 ? 'вчера' : `пред ${n} дена`;
};

/** A new piece: the product, its size and the price agreed for it (as typed). */
export interface Out { key: number; product: Product; size: string; agreed: string }

/** What is on the shelf of this size: the size's quantity, or the stock of a product without sizes. */
export const shelfOf = (p: Product, size: string) => {
  const sizes = p.sizes ?? [];
  return sizes.length === 0
    ? (size === '' ? Number(p.stock) || 0 : 0)
    : Math.max(0, Number(sizes.find((s) => sizeOf(s) === size)?.quantity) || 0);
};

/** A new piece at the price on its tag today, editable. */
export const newOut = (key: number, product: Product, size: string): Out => ({ key, product, size, agreed: String(getEffectivePrice(product)) });

export function AddButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-dashed border-slate-300 rounded-lg text-sm text-slate-600 hover:border-blue-500 hover:text-blue-700"
    >
      <Plus className="h-4 w-4" /> {children}
    </button>
  );
}

export function Thumb({ p }: { p: Product }) {
  return (
    <div className="relative w-10 h-12 rounded-md overflow-hidden bg-slate-100 shrink-0">
      {p.imageUrl && <Image src={p.imageUrl} alt="" fill className="object-cover" sizes="40px" />}
    </div>
  );
}

export function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
  return (
    <div className="relative mb-2">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
      <input
        autoFocus
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm"
      />
    </div>
  );
}

export function PickerFrame({ heading, onClose, children }: { heading: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-slate-800">{heading}</p>
        <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700" aria-label="Затвори"><X className="h-4 w-4" /></button>
      </div>
      {children}
    </div>
  );
}

/** The new pieces picked so far, each priced like at the till. */
export function OutList({ out, onChange }: { out: Out[]; onChange: (update: (list: Out[]) => Out[]) => void }) {
  if (out.length === 0) return null;
  return (
    <ul className="divide-y divide-slate-100 mb-3">
      {out.map((o) => {
        const price = Number(o.agreed) || 0;
        const warning = discountWarning(o.product, price);
        return (
          <li key={o.key} className="flex items-start gap-3 py-2">
            <Thumb p={o.product} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 truncate">{title(o.product)}</p>
              <p className="text-xs text-slate-500 flex flex-wrap items-center gap-1.5">
                {o.size || '—'} <DiscountBadge product={o.product} />
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                <input
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step="1"
                  value={o.agreed}
                  onChange={(e) => onChange((list) => list.map((x) => (x.key === o.key ? { ...x, agreed: e.target.value } : x)))}
                  className={`w-28 px-2 py-1 border rounded text-right tabular-nums ${price > 0 ? 'border-slate-300' : 'border-red-400 bg-red-50'}`}
                  aria-label="Цена"
                />
                <span className="text-slate-400">ден.</span>
                {price !== o.product.price && (
                  <span className="text-[11px] text-slate-400 tabular-nums">на етикета {mkDen(o.product.price)}</span>
                )}
              </div>
              {warning && <p className="mt-1 text-xs text-amber-700">{warning}</p>}
            </div>
            <button
              onClick={() => onChange((list) => list.filter((x) => x.key !== o.key))}
              className="p-2 text-slate-400 hover:text-red-600"
              aria-label="Тргни"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** A new piece: a product on the shelf and its size. */
export function OutPicker({
  products, available, onPick, onClose,
}: {
  products: Product[];
  available: (p: Product, size: string) => number;
  onPick: (p: Product, size: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const hits = q.trim() ? products.filter((p) => onShelf(p) && matchesSearch(p, q)).slice(0, 10) : [];
  return (
    <PickerFrame heading="Ново парче од залиха" onClose={onClose}>
      <SearchBox value={q} onChange={setQ} placeholder="Шифра или име" />
      <ul className="space-y-2">
        {hits.map((p) => {
          const sizes = (p.sizes ?? []).map((s) => sizeOf(s)).filter((s, i, all) => all.indexOf(s) === i);
          return (
            <li key={p.id} className="bg-white rounded-lg border border-slate-200 p-2">
              <div className="flex items-center gap-2 mb-1.5">
                <Thumb p={p} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-900 truncate">{title(p)}</p>
                  <p className="text-[11px] text-slate-500 flex flex-wrap items-center gap-1.5">
                    {mkDen(getEffectivePrice(p))} <DiscountBadge product={p} />
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {sizes.length === 0 ? (
                  <button
                    onClick={() => onPick(p, '')}
                    disabled={available(p, '') < 1}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm hover:bg-blue-50 disabled:opacity-40"
                  >
                    Додај ({available(p, '')})
                  </button>
                ) : sizes.map((s) => {
                  const n = available(p, s);
                  return (
                    <button
                      key={s}
                      onClick={() => onPick(p, s)}
                      disabled={n < 1}
                      className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm tabular-nums hover:bg-blue-50 disabled:opacity-40"
                    >
                      {s || '—'} <span className="text-[11px] text-slate-500">({Math.max(0, n)})</span>
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
      {q.trim() && hits.length === 0 && (
        <p className="text-sm text-slate-500 py-3 text-center">Нема такво парче на залиха.</p>
      )}
    </PickerFrame>
  );
}

/** What came back and what went out, as an exchange keeps it. */
export function ExchangeLines({ returned, given, backWord = 'врати' }: {
  returned: { name: string; size: string; price: number }[];
  given: { name: string; size: string; price: number; agreed: number }[];
  backWord?: string;
}) {
  return (
    <div className="mt-2 text-sm space-y-0.5">
      {returned.map((p, i) => (
        <p key={'r' + i} className="text-slate-600">
          <span className="text-slate-400">← {backWord} </span>{p.name}{p.size ? ` ${p.size}` : ''} · {mkDen(p.price)}
        </p>
      ))}
      {given.map((p, i) => (
        <p key={'g' + i} className="text-slate-900">
          <span className="text-slate-400">→ зеде </span>{p.name}{p.size ? ` ${p.size}` : ''} · {mkDen(p.price)}
          {p.price !== p.agreed && <span className="text-[11px] text-slate-400"> (цена {mkDen(p.agreed)})</span>}
        </p>
      ))}
    </div>
  );
}
