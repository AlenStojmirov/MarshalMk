'use client';

/**
 * The admin's side of a stock count (Task 17.3, D-046): every difference,
 * what it is worth at cost, and the decision on it.
 *
 * "Примени во залихата" adds the difference to the shelf as it is now, in
 * the database under a lock (stock.ts → stock_count_apply), so a sale since
 * the count stays sold. "Остави" keeps the system's numbers (the piece turned
 * up, the count was wrong). "Преброј повторно" puts the product back on the
 * list. The count closes once every product is counted and every difference
 * is decided.
 */

import { useState } from 'react';
import Image from 'next/image';
import { AlertTriangle, Loader2, Lock } from 'lucide-react';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Product } from '@/types';
import { getProductDisplayName } from '@/lib/product-display';
import { mkDen, mkNumber } from '@/lib/mk-format';
import { applyCountLine } from '@/lib/stock';
import { closeCount, dismissLine, recountLine } from '@/lib/stock-count-db';
import {
  FIREBASE_SYNC_LIVE, countDiff, lineShortExtra,
  type CountLine, type CountProgress, type LineStatus,
} from '@/lib/stock-count';
import { DiffTable, countWhen } from '@/components/admin/StockCountPanel';

export interface ReviewRow {
  line: CountLine;
  product: Product;
  status: LineStatus;
}

/** Units short and extra over a count's differences, and their worth at cost where it is known. */
export function countLoss(rows: ReviewRow[]) {
  const t = { short: 0, extra: 0, shortValue: 0, extraValue: 0, unknownCost: 0 };
  for (const { line, product } of rows) {
    if (!line.countedAt || line.matches) continue;
    const { short, extra } = lineShortExtra(line);
    t.short += short;
    t.extra += extra;
    const cost = product.purchasePrice;
    if (cost && cost > 0) {
      t.shortValue += short * cost;
      t.extraValue += extra * cost;
    } else if (short + extra > 0) {
      t.unknownCost += 1;
    }
  }
  return t;
}

export function LossSummary({ rows }: { rows: ReviewRow[] }) {
  const t = countLoss(rows);
  if (t.short + t.extra === 0) return null;
  return (
    <p className="mt-1 text-xs text-slate-600">
      Кусок <b className="text-red-700 tabular-nums">{mkNumber(t.short)}</b> парчиња
      {t.shortValue > 0 && <> ({mkDen(Math.round(t.shortValue))} по набавна)</>}
      {' · '}вишок <b className="text-blue-700 tabular-nums">{mkNumber(t.extra)}</b>
      {t.extraValue > 0 && <> ({mkDen(Math.round(t.extraValue))})</>}
      {t.unknownCost > 0 && <span className="text-slate-400"> · {t.unknownCost} без набавна</span>}
    </p>
  );
}

export function FirebaseApplyNote() {
  if (!FIREBASE_SYNC_LIVE) return null;
  return (
    <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 flex gap-2">
      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
      <span>
        Firebase сè уште е изворот на залихата: следниот Sync All ги враќа старите бројки за секој производ поправен
        тука. Додека не дојде денот на преминот, поправи ја разликата и во Firebase.
      </span>
    </div>
  );
}

export function CloseCount({
  sb, countId, progress, onClosed,
}: {
  sb: SupabaseClient;
  countId: number;
  progress: CountProgress;
  onClosed: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const left = progress.listed - progress.counted;
  const close = async () => {
    if (!confirm('Да се заклучи пописот? По ова не може да се менува.')) return;
    setBusy(true);
    try {
      await closeCount(sb, countId);
      onClosed();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="mt-3 flex flex-col sm:flex-row sm:items-center gap-2">
      <button
        onClick={close}
        disabled={busy || !progress.closable}
        className="flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium disabled:opacity-40"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />} Заклучи попис
      </button>
      {!progress.closable && (
        <p className="text-xs text-slate-500">
          {left > 0 && `Уште ${mkNumber(left)} за броење. `}
          {progress.open > 0 && `${mkNumber(progress.open)} ${progress.open === 1 ? 'разлика чека' : 'разлики чекаат'} одлука.`}
        </p>
      )}
    </div>
  );
}

const ORDER: Record<LineStatus, number> = { diff: 0, applied: 1, dismissed: 2, ok: 3, pending: 4 };

export default function StockCountReview({
  sb, countId, rows, onLine, onOpen,
}: {
  sb: SupabaseClient;
  countId: number;
  rows: ReviewRow[];
  /** A line after a decision; null fields for a recount. */
  onLine: (line: CountLine) => void;
  onOpen: (productId: string) => void;
}) {
  const sorted = [...rows].sort((a, b) => ORDER[a.status] - ORDER[b.status]);
  if (sorted.length === 0) {
    return <p className="text-center text-sm text-slate-500 py-10 bg-white rounded-xl border border-slate-200">Нема разлики.</p>;
  }
  return (
    <div>
      <FirebaseApplyNote />
      <ul className="space-y-3">
        {sorted.map((r) => (
          <ReviewCard key={r.line.productId} sb={sb} countId={countId} row={r} onLine={onLine} onOpen={onOpen} />
        ))}
      </ul>
    </div>
  );
}

function ReviewCard({
  sb, countId, row, onLine, onOpen,
}: {
  sb: SupabaseClient;
  countId: number;
  row: ReviewRow;
  onLine: (line: CountLine) => void;
  onOpen: (productId: string) => void;
}) {
  const { line, product: p, status } = row;
  const [busy, setBusy] = useState<null | 'apply' | 'dismiss' | 'recount'>(null);
  const [error, setError] = useState<string | null>(null);
  const { short, extra } = lineShortExtra(line);
  const cost = p.purchasePrice && p.purchasePrice > 0 ? p.purchasePrice : null;
  const net = (extra - short) * (cost ?? 0);

  const act = async (what: 'apply' | 'dismiss' | 'recount') => {
    if (what === 'recount' && !confirm('Производот се враќа на листата за броење. Продолжи?')) return;
    setBusy(what);
    setError(null);
    try {
      if (what === 'apply') onLine(await applyCountLine(sb, countId, line.productId));
      else if (what === 'dismiss') onLine(await dismissLine(sb, countId, line.productId));
      else {
        await recountLine(sb, countId, line.productId);
        onLine({
          ...line, expected: null, counted: null, matches: null, countedAt: null, countedBy: null,
          resolution: null, applied: null, resolvedAt: null, resolvedBy: null,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  // Applying never takes a size below zero, so what changed can be less than the difference.
  const wanted = countDiff(line.expected, line.counted).filter((d) => d.change !== 0);
  const appliedText = (line.applied ?? []).map((a) => `${a.size || '—'} ${a.change > 0 ? '+' : ''}${a.change}`).join(', ');
  const partial = status === 'applied'
    && wanted.reduce((n, d) => n + Math.abs(d.change), 0) !== (line.applied ?? []).reduce((n, a) => n + Math.abs(a.change), 0);

  return (
    <li className={`bg-white rounded-xl border shadow-sm p-3 sm:p-4 ${status === 'diff' ? 'border-amber-300' : 'border-slate-200 opacity-80'}`}>
      <button onClick={() => onOpen(line.productId)} className="w-full flex items-start gap-3 text-left">
        <div className="relative w-12 h-14 rounded-lg overflow-hidden bg-slate-100 shrink-0">
          {p.imageUrl && <Image src={p.imageUrl} alt="" fill className="object-cover" sizes="48px" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-slate-900">{getProductDisplayName(p.name, p.category, p.brand)}</p>
          <p className="text-[11px] text-slate-400 truncate">{p.name} · {p.id}</p>
          <p className="text-[11px] text-slate-500">
            Попишано {countWhen(line.countedAt)}{line.countedBy ? ` · ${line.countedBy}` : ''}
            {!line.listed && <span className="text-blue-700"> · најдено надвор од листата</span>}
          </p>
        </div>
        <div className="text-right shrink-0 text-xs tabular-nums">
          {short > 0 && <p className="text-red-700 font-semibold">−{short}</p>}
          {extra > 0 && <p className="text-blue-700 font-semibold">+{extra}</p>}
          {cost !== null && net !== 0 && <p className="text-slate-500">{net > 0 ? '+' : '−'}{mkDen(Math.abs(Math.round(net)))}</p>}
        </div>
      </button>

      <div className="mt-2 rounded-lg bg-slate-50 px-3 py-2">
        <DiffTable line={line} />
      </div>

      {status === 'diff' ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => act('apply')}
            disabled={!!busy}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {busy === 'apply' && <Loader2 className="h-4 w-4 animate-spin" />} Примени во залихата
          </button>
          <button
            onClick={() => act('dismiss')}
            disabled={!!busy}
            title="Залихата останува како во системот"
            className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {busy === 'dismiss' && <Loader2 className="h-4 w-4 animate-spin" />} Остави
          </button>
          <button
            onClick={() => act('recount')}
            disabled={!!busy}
            className="px-2 py-2 text-sm text-slate-600 hover:underline disabled:opacity-50"
          >
            {busy === 'recount' ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Преброј повторно'}
          </button>
        </div>
      ) : (
        <p className="mt-2 text-xs text-slate-600">
          {status === 'applied'
            ? <>Применето {countWhen(line.resolvedAt)}{line.resolvedBy ? ` · ${line.resolvedBy}` : ''}: {appliedText || 'ништо не се смени'}
                {partial && <span className="text-amber-700"> (залихата не оди под нула)</span>}</>
            : <>Оставено {countWhen(line.resolvedAt)}{line.resolvedBy ? ` · ${line.resolvedBy}` : ''}: залихата е како во системот.</>}
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
    </li>
  );
}

