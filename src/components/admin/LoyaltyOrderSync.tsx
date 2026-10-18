'use client';

/**
 * "Bring points in line with the orders" (Task 13.8). Every status change on
 * the orders screen already does this for its order; this is for the time a
 * connection dropped between the two, or a change was made some other way.
 * A sync, so pressing it twice does nothing new.
 */

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { accountFetch } from '@/lib/account-client';

interface SyncResult { orderNumber: string; done: string[]; problems: string[] }

export default function LoyaltyOrderSync() {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ checked: number; results: SyncResult[] } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    const r = await accountFetch<{ checked: number; results: SyncResult[] }>('/api/orders/loyalty', {
      method: 'POST',
      body: JSON.stringify({ all: true }),
    });
    setBusy(false);
    if (r.error) setError(r.error);
    else setResult(r.data!);
  };

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mt-4">
      <h2 className="font-bold text-slate-800 text-sm">Нарачки и поени</h2>
      <p className="text-xs text-slate-500 mt-0.5">
        Поените и купоните ја следат нарачката: при испорака почнува чекањето, при откажување или одбивање се враќаат.
        Тоа се прави самото при секоја промена на статусот. Копчето е за кога врската паднала во меѓувреме.
      </p>
      <button
        type="button"
        onClick={run}
        disabled={busy}
        className="mt-3 px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 disabled:opacity-50"
      >
        <RefreshCw className={`h-3.5 w-3.5 ${busy ? 'animate-spin' : ''}`} />
        {busy ? 'Се усогласува…' : 'Усогласи ги поените со нарачките'}
      </button>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      {result && (
        <div className="mt-3 text-sm">
          <p className="text-slate-600">
            Проверени {result.checked} нарачки со профил.{' '}
            {result.results.length === 0 ? 'Сè е во ред, ништо не требаше да се смени.' : `Сменети или со проблем: ${result.results.length}.`}
          </p>
          <ul className="mt-2 space-y-1">
            {result.results.map((r) => (
              <li key={r.orderNumber} className="text-xs">
                <span className="font-mono text-slate-700">{r.orderNumber}</span>
                {r.done.length > 0 && <span className="text-green-700"> · {r.done.join(', ')}</span>}
                {r.problems.length > 0 && <span className="text-red-700"> · {r.problems.join(' ')}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
