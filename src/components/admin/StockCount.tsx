'use client';

/**
 * Попис: the stock count screen (Tasks 17.2–17.3, D-046).
 *
 * The warehouse goes product by product: the list is every product that had
 * stock when the admin started the count, by category so it follows the
 * shelves. A tap opens the product's sizes with the system's numbers; each
 * is kept or corrected, and saving changes nothing on the shelf. A piece found
 * that is not on the list is counted through "Најдов нешто што не е на
 * листата". The count is complete when every product on the list is counted.
 *
 * The admin starts the count, sees the differences, applies or leaves each
 * one, and closes the count once every product is counted and every
 * difference decided.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft, Check, ClipboardCheck, Loader2, Search, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useProducts } from '@/hooks/useProducts';
import type { Product } from '@/types';
import { getProductDisplayName } from '@/lib/product-display';
import { matchesSearch } from '@/lib/admin-search';
import { mkDate, mkNumber } from '@/lib/mk-format';
import {
  FIREBASE_SYNC_LIVE, countProgress, lineShortExtra, lineStatus,
  type CountLine, type LineStatus,
} from '@/lib/stock-count';
import { cancelCount, fetchCountState, startCount, type CountState } from '@/lib/stock-count-db';
import StockCountPanel, { countWhen, sizesText } from '@/components/admin/StockCountPanel';

type Tab = 'todo' | 'diff' | 'done' | 'all';

const TAB_LABEL: Record<Tab, string> = {
  todo: 'За броење',
  diff: 'Разлики',
  done: 'Попишани',
  all: 'Сите',
};

const inTab = (tab: Tab, st: LineStatus) =>
  tab === 'all' ? true
  : tab === 'todo' ? st === 'pending'
  : tab === 'done' ? st !== 'pending'
  : st === 'diff' || st === 'applied' || st === 'dismissed';

interface Row {
  line: CountLine;
  product: Product;
  status: LineStatus;
}

export default function StockCount() {
  const { role, isAdmin } = useAuth();
  const router = useRouter();
  const search = useSearchParams();
  const { products, loading: productsLoading } = useProducts();
  const [state, setState] = useState<CountState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('todo');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [panelFor, setPanelFor] = useState<string | null>(null);
  const [finding, setFinding] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  // Bumped to read the count again after starting or cancelling one.
  const [version, setVersion] = useState(0);
  const reload = useCallback(() => setVersion((v) => v + 1), []);

  useEffect(() => {
    if (!role) return;
    let live = true;
    fetchCountState(supabase, isAdmin).then(
      (s) => { if (live) { setState(s); setError(null); } },
      (err) => { if (live) setError(err instanceof Error ? err.message : String(err)); },
    );
    return () => { live = false; };
  }, [role, isAdmin, version]);

  // A scanned label during a count lands here with ?product= (the sale screen
  // links it); closing the panel takes the parameter away.
  const wanted = search.get('product');

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const lines = useMemo(() => state?.lines ?? [], [state]);
  const lineOf = useMemo(() => new Map(lines.map((l) => [l.productId, l])), [lines]);
  const progress = useMemo(() => countProgress(lines), [lines]);

  const rows = useMemo<Row[]>(
    () => lines
      .map((line) => ({ line, product: byId.get(line.productId), status: lineStatus(line) }))
      .filter((r): r is Row => !!r.product)
      .sort((a, b) => a.product.category.localeCompare(b.product.category) || a.product.name.localeCompare(b.product.name)),
    [lines, byId],
  );
  const categories = useMemo(() => [...new Set(rows.map((r) => r.product.category))].sort(), [rows]);
  const scoped = useMemo(
    () => rows.filter((r) => (!category || r.product.category === category) && matchesSearch(r.product, query)),
    [rows, category, query],
  );
  const shown = scoped.filter((r) => inTab(tab, r.status));
  const tabCount = (t: Tab) => scoped.filter((r) => inTab(t, r.status)).length;

  const onSaved = (saved: CountLine) => {
    setState((s) => s && {
      ...s,
      lines: s.lines.some((l) => l.productId === saved.productId)
        ? s.lines.map((l) => (l.productId === saved.productId ? saved : l))
        : [...s.lines, saved],
    });
    setPanelFor(null);
    setToast(saved.matches ? 'Зачувано: точно' : 'Зачувано: има разлика');
    if (wanted) router.replace('/admin/stock-count');
  };

  const closePanel = () => {
    setPanelFor(null);
    if (wanted) router.replace('/admin/stock-count');
  };

  const start = async () => {
    const n = products.filter((p) => p.stock > 0).length;
    if (!confirm(`Ќе се попишат сите ${n} производи што имаат залиха сега. Почни попис?`)) return;
    setBusy(true);
    try {
      await startCount(supabase, note.trim());
      setNote('');
      setTab('todo');
      reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!state?.open) return;
    if (!confirm('Да се откаже пописот? Сè што е попишано во него ќе се избрише. Залихата не се менува.')) return;
    setBusy(true);
    try {
      await cancelCount(supabase, state.open.id);
      reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (!state || productsLoading) {
    return (
      <Shell>
        {error ? <p className="text-sm text-red-700">{error}</p> : (
          <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-blue-600" /></div>
        )}
      </Shell>
    );
  }

  if (state.missing) {
    return (
      <Shell>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          {isAdmin
            ? 'Пописот чека миграција 024 (supabase/migrations/024_stock_count.sql). Пушти ја во Supabase SQL Editor, па освежи ја страната.'
            : 'Пописот уште не е подготвен.'}
        </div>
      </Shell>
    );
  }

  const open = state.open;

  if (!open) {
    return (
      <Shell>
        {isAdmin ? (
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5">
            <h2 className="font-semibold text-slate-900">Нов попис</h2>
            <p className="text-sm text-slate-600 mt-1">
              Листата се сите <b>{products.filter((p) => p.stock > 0).length}</b> производи што имаат залиха сега.
              Магацинот оди производ по производ: ги потврдува точните бројки и ги поправа погрешните, а залихата
              не се менува. Ти ги гледаш разликите и одлучуваш за секоја. Пописот е завршен кога се попишани сите.
            </p>
            {FIREBASE_SYNC_LIVE && <FirebaseNote />}
            <div className="mt-4 flex flex-col sm:flex-row gap-2">
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={120}
                placeholder="Белешка (на пример: годишен попис, ноември)"
                className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm"
              />
              <button
                onClick={start}
                disabled={busy}
                className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white font-medium text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                <ClipboardCheck className="h-4 w-4" /> Почни попис
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 p-6 text-center">
            <ClipboardCheck className="h-10 w-10 mx-auto text-slate-300 mb-2" />
            <p className="font-medium text-slate-900">Нема попис во тек.</p>
            <p className="text-sm text-slate-500 mt-1">Пописот го почнува админот.</p>
          </div>
        )}
        {isAdmin && <History history={state.history} />}
      </Shell>
    );
  }

  const panelId = panelFor ?? wanted;
  const panelProduct = panelId ? byId.get(panelId) : undefined;

  return (
    <Shell>
      {/* Progress */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-sm text-slate-600">
            Попис од {countWhen(open.startedAt)}
            {open.note ? ` · ${open.note}` : ''}
          </p>
          {isAdmin && (
            <button onClick={cancel} disabled={busy} className="text-xs text-red-600 hover:underline shrink-0">
              Откажи попис
            </button>
          )}
        </div>
        <p className="mt-1 text-2xl font-bold text-slate-900 tabular-nums">
          {progress.counted} <span className="text-base font-medium text-slate-500">од {progress.listed} попишани</span>
        </p>
        <div className="mt-2 h-2 rounded-full bg-slate-100 overflow-hidden">
          <div
            className={`h-full ${progress.complete ? 'bg-green-500' : 'bg-blue-500'}`}
            style={{ width: `${progress.listed ? (100 * progress.counted) / progress.listed : 100}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          ✓ {progress.ok} точни · <span className={progress.open ? 'text-amber-700 font-semibold' : ''}>{progress.open} разлики чекаат</span>
          {progress.applied + progress.dismissed > 0 && ` · ${progress.applied + progress.dismissed} решени`}
          {progress.found > 0 && ` · ${progress.found} најдени надвор од листата`}
        </p>
        {progress.complete && (
          <p className="mt-3 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-sm text-green-800 flex items-center gap-2">
            <Check className="h-4 w-4 shrink-0" />
            {isAdmin
              ? 'Сите производи се попишани.'
              : 'Сите производи се попишани. Админот ги прегледува разликите.'}
          </p>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 mb-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Барај по шифра или име"
            className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="px-3 py-2.5 border border-slate-300 rounded-lg text-sm bg-white"
        >
          <option value="">Сите категории</option>
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>
      <div className="flex gap-1 mb-3 overflow-x-auto">
        {(Object.keys(TAB_LABEL) as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-full text-sm whitespace-nowrap ${
              tab === t ? 'bg-slate-900 text-white' : 'bg-white border border-slate-200 text-slate-600'
            }`}
          >
            {TAB_LABEL[t]} <span className="tabular-nums opacity-70">{tabCount(t)}</span>
          </button>
        ))}
      </div>

      {/* List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm">
        {shown.length === 0 ? (
          <p className="text-center text-sm text-slate-500 py-10">
            {tab === 'todo' && !query && !category ? 'Нема ништо за броење.' : 'Нема производи за овој избор.'}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {shown.map((r) => (
              <CountRow key={r.line.productId} row={r} onOpen={() => setPanelFor(r.line.productId)} />
            ))}
          </ul>
        )}
      </div>

      <button
        onClick={() => setFinding(true)}
        className="mt-4 w-full py-3 rounded-xl border-2 border-dashed border-slate-300 text-sm text-slate-600 hover:border-blue-400 hover:text-blue-700"
      >
        Најдов нешто што не е на листата
      </button>

      {finding && (
        <FindProduct
          products={products.filter((p) => !lineOf.has(p.id))}
          onPick={(id) => { setFinding(false); setPanelFor(id); }}
          onClose={() => setFinding(false)}
        />
      )}

      {panelProduct && (
        <StockCountPanel
          key={panelProduct.id}
          sb={supabase}
          countId={open.id}
          product={panelProduct}
          line={lineOf.get(panelProduct.id) ?? null}
          onSaved={onSaved}
          onClose={closePanel}
        />
      )}

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-slate-900 text-white text-sm shadow-lg">
          {toast}
        </div>
      )}
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-3xl mx-auto px-4 py-5 sm:py-8">
      <div className="flex items-center gap-3 mb-5">
        <Link href="/admin" className="p-2 -ml-2 rounded-lg hover:bg-slate-100" aria-label="Назад">
          <ArrowLeft className="h-5 w-5 text-slate-600" />
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <ClipboardCheck className="h-6 w-6 text-blue-600" /> Попис
        </h1>
      </div>
      {children}
    </div>
  );
}

function FirebaseNote() {
  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex gap-2">
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
      <span>
        Firebase сè уште е изворот на залихата. Пописот е точен само ако бројките се свежи додека се брои: пушти Sync All
        веднаш пред почетокот и брои кога не се внесуваат продажби во Firebase. Поправката направена тука ја брише следниот
        Sync All, па поправи ја и во Firebase. Најчисто е пописот да се направи на денот на преминот.
      </span>
    </div>
  );
}

const STATUS_CHIP: Record<LineStatus, { text: string; cls: string }> = {
  pending: { text: '', cls: '' },
  ok: { text: '✓ точно', cls: 'bg-green-50 text-green-700' },
  diff: { text: 'разлика', cls: 'bg-amber-100 text-amber-800' },
  applied: { text: 'применето', cls: 'bg-slate-100 text-slate-600' },
  dismissed: { text: 'оставено', cls: 'bg-slate-100 text-slate-600' },
};

function CountRow({ row, onOpen }: { row: Row; onOpen: () => void }) {
  const { line, product: p, status } = row;
  const se = status === 'pending' ? null : lineShortExtra(line);
  return (
    <li>
      <button onClick={onOpen} className="w-full flex items-center gap-3 px-3 sm:px-4 py-3 text-left hover:bg-slate-50">
        <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-slate-100 shrink-0">
          {p.imageUrl && <Image src={p.imageUrl} alt="" fill className="object-cover" sizes="48px" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-900 truncate">{getProductDisplayName(p.name, p.category, p.brand)}</p>
          <p className="text-[11px] text-slate-400 truncate">{p.name} · {p.id}</p>
          <p className="text-[11px] text-slate-500 tabular-nums truncate">
            {status === 'pending'
              ? sizesText((p.sizes ?? []).map((s) => ({ size: s.size, quantity: s.quantity })))
              : `попишано: ${sizesText(line.counted)}`}
          </p>
        </div>
        {status !== 'pending' && (
          <div className="text-right shrink-0">
            <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium ${STATUS_CHIP[status].cls}`}>
              {STATUS_CHIP[status].text}
            </span>
            {se && (se.short > 0 || se.extra > 0) && (
              <p className="text-[11px] tabular-nums mt-0.5">
                {se.short > 0 && <span className="text-red-700">−{se.short}</span>}
                {se.short > 0 && se.extra > 0 && ' '}
                {se.extra > 0 && <span className="text-blue-700">+{se.extra}</span>}
              </p>
            )}
            {!line.listed && <p className="text-[10px] text-blue-700">најдено</p>}
          </div>
        )}
      </button>
    </li>
  );
}

function FindProduct({ products, onPick, onClose }: { products: Product[]; onPick: (id: string) => void; onClose: () => void }) {
  const [q, setQ] = useState('');
  const hits = q.trim() ? products.filter((p) => matchesSearch(p, q)).slice(0, 20) : [];
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md max-h-[85vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-xl p-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-slate-900">Најдов нешто што не е на листата</h2>
          <button onClick={onClose} className="p-1 text-slate-400" aria-label="Затвори"><X className="h-5 w-5" /></button>
        </div>
        <p className="text-xs text-slate-500 mb-3">
          Парче на полица што системот го води како празно, или производ додаден по почетокот на пописот.
        </p>
        <input
          autoFocus
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Шифра или име"
          className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm mb-2"
        />
        <ul className="divide-y divide-slate-100">
          {hits.map((p) => (
            <li key={p.id}>
              <button onClick={() => onPick(p.id)} className="w-full text-left py-2.5 hover:bg-slate-50">
                <p className="text-sm text-slate-900">{getProductDisplayName(p.name, p.category, p.brand)}</p>
                <p className="text-[11px] text-slate-400">{p.name} · залиха {p.stock}</p>
              </button>
            </li>
          ))}
        </ul>
        {q.trim() && hits.length === 0 && <p className="text-sm text-slate-500 py-4 text-center">Нема таков производ.</p>}
      </div>
    </div>
  );
}

function History({ history }: { history: CountState['history'] }) {
  if (history.length === 0) return null;
  return (
    <div className="mt-6">
      <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-2">Претходни пописи</h2>
      <ul className="space-y-2">
        {history.map(({ count, lines }) => {
          const p = countProgress(lines);
          let short = 0;
          let extra = 0;
          for (const l of lines) {
            if (l.countedAt && !l.matches) {
              const se = lineShortExtra(l);
              short += se.short;
              extra += se.extra;
            }
          }
          return (
            <li key={count.id} className="bg-white rounded-xl border border-slate-200 p-3 text-sm">
              <p className="font-medium text-slate-900">
                {mkDate(count.startedAt)} – {mkDate(count.closedAt ?? undefined)}
                {count.note ? ` · ${count.note}` : ''}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {mkNumber(p.counted + p.found)} попишани · {mkNumber(p.ok)} точни · {mkNumber(p.applied)} применети ·{' '}
                {mkNumber(p.dismissed)} оставени · кусок {mkNumber(short)} · вишок {mkNumber(extra)} парчиња
              </p>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
