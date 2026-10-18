'use client';

/**
 * A customer's points, for the owner (Task 13.3): find them by e-mail, see the
 * balance and every movement, and add or remove points by hand — always with
 * a reason, which the customer sees in their own history.
 */

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { LoyaltySettings } from '@/lib/loyalty-settings';
import {
  FoundUser, HISTORY_LABEL, HistoryEntry, PointsMovement,
  adjustPoints, expiryFor, fetchPointsMovements, findUserByEmail, pointsHistory, summarizePoints,
} from '@/lib/points';
import { Minus, Plus, Search } from 'lucide-react';

const fmt = (n: number) => Math.round(n).toLocaleString('mk-MK');
const day = (d?: Date) => (d ? d.toLocaleDateString('mk-MK') : '');
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

type Status = { tone: 'red' | 'amber' | 'green'; text: string } | null;

function stateText(e: HistoryEntry): string {
  switch (e.state) {
    case 'awaiting': return 'чека испорака и плаќање';
    case 'waiting': return `на чекање до ${day(e.availableAt)}`;
    case 'active': return `важат до ${day(e.expiresAt)}`;
    case 'expired': return `истечени ${day(e.expiresAt)}`;
    case 'used': return 'искористени';
    default: return '';
  }
}

export default function LoyaltyPointsTab({ settings }: { settings: LoyaltySettings }) {
  const [email, setEmail] = useState('');
  const [user, setUser] = useState<FoundUser | null>(null);
  const [moves, setMoves] = useState<PointsMovement[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const [direction, setDirection] = useState<'add' | 'remove'>('add');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [expires, setExpires] = useState('');

  const load = async (u: FoundUser) => {
    const r = await fetchPointsMovements(supabase, u.userId);
    setMoves(r.data);
    setNow(new Date());
    if (r.error) setStatus({ tone: 'red', text: `Поените не се прочитаа: ${r.error}` });
  };

  const find = async () => {
    if (!email.trim()) return;
    setBusy(true);
    setStatus(null);
    const r = await findUserByEmail(supabase, email);
    if (r.missingTable) setStatus({ tone: 'amber', text: 'Миграцијата 015 уште не е пуштена: поени уште не постојат.' });
    else if (r.error) setStatus({ tone: 'red', text: r.error });
    else if (!r.data) {
      setUser(null);
      setMoves([]);
      setStatus({ tone: 'amber', text: 'Нема профил со таа е-пошта.' });
    } else {
      setUser(r.data);
      setExpires(isoDay(expiryFor('adjust_add', new Date(), settings)));
      await load(r.data);
    }
    setBusy(false);
  };

  const submit = async () => {
    if (!user) return;
    const n = Number(amount.trim());
    if (!Number.isInteger(n) || n <= 0) { setStatus({ tone: 'red', text: 'Внеси цел број поени, поголем од 0.' }); return; }
    if (!reason.trim()) { setStatus({ tone: 'red', text: 'Причината е задолжителна. Купувачот ја гледа во својата историја.' }); return; }
    let expiresAt: Date | undefined;
    if (direction === 'add') {
      expiresAt = new Date(`${expires}T23:59:59`);
      if (!expires || Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) {
        setStatus({ tone: 'red', text: 'Додадените поени треба да важат до датум во иднина.' });
        return;
      }
    }
    const verb = direction === 'add' ? 'Додај' : 'Одземи';
    if (!confirm(`${verb} ${fmt(n)} поени на ${user.email}?\nПричина: ${reason.trim()}`)) return;
    setBusy(true);
    const r = await adjustPoints(supabase, user.userId, direction === 'add' ? n : -n, reason.trim(), expiresAt);
    setBusy(false);
    if (r.error) { setStatus({ tone: 'red', text: r.error }); return; }
    setStatus({ tone: 'green', text: `${direction === 'add' ? 'Додадени' : 'Одземени'} ${fmt(n)} поени.` });
    setAmount('');
    setReason('');
    await load(user);
  };

  const summary = summarizePoints(moves, now);
  const history = pointsHistory(moves, now);
  const toneCls = { red: 'text-red-700', amber: 'text-amber-700', green: 'text-green-700' };

  return (
    <div>
      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4">
        <h2 className="font-bold text-slate-800 text-sm">Најди купувач</h2>
        <form
          className="mt-2 flex flex-wrap gap-2"
          onSubmit={(e) => { e.preventDefault(); find(); }}
        >
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="е-пошта на профилот"
            className="flex-1 min-w-[200px] rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
          />
          <button disabled={busy} className="px-3 py-1.5 rounded-lg bg-slate-800 text-white text-sm inline-flex items-center gap-1.5 disabled:opacity-50">
            <Search className="h-3.5 w-3.5" /> Најди
          </button>
        </form>
        {status && <p className={`text-sm mt-2 ${toneCls[status.tone]}`}>{status.text}</p>}
      </section>

      {user && (
        <>
          <p className="text-sm text-slate-600 mb-3">
            <strong className="text-slate-800">{user.email}</strong> · профил од {day(user.createdAt)}
          </p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[
              { k: 'Активни', v: `${fmt(summary.active)} ден.`, tone: 'text-indigo-700' },
              { k: 'На чекање', v: fmt(summary.pending) },
              { k: 'Истекуваат за 30 дена', v: fmt(summary.expiringSoon), tone: summary.expiringSoon ? 'text-amber-700' : undefined },
              { k: 'Истечени', v: fmt(summary.expired), tone: 'text-slate-500' },
            ].map((x) => (
              <div key={x.k} className="bg-white rounded-xl border border-slate-200 px-3 py-2 shadow-sm">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{x.k}</p>
                <p className={`text-xl font-bold tabular-nums ${x.tone ?? 'text-slate-800'}`}>{x.v}</p>
              </div>
            ))}
          </div>
          {summary.nextExpiry && (
            <p className="text-xs text-slate-500 -mt-2 mb-4">
              Следен истек: {fmt(summary.nextExpiryPoints)} поени на {day(summary.nextExpiry)}.
            </p>
          )}

          <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4">
            <h2 className="font-bold text-slate-800 text-sm">Рачна корекција</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Секоја промена останува во историјата, со причината и со тоа кој ја направил. Одземањето ги зема поените што први истекуваат.
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <div className="inline-flex rounded-lg border border-slate-300 overflow-hidden text-sm">
                {(['add', 'remove'] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDirection(d)}
                    className={`px-3 py-1.5 inline-flex items-center gap-1 ${direction === d ? (d === 'add' ? 'bg-green-600 text-white' : 'bg-red-600 text-white') : 'bg-white text-slate-700'}`}
                  >
                    {d === 'add' ? <Plus className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                    {d === 'add' ? 'Додај' : 'Одземи'}
                  </button>
                ))}
              </div>
              <label className="block">
                <span className="text-xs text-slate-600">Поени</span>
                <input
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="block w-24 rounded-lg border border-slate-300 px-2.5 py-1.5 text-right tabular-nums text-sm"
                />
              </label>
              {direction === 'add' && (
                <label className="block">
                  <span className="text-xs text-slate-600">Важат до</span>
                  <input
                    type="date"
                    value={expires}
                    onChange={(e) => setExpires(e.target.value)}
                    className="block rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                  />
                </label>
              )}
              <label className="block flex-1 min-w-[220px]">
                <span className="text-xs text-slate-600">Причина (ја гледа и купувачот)</span>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="на пр. извинување за доцна достава"
                  className="block w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm"
                />
              </label>
              <button
                type="button"
                onClick={submit}
                disabled={busy}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                Зачувај
              </button>
            </div>
          </section>

          <section className="bg-white rounded-xl border border-slate-200 shadow-sm">
            <h2 className="font-bold text-slate-800 text-sm px-4 py-3 border-b border-slate-100">Историја ({history.length})</h2>
            {history.length === 0 ? (
              <p className="px-4 py-6 text-sm text-slate-500">Уште нема поени.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-[11px] uppercase tracking-wider text-slate-500 bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left">Датум</th>
                      <th className="px-3 py-2 text-left">Движење</th>
                      <th className="px-3 py-2 text-right">Поени</th>
                      <th className="px-3 py-2 text-left">Нарачка</th>
                      <th className="px-3 py-2 text-left">Состојба</th>
                      <th className="px-3 py-2 text-left">Причина</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {history.map((e) => (
                      <tr key={e.key}>
                        <td className="px-3 py-2 whitespace-nowrap text-slate-600">{day(e.at)}</td>
                        <td className="px-3 py-2 whitespace-nowrap">
                          {HISTORY_LABEL[e.kind]}
                          {e.reversed && <span className="ml-1 text-[11px] text-slate-500">(вратени)</span>}
                        </td>
                        <td className={`px-3 py-2 text-right tabular-nums font-medium ${e.points > 0 ? 'text-green-700' : 'text-red-700'}`}>
                          {e.points > 0 ? '+' : '−'}{fmt(Math.abs(e.points))}
                        </td>
                        <td className="px-3 py-2 text-slate-600">{e.orderNumber ?? ''}</td>
                        <td className="px-3 py-2 text-slate-600 whitespace-nowrap">{stateText(e)}</td>
                        <td className="px-3 py-2 text-slate-600">{e.reason ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
