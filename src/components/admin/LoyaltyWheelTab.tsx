'use client';

/**
 * The wheel's prizes, for the owner (Task 13.10): what is on it, each chance,
 * daily and monthly limits, the average points a spin hands out, a dry run of
 * 1.000 spins that writes nothing, and what was won this month. The switch
 * that puts the wheel on the site is in "Поставки".
 */

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { mkNumber } from '@/lib/mk-format';
import { PRIZE_KIND_LABEL, PrizeKind, WheelPrize, chances, expectedPoints, fetchPrizes, prizeProblems, savePrize, simulate } from '@/lib/wheel';
import { Dices, Plus } from 'lucide-react';

interface Draft { label: string; kind: PrizeKind; value: string; weight: string; dailyCap: string; monthlyCap: string; sort: string; active: boolean }

const toDraft = (p: WheelPrize): Draft => ({
  label: p.label, kind: p.kind, value: String(p.value), weight: String(p.weight),
  dailyCap: p.dailyCap === undefined ? '' : String(p.dailyCap), monthlyCap: p.monthlyCap === undefined ? '' : String(p.monthlyCap),
  sort: String(p.sort), active: p.active,
});
const num = (s: string) => (s.trim() === '' ? undefined : Number(s.trim().replace(',', '.')));
const fromDraft = (d: Draft, id?: string): WheelPrize => ({
  id, label: d.label, kind: d.kind, value: d.kind === 'free_shipping' ? 0 : num(d.value) ?? NaN, weight: num(d.weight) ?? NaN,
  dailyCap: num(d.dailyCap), monthlyCap: num(d.monthlyCap), sort: num(d.sort) ?? 0, active: d.active,
});

async function readAll() {
  const prizes = await fetchPrizes(supabase);
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const spins = await supabase.from('wheel_spins').select('prize_label, created_at').gte('created_at', start.toISOString());
  return { prizes, spins: (spins.data ?? []) as Array<{ prize_label: string; created_at: string }> };
}

export default function LoyaltyWheelTab({ wheelEnabled }: { wheelEnabled: boolean }) {
  const [prizes, setPrizes] = useState<WheelPrize[]>([]);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [spins, setSpins] = useState<Array<{ prize_label: string; created_at: string }>>([]);
  const [missing, setMissing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState<{ tone: 'red' | 'green'; text: string } | null>(null);
  const [reads, setReads] = useState(0);
  const [sim, setSim] = useState<Map<string, number> | null>(null);

  useEffect(() => {
    let live = true;
    readAll().then(({ prizes: r, spins: s }) => {
      if (!live) return;
      setMissing(r.missingTable);
      setPrizes(r.data);
      setDrafts(Object.fromEntries(r.data.map((p) => [p.id!, toDraft(p)])));
      setSpins(s);
      setLoaded(true);
    });
    return () => { live = false; };
  }, [reads]);

  const active = useMemo(() => chances(prizes.filter((p) => p.active)), [prizes]);
  const today = new Date().toDateString();
  const won = (label: string, todayOnly: boolean) =>
    spins.filter((s) => s.prize_label === label && (!todayOnly || new Date(s.created_at).toDateString() === today)).length;

  const save = async (key: string) => {
    const d = drafts[key];
    const p = fromDraft(d, key.startsWith('new-') ? undefined : key);
    const problems = prizeProblems(p);
    if (problems.length) { setMessage({ tone: 'red', text: problems.join(' ') }); return; }
    const r = await savePrize(supabase, p);
    if (r.error) { setMessage({ tone: 'red', text: r.error }); return; }
    setMessage({ tone: 'green', text: `Зачувано: ${p.label}.` });
    setSim(null);
    setReads((n) => n + 1);
  };
  const set = (key: string, patch: Partial<Draft>) => setDrafts({ ...drafts, [key]: { ...drafts[key], ...patch } });
  const add = () => setDrafts({ ...drafts, [`new-${Date.now()}`]: { label: '', kind: 'points', value: '10', weight: '5', dailyCap: '', monthlyCap: '', sort: String(prizes.length + 1), active: true } });

  if (!loaded) return <p className="text-sm text-slate-500">Се вчитува…</p>;
  if (missing) {
    return <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">Миграцијата <strong>018</strong> уште не е пуштена: тркалото уште не постои.</p>;
  }

  const cell = 'rounded border border-slate-300 px-2 py-1 text-sm';
  return (
    <div className="space-y-4">
      <p className={`rounded-xl border px-4 py-3 text-sm ${wheelEnabled ? 'border-green-200 bg-green-50 text-green-900' : 'border-slate-200 bg-white text-slate-700'}`}>
        Тркалото е <strong>{wheelEnabled ? 'вклучено' : 'исклучено'}</strong> на сајтот (прекинувачот е во „Поставки“).
        {wheelEnabled ? ' Купувачите го гледаат на /wheel и на својот профил.' : ' Додека е исклучено, не се гледа никаде.'}
      </p>

      {message && <p className={`text-sm ${message.tone === 'red' ? 'text-red-600' : 'text-green-700'}`}>{message.text}</p>}

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100">
          <h2 className="font-bold text-slate-800 text-sm flex-1">Награди</h2>
          <button type="button" onClick={add} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm inline-flex items-center gap-1"><Plus className="h-3.5 w-3.5" /> Нова награда</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-slate-500 bg-slate-50">
              <tr>
                <th className="px-2 py-2 text-left">Ред</th>
                <th className="px-2 py-2 text-left">Натпис</th>
                <th className="px-2 py-2 text-left">Вид</th>
                <th className="px-2 py-2 text-right">Вредност</th>
                <th className="px-2 py-2 text-right">Тежина</th>
                <th className="px-2 py-2 text-right">Шанса</th>
                <th className="px-2 py-2 text-right">Лимит ден / мес</th>
                <th className="px-2 py-2 text-right">Освоени денес / месец</th>
                <th className="px-2 py-2">Вкл.</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {Object.entries(drafts).map(([key, d]) => {
                const chance = active.find((a) => a.id === key)?.chance;
                return (
                  <tr key={key} className={d.active ? '' : 'opacity-60'}>
                    <td className="px-2 py-1.5"><input value={d.sort} onChange={(e) => set(key, { sort: e.target.value })} className={`${cell} w-12 text-right`} /></td>
                    <td className="px-2 py-1.5"><input value={d.label} onChange={(e) => set(key, { label: e.target.value })} className={`${cell} w-40`} /></td>
                    <td className="px-2 py-1.5">
                      <select value={d.kind} onChange={(e) => set(key, { kind: e.target.value as PrizeKind })} className={cell}>
                        {(Object.keys(PRIZE_KIND_LABEL) as PrizeKind[]).map((k) => <option key={k} value={k}>{PRIZE_KIND_LABEL[k]}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {d.kind !== 'free_shipping' && <input value={d.value} onChange={(e) => set(key, { value: e.target.value })} className={`${cell} w-16 text-right`} />}
                    </td>
                    <td className="px-2 py-1.5 text-right"><input value={d.weight} onChange={(e) => set(key, { weight: e.target.value })} className={`${cell} w-16 text-right`} /></td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{chance !== undefined ? `${mkNumber(chance, 1)}%` : '—'}</td>
                    <td className="px-2 py-1.5 text-right whitespace-nowrap">
                      <input value={d.dailyCap} placeholder="—" onChange={(e) => set(key, { dailyCap: e.target.value })} className={`${cell} w-12 text-right`} />{' / '}
                      <input value={d.monthlyCap} placeholder="—" onChange={(e) => set(key, { monthlyCap: e.target.value })} className={`${cell} w-12 text-right`} />
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{d.label ? `${won(d.label, true)} / ${won(d.label, false)}` : ''}</td>
                    <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={d.active} onChange={(e) => set(key, { active: e.target.checked })} /></td>
                    <td className="px-2 py-1.5"><button type="button" onClick={() => save(key)} className="px-2.5 py-1 rounded bg-indigo-600 text-white text-xs">Зачувај</button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-3 text-xs text-slate-500">
          Шансата е делот од тежината меѓу вклучените награди. Награда на лимит привремено излегува од тркалото, а другите ја делат нејзината шанса.
          Купоните од тркалото и рокот на поените се во „Поставки“.
        </p>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
        <h2 className="font-bold text-slate-800 text-sm">Колку чини едно вртење</h2>
        <p className="text-sm text-slate-700 mt-1">
          Просечно <strong>{mkNumber(expectedPoints(prizes.filter((p) => p.active)), 1)} поени</strong> по вртење, плус купоните кога ќе се искористат.
          Поените од тркалото истекуваат побрзо (Поставки), па голем дел никогаш не се трошат.
        </p>
        <button
          type="button"
          onClick={() => setSim(simulate(prizes.filter((p) => p.active), 1000))}
          className="mt-3 px-3 py-2 rounded-lg border border-slate-300 text-sm inline-flex items-center gap-1.5"
        >
          <Dices className="h-4 w-4" /> 1.000 пробни вртења (ништо не се запишува)
        </button>
        {sim && (
          <ul className="mt-3 text-sm grid grid-cols-1 sm:grid-cols-2 gap-x-6">
            {active.map((p) => (
              <li key={p.id} className="flex justify-between py-0.5">
                <span>{p.label}</span>
                <span className="tabular-nums text-slate-600">{sim.get(p.label) ?? 0} <span className="text-slate-400">(очекувано {mkNumber(p.chance * 10)})</span></span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
