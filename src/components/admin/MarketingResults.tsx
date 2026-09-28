'use client';

/**
 * What worked (Task 10.7): the month in numbers, the posts worth repeating,
 * and the answer to every question the posts were testing.
 *
 * The month review reads the chosen month; the tests read the last
 * TEST_WINDOW_DAYS, because a question needs a few posts on each side and a
 * month rarely holds enough of them. Nothing here is read from Meta: the
 * numbers are the ones typed into each post after it ran, and online orders
 * come from the posts' tracked links (D-025).
 */

import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, FlaskConical, Trophy } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { POST_KIND_LABEL } from '@/lib/marketing';
import { campaignOf } from '@/lib/attribution';
import { MONTH_NAME, addDays, dayOf, monthDays, type PlanItem } from '@/lib/marketing-calendar';
import { fetchPlan } from '@/lib/marketing-plan-db';
import { fetchCampaignOrders, type CampaignOrders } from '@/lib/marketing-results';
import { MIN_POSTS_PER_SIDE, reviewMonth, type HypothesisResult, type SideResult } from '@/lib/marketing-tests';
import type { CopyKind } from '@/lib/post-copy';

const TEST_WINDOW_DAYS = 90;
const KIND_LABEL: Record<CopyKind, string> = { ...POST_KIND_LABEL, trust: 'Доверба' };
const n0 = (x: number) => Math.round(x).toLocaleString('de-DE');
const n1 = (x: number) => (Math.round(x * 10) / 10).toLocaleString('de-DE');

export default function MarketingResults() {
  const now = new Date();
  const [{ y, m }, setCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [month, setMonth] = useState<PlanItem[]>([]);
  const [recent, setRecent] = useState<PlanItem[]>([]);
  const [orders, setOrders] = useState<CampaignOrders>({});
  const [state, setState] = useState<{ loading: boolean; missing: boolean }>({ loading: true, missing: false });

  const days = useMemo(() => monthDays(y, m), [y, m]);
  const today = dayOf(new Date());
  const windowFrom = addDays(today, -TEST_WINDOW_DAYS);

  useEffect(() => {
    let live = true;
    const since = days[0] < windowFrom ? days[0] : windowFrom;
    Promise.all([
      fetchPlan(supabase, days[0], days[days.length - 1]),
      fetchPlan(supabase, windowFrom, today),
      fetchCampaignOrders(since),
    ]).then(([mo, wi, or]) => {
      if (!live) return;
      setMonth(mo.data);
      setRecent(wi.data);
      setOrders(or);
      setState({ loading: false, missing: mo.missingTable });
    });
    return () => {
      live = false;
    };
  }, [days, windowFrom, today]);

  const ordersOf = useMemo(() => (i: PlanItem) => orders[campaignOf(i.id)]?.orders ?? 0, [orders]);
  const review = useMemo(() => reviewMonth(month, ordersOf), [month, ordersOf]);
  const tests = useMemo(() => reviewMonth(recent, ordersOf).results, [recent, ordersOf]);

  const move = (delta: number) => {
    const d = new Date(y, m + delta, 1);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
    setState((s) => ({ ...s, loading: true }));
  };

  if (state.missing) {
    return <p className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">Резултатите чекаат миграција 012 и 013.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={() => move(-1)} className="p-2 rounded-lg border border-slate-300 hover:bg-slate-50" aria-label="Претходен месец">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h2 className="text-lg font-semibold text-slate-900 w-40 text-center">{MONTH_NAME[m]} {y}</h2>
        <button onClick={() => move(1)} className="p-2 rounded-lg border border-slate-300 hover:bg-slate-50" aria-label="Следен месец">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { k: 'Објавени', v: `${review.posted} / ${review.planned}`, hint: 'од планираните' },
          { k: 'Со резултати', v: String(review.measured), hint: 'внесени бројки' },
          { k: 'Дофат', v: n0(review.reach), hint: 'вкупно' },
          { k: 'Пораки', v: n0(review.messages), hint: 'најблиску до продажба' },
          { k: 'Дошле во дуќан', v: n0(review.storeVisits), hint: 'кажале дека ја виделе' },
          { k: 'Online нарачки', v: n0(review.orders), hint: 'по следлив линк' },
        ].map((t) => (
          <div key={t.k} className="bg-white rounded-xl border border-slate-200 shadow-sm p-3">
            <p className="text-xs text-slate-500">{t.k}</p>
            <p className="text-xl font-bold text-slate-900 tabular-nums">{state.loading ? '…' : t.v}</p>
            <p className="text-[11px] text-slate-400">{t.hint}</p>
          </div>
        ))}
      </div>

      {!state.loading && review.measured === 0 && (
        <p className="p-3 rounded-lg bg-slate-50 border border-slate-200 text-sm text-slate-600">
          Нема внесени резултати за овој месец. Кога објавата е објавена, отвори ја во календарот, означи ја „Објавено“ и по
          2–3 дена внеси ги бројките од Insights (дофат, зачувувања, пораки).
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-900 mb-2 flex items-center gap-2"><Trophy className="h-4 w-4 text-amber-500" /> Што да се повтори</h3>
          {review.best.length === 0 ? (
            <p className="text-sm text-slate-500">Уште нема објава со пораки или нарачки.</p>
          ) : (
            <ol className="space-y-1.5 text-sm">
              {review.best.map(({ item, score }) => (
                <li key={item.id} className="flex gap-2">
                  <span className="shrink-0 text-xs text-slate-400 tabular-nums w-10">{Number(item.day.slice(8))}.{Number(item.day.slice(5, 7))}.</span>
                  <span className="min-w-0">
                    <span className="font-medium text-slate-800">{KIND_LABEL[item.kind]}</span> · {item.title || '—'}
                    <span className="block text-xs text-slate-500">
                      {score} пораки и нарачки{item.reach !== null ? ` · дофат ${n0(item.reach)}` : ''}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-900 mb-2">Кој вид објава продава</h3>
          {review.byKind.length === 0 ? (
            <p className="text-sm text-slate-500">Кога ќе има резултати, тука се гледа кој вид носи најмногу пораки и нарачки по објава.</p>
          ) : (
            <ul className="space-y-1.5 text-sm">
              {review.byKind.map((k) => (
                <li key={k.kind} className="flex items-center gap-2">
                  <span className="w-40 text-slate-700">{KIND_LABEL[k.kind]}</span>
                  <span className="font-semibold tabular-nums">{n1(k.perPost)}</span>
                  <span className="text-xs text-slate-400">по објава · {k.measured} објави</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <h3 className="font-semibold text-slate-900 mb-1 flex items-center gap-2"><FlaskConical className="h-4 w-4 text-violet-600" /> Тестови</h3>
        <p className="text-xs text-slate-500 mb-3">
          Последните {TEST_WINDOW_DAYS} дена. Победник има кога секоја страна има барем {MIN_POSTS_PER_SIDE} објави со резултати
          и едната води со 20% или повеќе. Тест се задава во календарот, кај објавата.
        </p>
        {tests.length === 0 ? (
          <p className="text-sm text-slate-500">Уште нема тест. Предлог за почеток: „На човек или на закачалка?“, три објави од секое.</p>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {tests.map((t) => <TestCard key={t.hypothesis.key} t={t} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function Side({ label, s, win }: { label: string; s: SideResult; win: boolean }) {
  return (
    <div className={`p-2 rounded-lg ${win ? 'bg-emerald-50 ring-1 ring-emerald-300' : 'bg-slate-50'}`}>
      <p className="text-xs font-medium text-slate-700 mb-1">{label}</p>
      <p className="text-[11px] text-slate-500">{s.measured} од {s.posts} објави со резултати</p>
      <p className="text-xs text-slate-700 tabular-nums">пораки {n1(s.avgMessages)} · дофат {n0(s.avgReach)} · нарачки {s.orders}</p>
    </div>
  );
}

function TestCard({ t }: { t: HypothesisResult }) {
  const tone =
    t.verdict === 'early' ? 'border-slate-200 bg-slate-50 text-slate-600'
    : t.verdict === 'tie' ? 'border-blue-200 bg-blue-50 text-blue-800'
    : 'border-emerald-200 bg-emerald-50 text-emerald-800';
  return (
    <div className="rounded-xl border border-slate-200 p-3">
      <p className="font-medium text-slate-900 text-sm mb-2">{t.hypothesis.question}</p>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <Side label={`A: ${t.hypothesis.a}`} s={t.a} win={t.verdict === 'a'} />
        <Side label={`B: ${t.hypothesis.b}`} s={t.b} win={t.verdict === 'b'} />
      </div>
      <p className={`p-2 rounded-lg border text-xs ${tone}`}>{t.message}</p>
    </div>
  );
}
