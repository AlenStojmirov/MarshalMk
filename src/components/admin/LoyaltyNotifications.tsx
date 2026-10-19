'use client';

/**
 * The customer e-mails, for the owner (Task 13.11): what would go out today
 * (a dry run that sends nothing), sending now instead of waiting for the
 * daily run, and the latest messages sent.
 */

import { useEffect, useState } from 'react';
import { Mail, Send } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { accountFetch } from '@/lib/account-client';
import { mkDate } from '@/lib/mk-format';
import type { NoticeKind, RunResult } from '@/lib/notifications-server';

const KIND_LABEL: Record<NoticeKind, string> = {
  welcome: 'Добредојде',
  points_first: 'Поени истекуваат (прв потсетник)',
  points_last: 'Поени истекуваат (последен)',
  coupon_expiring: 'Купон истекува',
  birthday: 'Роденден',
};

export default function LoyaltyNotifications() {
  const [result, setResult] = useState<RunResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recent, setRecent] = useState<Array<{ kind: NoticeKind; sent_at: string; message_id: string | null }> | null>(null);
  const [reads, setReads] = useState(0);

  useEffect(() => {
    let live = true;
    supabase.from('customer_notifications').select('kind, sent_at, message_id').order('sent_at', { ascending: false }).limit(30)
      .then(({ data, error: e }) => { if (live) setRecent(e ? [] : ((data ?? []) as typeof recent)); });
    return () => { live = false; };
  }, [reads]);

  const run = async (dryRun: boolean) => {
    if (!dryRun && !confirm('Да се пратат сега сите пораки што се на ред денес?')) return;
    setBusy(true);
    setError(null);
    const r = await accountFetch<RunResult>('/api/cron/notifications', { method: 'POST', body: JSON.stringify({ dryRun }) });
    setBusy(false);
    if (r.error) setError(r.error);
    else { setResult(r.data!); setReads((n) => n + 1); }
  };

  return (
    <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <h2 className="font-bold text-slate-800 text-sm flex items-center gap-2"><Mail className="h-4 w-4" /> Е-пошта до купувачите</h2>
      <p className="text-xs text-slate-500 mt-0.5">
        Секој ден во 9 часот (Vercel): поени што истекуваат за 30 и за 7 дена, купон што истекува, роденден, и добредојде ако не отишло
        при регистрација. Ниедна порака не оди двапати. Роденденската оди само до тие што сакаат понуди; подарокот го добиваат сите.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => run(true)} className="px-3 py-2 rounded-lg border border-slate-300 text-sm disabled:opacity-50">
          Што би отишло денес (проба)
        </button>
        <button type="button" disabled={busy} onClick={() => run(false)} className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm inline-flex items-center gap-1.5 disabled:opacity-50">
          <Send className="h-3.5 w-3.5" /> Прати сега
        </button>
      </div>
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      {result && (
        <div className="mt-3 text-sm">
          {result.dryRun ? (
            result.planned.length === 0 ? <p className="text-slate-600">Денес нема ништо за праќање.</p> : (
              <ul className="space-y-1">
                {result.planned.map((p, i) => (
                  <li key={i} className="text-xs"><span className="font-medium">{KIND_LABEL[p.kind]}</span> · {p.email} · „{p.subject}“</li>
                ))}
              </ul>
            )
          ) : (
            <p className="text-slate-700">
              Пратени {result.sent}{result.already ? `, веќе пратени порано ${result.already}` : ''}{result.birthdayGifts ? `, роденденски подароци ${result.birthdayGifts}` : ''}.
              {result.capped && ' Застанато на дневниот лимит: остатокот оди утре.'}
            </p>
          )}
          {result.skipped > 0 && <p className="text-xs text-slate-500 mt-1">Прескокнати {result.skipped}: профил без потврдена е-пошта.</p>}
          {result.failed.map((f, i) => <p key={i} className="text-xs text-red-600">{f.email}: {f.error}</p>)}
        </div>
      )}
      {recent && recent.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Последни пратени</p>
          <ul className="mt-1 text-xs text-slate-600 space-y-0.5">
            {recent.map((n, i) => <li key={i}>{mkDate(n.sent_at)} · {KIND_LABEL[n.kind]}{n.message_id ? '' : ' (без потврда од Brevo)'}</li>)}
          </ul>
        </div>
      )}
    </section>
  );
}
