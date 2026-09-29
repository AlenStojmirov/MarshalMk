'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Target } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { den } from '@/lib/marketing';
import { AD_BUDGET, type Pace, type PaceForMarketing, type PaceStatus } from '@/lib/break-even';

type Answer = { role: 'admin'; pace: Pace } | { role: 'marketing'; pace: PaceForMarketing };

const STATUS_LABEL: Record<PaceStatus, string> = {
  ahead: 'Пред планот',
  on: 'По план',
  behind: 'Заостанува',
};
const STATUS_TONE: Record<PaceStatus, string> = {
  ahead: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  on: 'bg-blue-50 text-blue-700 border-blue-200',
  behind: 'bg-rose-50 text-rose-700 border-rose-200',
};
const BAR_TONE: Record<PaceStatus, string> = { ahead: 'bg-emerald-500', on: 'bg-blue-500', behind: 'bg-rose-500' };

const pct = (x: number) => `${Math.round(x * 100)}%`;

/**
 * How far this month is from zero (Task 10.5), from /api/marketing/pace. The
 * admin sees the denars; marketing sees how far along the month is, whether it
 * is ahead or behind, and what to do about it (D-021).
 */
export default function PaceTile() {
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    (async () => {
      const { data } = await supabase.auth.getSession();
      const res = await fetch('/api/marketing/pace', {
        headers: { Authorization: `Bearer ${data.session?.access_token ?? ''}` },
      });
      const json = await res.json().catch(() => ({}));
      if (!live) return;
      if (!res.ok) setError(json.error ?? `Грешка ${res.status}`);
      else setAnswer(json as Answer);
    })().catch((e: Error) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, []);

  if (error) return <p className="mb-4 text-xs text-rose-700">Цел до нула: {error}</p>;
  if (!answer) return <div className="mb-4 h-24 rounded-xl bg-slate-100 animate-pulse" />;

  const p = answer.pace;
  const fill = Math.min(1, p.progress);

  return (
    <div className="mb-4 bg-white rounded-xl border border-slate-200 shadow-sm p-4">
      <div className="flex flex-wrap items-center gap-2 mb-2">
        <Target className="h-5 w-5 text-pink-600" />
        <h2 className="font-semibold text-slate-900">Овој месец до нула</h2>
        <span className={`px-2 py-0.5 rounded-full border text-xs font-medium ${STATUS_TONE[p.status]}`}>{STATUS_LABEL[p.status]}</span>
        <span className="ml-auto text-xs text-slate-500 tabular-nums">ден {p.day} од {p.daysInMonth}</span>
      </div>

      {/* The bar is the month's gross against zero; the mark is where it should be by today. */}
      <div className="relative h-3 rounded-full bg-slate-100 overflow-hidden" title={`${pct(p.progress)} од нулата · денес треба ${pct(p.expected)}`}>
        <div className={`h-full ${BAR_TONE[p.status]}`} style={{ width: `${fill * 100}%` }} />
        <div className="absolute top-0 h-full w-0.5 bg-slate-800" style={{ left: `${Math.min(1, p.expected) * 100}%` }} />
      </div>
      <p className="mt-1.5 text-xs text-slate-600">
        <strong>{pct(p.progress)}</strong> од нулата · до денес требаше {pct(p.expected)}
      </p>

      {answer.role === 'admin' && <AdminDetail p={answer.pace} />}
      {answer.role === 'marketing' && (
        <p className="mt-1 text-xs text-slate-500">
          {answer.pace.adBudget !== null && answer.pace.adSpend !== null
            ? `Реклами овој месец: ${den(answer.pace.adSpend)} од ${den(answer.pace.adBudget)}`
            : `Буџетот за реклами од ${den(AD_BUDGET)} месечно почнува од ноември.`}
        </p>
      )}

      <p className="mt-2 text-sm text-slate-700">{p.advice}</p>
    </div>
  );
}

function AdminDetail({ p }: { p: Pace }) {
  const c = p.costs;
  return (
    <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
      <div>
        <p className="text-slate-500">Бруто профит</p>
        <p className="font-semibold text-slate-900 tabular-nums">{den(p.gross)}</p>
        <p className="text-slate-400">од {den(c.target)}</p>
      </div>
      <div>
        <p className="text-slate-500">Фалат</p>
        <p className="font-semibold text-slate-900 tabular-nums">{den(p.gap)}</p>
        <p className="text-slate-400">≈ {p.unitsToGo} парч. по {den(p.grossPerUnit)}</p>
      </div>
      <div>
        <p className="text-slate-500">Со ова темпо до крајот</p>
        <p className="font-semibold text-slate-900 tabular-nums">{den(p.projected)}</p>
        <p className="text-slate-400">{p.units} парч. продадени</p>
      </div>
      <div>
        <p className="text-slate-500">{p.adBudgetActive ? 'Реклами' : 'Маркетинг'}</p>
        <p className="font-semibold text-slate-900 tabular-nums">
          {p.adBudgetActive ? `${den(c.adSpend)} / ${den(AD_BUDGET)}` : den(c.adSpend)}
        </p>
        <p className="text-slate-400">
          {p.adBudgetActive
            ? `се исплати ако донесе ${p.adBreakEvenUnits} парч.`
            : `реклами и плата заедно; буџетот од ${den(AD_BUDGET)} почнува од ноември`}
        </p>
      </div>
      <p className="col-span-2 sm:col-span-4 text-slate-500">
        {c.fromMonthlyTotal
          ? 'Трошоци: месечниот збир од Финансии, рекламите се во него.'
          : c.baseKnown
            ? `Трошоци: ${den(c.base)} внесени + ${den(c.adSpend)} ${p.adBudgetActive ? 'реклами' : 'маркетинг'}.`
            : c.incomplete
              ? `Трошоците се непотполни (внесени ${den(c.entered)}, фали кирија или плати), па се користи ${den(c.base)}. `
              : `Трошоците не се внесени, па се користи ${den(c.base)}. `}
        {!c.baseKnown && (
          <Link href="/admin/finance" className="text-blue-600 hover:text-blue-700 underline">Внеси ги во Финансии</Link>
        )}
        {!c.fromMonthlyTotal && ' Рекламите се внесуваат под „Маркетинг (реклами)“, а платата на вработениот за маркетинг под „Плати“.'}
        {p.estimatedUnits > 0 && ` ${p.estimatedUnits} парч. без набавна цена се проценети по маржата од годината.`}
      </p>
    </div>
  );
}
