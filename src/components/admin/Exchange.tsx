'use client';

/**
 * Замена: the exchange screen (Task 18.1, D-047, migration 025).
 *
 * 1. What the customer brings back: the product, then the sale it was (day,
 *    size, price) from its `sold[]`. More pieces may come back, all from one
 *    purchase, because the new ones are sold on that day.
 * 2. What they take instead: pieces on the shelf, each at today's price,
 *    which can be changed like at the till.
 * 3. The top-up: what the new pieces cost over what was paid. Nothing is paid
 *    back; when they cost less the screen says so before it is written.
 *
 * Writing it is one call (`makeExchange` → `exchange_make`): the shelf,
 * `sold[]` and the ledger move together or not at all. The admin can undo an
 * exchange from the list below while its pieces have not moved on.
 *
 * A scanned label's sale screen links here with ?return={product}.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft, ArrowLeftRight, Check, Loader2, Plus, Search, Trash2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useProducts } from '@/hooks/useProducts';
import type { NonSaleReason, Product, SoldItem } from '@/types';
import { getEffectivePrice } from '@/lib/pricing';
import { getProductDisplayName } from '@/lib/product-display';
import { matchesSearch, onShelf } from '@/lib/admin-search';
import { mkDen } from '@/lib/mk-format';
import { FIREBASE_SYNC_LIVE } from '@/lib/stock-count';
import {
  NOT_EXCHANGED, bookExchange, daysSince, firebaseSteps, saleKey,
  type Booking, type Exchange,
} from '@/lib/exchange';
import { fetchExchanges, type ExchangeList } from '@/lib/exchange-db';
import { makeExchange, undoExchange } from '@/lib/stock';
import DiscountBadge, { discountWarning } from '@/components/admin/DiscountBadge';
import { countWhen } from '@/components/admin/StockCountPanel';

const localDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Skopje' }).format(d);
/** 2026-11-05 → 5.11.2026, without a time zone in between. */
const dayText = (day: string) => {
  const [y, m, d] = day.slice(0, 10).split('-');
  return `${Number(d)}.${Number(m)}.${y}`;
};
const dayOf = (s: SoldItem) => String(s.soldDate).slice(0, 10);
const lastSale = (p: Product) => (p.sold ?? []).reduce((m, s) => (dayOf(s) > m ? dayOf(s) : m), '');
const sizeOf = (s: { size?: string | null }) => String(s.size ?? '').trim();
const title = (p: Product) => getProductDisplayName(p.name, p.category, p.brand);
const pieces = (n: number) => `${n} ${n === 1 ? 'парче' : 'парчиња'}`;
const ago = (day: string, today: string) => {
  const n = daysSince(day, today);
  return n <= 0 ? 'денес' : n === 1 ? 'вчера' : `пред ${n} дена`;
};

const REASON: Record<NonSaleReason, string> = { giveaway: 'подарок', personal: 'лично', writeoff: 'отпис' };

/** A returned piece: the product and the sale it was. */
interface Back { key: number; product: Product; sale: SoldItem }
/** A new piece: the product, its size and the price agreed for it (as typed). */
interface Out { key: number; product: Product; size: string; agreed: string }

export default function ExchangeScreen() {
  const { role, isAdmin } = useAuth();
  const search = useSearchParams();
  const { products, loading, refetch } = useProducts();
  const [today] = useState(() => localDay(new Date()));
  const [back, setBack] = useState<Back[]>([]);
  const [out, setOut] = useState<Out[]>([]);
  const [note, setNote] = useState('');
  // A scanned label opens the screen on the piece coming back.
  const [returnId] = useState(() => search.get('return'));
  const [picking, setPicking] = useState<null | 'back' | 'out'>(() => (search.get('return') ? 'back' : null));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<Exchange | null>(null);
  const [history, setHistory] = useState<ExchangeList | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const nextKey = useRef(0);

  useEffect(() => {
    if (!role) return;
    let live = true;
    fetchExchanges(supabase).then(
      (h) => { if (live) { setHistory(h); setHistoryError(null); } },
      (err) => {
        if (!live) return;
        setHistory({ missing: false, list: [] });
        setHistoryError(err instanceof Error ? err.message : String(err));
      },
    );
    return () => { live = false; };
  }, [role, version]);

  const candidates = useMemo(() => products.filter((p) => !NOT_EXCHANGED.has(p.category)), [products]);
  const day = back[0] ? dayOf(back[0].sale) : null;
  const booking = useMemo(
    () => bookExchange(back.map((b) => Number(b.sale.price) || 0), out.map((o) => Number(o.agreed) || 0)),
    [back, out],
  );
  const badPrice = out.some((o) => !(Number(o.agreed) > 0));

  /** Sales of this product with this key not yet picked. */
  const unpicked = (p: Product, s: SoldItem) => {
    const k = saleKey(s.size, s.price, s.soldDate);
    const all = (p.sold ?? []).filter((x) => saleKey(x.size, x.price, x.soldDate) === k).length;
    const taken = back.filter((b) => b.product.id === p.id && saleKey(b.sale.size, b.sale.price, b.sale.soldDate) === k).length;
    return all - taken;
  };

  /** What can still go out of this size: the shelf, plus what comes back of it, less what is already picked. */
  const available = (p: Product, size: string) => {
    const sizes = p.sizes ?? [];
    const shelf = sizes.length === 0
      ? (size === '' ? Number(p.stock) || 0 : 0)
      : Math.max(0, Number(sizes.find((s) => sizeOf(s) === size)?.quantity) || 0);
    const coming = back.filter((b) => b.product.id === p.id && sizeOf(b.sale) === size).length;
    const taken = out.filter((o) => o.product.id === p.id && o.size === size).length;
    return shelf + coming - taken;
  };

  const addBack = (product: Product, sale: SoldItem) => {
    const key = nextKey.current++;
    setBack((list) => [...list, { key, product, sale }]);
    setPicking(null);
    setError(null);
  };
  const addOut = (product: Product, size: string) => {
    const key = nextKey.current++;
    setOut((list) => [...list, { key, product, size, agreed: String(getEffectivePrice(product)) }]);
    setPicking(null);
    setError(null);
  };

  const save = async () => {
    if (!day || back.length === 0 || out.length === 0 || badPrice || saving) return;
    setSaving(true);
    setError(null);
    try {
      const x = await makeExchange(
        supabase,
        day,
        back.map((b) => ({ productId: b.product.id, size: sizeOf(b.sale), price: Number(b.sale.price) || 0 })),
        out.map((o) => ({ productId: o.product.id, size: o.size, agreed: Number(o.agreed) })),
        note.trim(),
      );
      setDone(x);
      setBack([]);
      setOut([]);
      setNote('');
      setPicking(null);
      refetch();
      setVersion((v) => v + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const onUndone = (x: Exchange) => {
    setHistory((h) => h && { ...h, list: h.list.map((e) => (e.id === x.id ? x : e)) });
    refetch();
  };

  if (loading || !history) {
    return (
      <Shell>
        <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
      </Shell>
    );
  }

  if (history.missing) {
    return (
      <Shell>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {isAdmin
            ? 'Замената чека миграција 025 (supabase/migrations/025_exchanges.sql). Пушти ја во Supabase SQL Editor, па освежи ја страната.'
            : 'Замената уште не е подготвена.'}
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {done ? (
        <DoneCard x={done} today={today} onNew={() => setDone(null)} />
      ) : (
        <div className="space-y-4">
          <Section n={1} title="Што враќа купувачот">
            {back.length > 0 && (
              <ul className="divide-y divide-slate-100 mb-3">
                {back.map((b) => (
                  <li key={b.key} className="flex items-center gap-3 py-2">
                    <Thumb p={b.product} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-900 truncate">{title(b.product)}</p>
                      <p className="text-xs text-slate-500 tabular-nums">
                        {sizeOf(b.sale) || '—'} · купено {dayText(dayOf(b.sale))} · {mkDen(Number(b.sale.price) || 0)}
                      </p>
                    </div>
                    <button
                      onClick={() => setBack((list) => list.filter((x) => x.key !== b.key))}
                      className="p-2 text-slate-400 hover:text-red-600"
                      aria-label="Тргни"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {picking === 'back' ? (
              <BackPicker
                products={candidates}
                initialId={back.length === 0 ? returnId : null}
                day={day}
                today={today}
                unpicked={unpicked}
                onPick={addBack}
                onClose={() => setPicking(null)}
              />
            ) : (
              <AddButton onClick={() => setPicking('back')}>
                {back.length === 0 ? 'Избери го парчето што се враќа' : 'Уште едно парче од истото купување'}
              </AddButton>
            )}
          </Section>

          <Section n={2} title="Што зема наместо тоа">
            {out.length > 0 && (
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
                            onChange={(e) => setOut((list) => list.map((x) => (x.key === o.key ? { ...x, agreed: e.target.value } : x)))}
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
                        onClick={() => setOut((list) => list.filter((x) => x.key !== o.key))}
                        className="p-2 text-slate-400 hover:text-red-600"
                        aria-label="Тргни"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {picking === 'out' ? (
              <OutPicker products={candidates} available={available} onPick={addOut} onClose={() => setPicking(null)} />
            ) : (
              <AddButton onClick={() => setPicking('out')}>
                {out.length === 0 ? 'Избери ново парче од залиха' : 'Уште едно ново парче'}
              </AddButton>
            )}
          </Section>

          {day && out.length > 0 && (
            <Summary
              back={back}
              out={out}
              booking={booking}
              day={day}
              today={today}
              note={note}
              onNote={setNote}
              badPrice={badPrice}
              saving={saving}
              error={error}
              onSave={save}
            />
          )}
          {error && !(day && out.length > 0) && <p className="text-sm text-red-700">{error}</p>}
        </div>
      )}

      <History list={history.list} error={historyError} isAdmin={isAdmin} onUndone={onUndone} />
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-2xl mx-auto px-4 py-5 sm:py-8">
      <div className="flex items-center gap-3 mb-1">
        <Link href="/admin" className="p-2 -ml-2 rounded-lg hover:bg-slate-100" aria-label="Назад">
          <ArrowLeft className="h-5 w-5 text-slate-600" />
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <ArrowLeftRight className="h-6 w-6 text-blue-600" /> Замена
        </h1>
      </div>
      <p className="text-sm text-slate-500 mb-5">
        Купеното се враќа на залиха, новото се продава на денот кога е купено вратеното. Пари не се враќаат, само се доплаќа.
      </p>
      {children}
    </div>
  );
}

function Section({ n, title: heading, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <h2 className="font-semibold text-slate-900 mb-3 flex items-center gap-2">
        <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs flex items-center justify-center">{n}</span>
        {heading}
      </h2>
      {children}
    </section>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border-2 border-dashed border-slate-300 rounded-lg text-sm text-slate-600 hover:border-blue-500 hover:text-blue-700"
    >
      <Plus className="h-4 w-4" /> {children}
    </button>
  );
}

function Thumb({ p }: { p: Product }) {
  return (
    <div className="relative w-10 h-12 rounded-md overflow-hidden bg-slate-100 shrink-0">
      {p.imageUrl && <Image src={p.imageUrl} alt="" fill className="object-cover" sizes="40px" />}
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder: string }) {
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

function PickerFrame({ heading, onClose, children }: { heading: string; onClose: () => void; children: React.ReactNode }) {
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

/** The returned piece: find the product, then the sale it was. */
function BackPicker({
  products, initialId, day, today, unpicked, onPick, onClose,
}: {
  products: Product[];
  initialId: string | null;
  /** The purchase already chosen: every piece must come from it. */
  day: string | null;
  today: string;
  unpicked: (p: Product, s: SoldItem) => number;
  onPick: (p: Product, s: SoldItem) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState('');
  const [chosen, setChosen] = useState<Product | null>(() => products.find((p) => p.id === initialId) ?? null);

  const hits = useMemo(
    () => (q.trim()
      ? products
        .filter((p) => (p.sold?.length ?? 0) > 0 && matchesSearch(p, q))
        .sort((a, b) => lastSale(b).localeCompare(lastSale(a)))
        .slice(0, 12)
      : []),
    [products, q],
  );

  if (chosen) {
    // Each distinct sale once, newest first; identical ones counted.
    const groups = new Map<string, { sale: SoldItem; count: number }>();
    for (const s of chosen.sold ?? []) {
      const k = saleKey(s.size, s.price, s.soldDate);
      const g = groups.get(k);
      if (g) g.count += 1;
      else groups.set(k, { sale: s, count: 1 });
    }
    const sales = [...groups.values()].sort((a, b) => dayOf(b.sale).localeCompare(dayOf(a.sale))).slice(0, 25);
    return (
      <PickerFrame heading="Која продажба е?" onClose={onClose}>
        <div className="flex items-center gap-3 mb-2">
          <Thumb p={chosen} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-900 truncate">{title(chosen)}</p>
            <p className="text-[11px] text-slate-400 truncate">{chosen.name} · {chosen.id}</p>
          </div>
          <button onClick={() => setChosen(null)} className="text-xs text-blue-700 underline shrink-0">друг производ</button>
        </div>
        {sales.length === 0 ? (
          <p className="text-sm text-slate-500 py-3 text-center">Нема запишана продажба на овој производ.</p>
        ) : (
          <ul className="space-y-1.5">
            {sales.map(({ sale, count }) => {
              const left = unpicked(chosen, sale);
              const otherDay = day !== null && dayOf(sale) !== day;
              const price = Number(sale.price) || 0;
              return (
                <li key={saleKey(sale.size, sale.price, sale.soldDate)}>
                  <button
                    onClick={() => onPick(chosen, sale)}
                    disabled={left <= 0 || otherDay}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-white border border-slate-200 text-left text-sm hover:border-blue-400 disabled:opacity-45 disabled:hover:border-slate-200"
                  >
                    <span className="font-medium tabular-nums">{dayText(dayOf(sale))}</span>
                    <span className="text-slate-500">· {sizeOf(sale) || '—'} ·</span>
                    <span className="tabular-nums">{mkDen(price)}</span>
                    {price === 0 && sale.reason && <span className="text-[11px] text-slate-400">({REASON[sale.reason]})</span>}
                    {count > 1 && <span className="text-[11px] text-slate-400">×{count}</span>}
                    <span className="ml-auto text-[11px] text-slate-400 text-right">
                      {otherDay ? 'друг ден: посебна замена' : left <= 0 ? 'избрано' : ago(dayOf(sale), today)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </PickerFrame>
    );
  }

  return (
    <PickerFrame heading="Кој производ се враќа?" onClose={onClose}>
      <SearchBox value={q} onChange={setQ} placeholder="Шифра или име (и распродадените)" />
      <ul className="divide-y divide-slate-100">
        {hits.map((p) => (
          <li key={p.id}>
            <button onClick={() => setChosen(p)} className="w-full flex items-center gap-3 py-2 text-left hover:bg-white">
              <Thumb p={p} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-slate-900 truncate">{title(p)}</p>
                <p className="text-[11px] text-slate-400 truncate">{p.name} · последна продажба {dayText(lastSale(p))}</p>
              </div>
            </button>
          </li>
        ))}
      </ul>
      {q.trim() && hits.length === 0 && (
        <p className="text-sm text-slate-500 py-3 text-center">Нема продаден производ со тоа име или шифра.</p>
      )}
    </PickerFrame>
  );
}

/** A new piece: a product on the shelf and its size. */
function OutPicker({
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

function Summary({
  back, out, booking, day, today, note, onNote, badPrice, saving, error, onSave,
}: {
  back: Back[];
  out: Out[];
  booking: Booking;
  day: string;
  today: string;
  note: string;
  onNote: (v: string) => void;
  badPrice: boolean;
  saving: boolean;
  error: string | null;
  onSave: () => void;
}) {
  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <h2 className="font-semibold text-slate-900 mb-3">Пресметка</h2>
      <dl className="text-sm space-y-1">
        <div className="flex justify-between gap-3">
          <dt className="text-slate-600">Враќа {pieces(back.length)}, купено {dayText(day)} ({ago(day, today)})</dt>
          <dd className="tabular-nums">{mkDen(booking.returnedTotal)}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-slate-600">Зема {pieces(out.length)}</dt>
          <dd className="tabular-nums">{mkDen(booking.givenTotal)}</dd>
        </div>
      </dl>

      {badPrice ? (
        <p className="mt-3 text-sm text-red-700">Секое ново парче мора да има цена.</p>
      ) : booking.leftOver > 0 ? (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <p className="font-semibold">Новото е за {mkDen(booking.leftOver)} поевтино.</p>
          <p className="mt-0.5">
            Пари не се враќаат: купувачот може да земе уште нешто. Ако продолжиш, новите парчиња се книжат по{' '}
            {mkDen(booking.returnedTotal)} вкупно:{' '}
            {out.map((o, i) => `${o.product.name}${o.size ? ' ' + o.size : ''} ${mkDen(booking.prices[i])}`).join(', ')}.
          </p>
        </div>
      ) : (
        <div className="mt-3 flex items-baseline justify-between rounded-lg bg-blue-50 px-3 py-2">
          <span className="text-sm font-medium text-blue-900">{booking.topUp > 0 ? 'Доплата' : 'Без доплата'}</span>
          {booking.topUp > 0 && <span className="text-2xl font-bold text-blue-900 tabular-nums">{mkDen(booking.topUp)}</span>}
        </div>
      )}

      {FIREBASE_SYNC_LIVE && (
        <p className="mt-3 text-xs text-amber-800 flex gap-1.5">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          Firebase сè уште е изворот на залихата: по замената ќе ти кажам што да внесеш и таму.
        </p>
      )}

      <input
        value={note}
        onChange={(e) => onNote(e.target.value)}
        maxLength={200}
        placeholder="Белешка (на пример: големината не одговара)"
        className="mt-3 w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
      />
      <button
        onClick={onSave}
        disabled={saving || badPrice}
        className="mt-3 w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-blue-600 text-white font-semibold disabled:opacity-50"
      >
        {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <ArrowLeftRight className="h-5 w-5" />}
        Запиши замена{booking.topUp > 0 && !badPrice ? ` · доплата ${mkDen(booking.topUp)}` : ''}
      </button>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </section>
  );
}

function DoneCard({ x, today, onNew }: { x: Exchange; today: string; onNew: () => void }) {
  return (
    <section className="bg-white rounded-xl border border-green-200 shadow-sm p-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center shrink-0">
          <Check className="h-5 w-5 text-green-700" />
        </div>
        <div>
          <p className="font-semibold text-green-800">Замената е запишана</p>
          <p className="text-sm text-slate-700">
            {x.topUp > 0 ? <>Наплати доплата: <b className="tabular-nums">{mkDen(x.topUp)}</b></> : 'Без доплата.'}
          </p>
        </div>
      </div>
      <ExchangeLines x={x} />
      {x.purchaseDay !== today && (
        <p className="mt-2 text-xs text-slate-500">
          Новите парчиња се во продажбите на {dayText(x.purchaseDay)}, денот на купувањето, не денес.
        </p>
      )}
      {FIREBASE_SYNC_LIVE && (
        <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          <p className="font-semibold flex items-center gap-1.5"><AlertTriangle className="h-4 w-4" /> Внеси го истото и во Firebase</p>
          <p className="mt-0.5">Инаку следниот Sync All ќе го врати вратеното парче како продадено:</p>
          <ul className="mt-1 list-disc pl-5 space-y-0.5">
            {firebaseSteps(x, dayText, mkDen).map((s) => <li key={s}>{s}</li>)}
          </ul>
        </div>
      )}
      <button onClick={onNew} className="mt-4 w-full py-2.5 rounded-lg border border-slate-300 text-sm font-medium text-slate-700 hover:bg-slate-50">
        Нова замена
      </button>
    </section>
  );
}

function ExchangeLines({ x }: { x: Exchange }) {
  return (
    <div className="mt-2 text-sm space-y-0.5">
      {x.returned.map((p, i) => (
        <p key={'r' + i} className="text-slate-600">
          <span className="text-slate-400">← врати </span>{p.name}{p.size ? ` ${p.size}` : ''} · {mkDen(p.price)}
        </p>
      ))}
      {x.given.map((p, i) => (
        <p key={'g' + i} className="text-slate-900">
          <span className="text-slate-400">→ зеде </span>{p.name}{p.size ? ` ${p.size}` : ''} · {mkDen(p.price)}
          {p.price !== p.agreed && <span className="text-[11px] text-slate-400"> (цена {mkDen(p.agreed)})</span>}
        </p>
      ))}
    </div>
  );
}

function History({
  list, error, isAdmin, onUndone,
}: {
  list: Exchange[];
  error: string | null;
  isAdmin: boolean;
  onUndone: (x: Exchange) => void;
}) {
  if (error) return <p className="mt-6 text-sm text-red-700">{error}</p>;
  if (list.length === 0) return null;
  return (
    <div className="mt-8">
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Последни замени</h2>
      <ul className="space-y-2">
        {list.map((x) => <HistoryItem key={x.id} x={x} isAdmin={isAdmin} onUndone={onUndone} />)}
      </ul>
    </div>
  );
}

function HistoryItem({ x, isAdmin, onUndone }: { x: Exchange; isAdmin: boolean; onUndone: (x: Exchange) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const undo = async () => {
    if (!confirm(`Да се поништи замената? Новите парчиња се враќаат на залиха, а вратените пак се продадени на ${dayText(x.purchaseDay)}.`)) return;
    setBusy(true);
    setError(null);
    try {
      onUndone(await undoExchange(supabase, x.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <li className={`bg-white rounded-xl border border-slate-200 p-3 ${x.undoneAt ? 'opacity-60' : ''}`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-slate-500">
            {countWhen(x.madeAt)}{x.madeBy ? ` · ${x.madeBy}` : ''} · купено {dayText(x.purchaseDay)}
            {x.orderNumber ? ` · ${x.orderNumber}` : ''}
          </p>
          <ExchangeLines x={x} />
          {x.note && <p className="mt-1 text-xs text-slate-500 italic">{x.note}</p>}
        </div>
        <div className="text-right shrink-0">
          {x.topUp > 0 && <p className="text-sm font-semibold tabular-nums text-slate-900">+{mkDen(x.topUp)}</p>}
          {x.undoneAt && (
            <span className="inline-block mt-1 px-2 py-0.5 rounded-full bg-slate-100 text-[11px] text-slate-600">поништена</span>
          )}
        </div>
      </div>
      {x.undoneAt ? (
        <p className="mt-1 text-[11px] text-slate-400">Поништена {countWhen(x.undoneAt)}{x.undoneBy ? ` · ${x.undoneBy}` : ''}</p>
      ) : isAdmin && (
        <button onClick={undo} disabled={busy} className="mt-2 text-xs text-slate-600 underline disabled:opacity-50">
          {busy ? 'Се поништува…' : 'Поништи'}
        </button>
      )}
      {error && <p className="mt-1 text-xs text-red-700">{error}</p>}
    </li>
  );
}
