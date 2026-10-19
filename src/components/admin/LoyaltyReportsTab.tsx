'use client';

/**
 * The loyalty programme in numbers, for the owner (Task 13.12): what it owes,
 * what it cost each month next to the gross of the orders it touched, coupons
 * by where they came from, and the wheel.
 */

import { useEffect, useState } from 'react';
import { accountFetch } from '@/lib/account-client';
import { mkDate, mkNumber } from '@/lib/mk-format';
import { SOURCE_LABEL } from '@/lib/coupons';
import type { LoyaltyReport } from '@/lib/loyalty-report';

const n = (v: number) => mkNumber(v);
const MONTHS = ['јан', 'фев', 'мар', 'апр', 'мај', 'јун', 'јул', 'авг', 'сеп', 'окт', 'ное', 'дек'];
const monthLabel = (m: string) => `${MONTHS[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;

export default function LoyaltyReportsTab() {
  const [report, setReport] = useState<LoyaltyReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reads, setReads] = useState(0);

  useEffect(() => {
    let live = true;
    accountFetch<LoyaltyReport>('/api/admin/loyalty-report').then((r) => {
      if (!live) return;
      if (r.error) setError(r.error);
      else { setReport(r.data!); setError(null); }
    });
    return () => { live = false; };
  }, [reads]);

  if (error) {
    return (
      <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">
        {error} <button type="button" onClick={() => setReads((x) => x + 1)} className="underline">Пробај повторно</button>
      </p>
    );
  }
  if (!report) return <p className="text-sm text-slate-500">Се пресметува…</p>;

  const r = report;
  const months = [...r.months].reverse();
  const total = r.months.reduce(
    (a, m) => ({ cost: a.cost + m.cost, gross: a.gross + m.memberGross, revenue: a.revenue + m.memberRevenue, orders: a.orders + m.memberOrders }),
    { cost: 0, gross: 0, revenue: 0, orders: 0 },
  );
  const tile = 'bg-white rounded-xl border border-slate-200 px-3 py-2 shadow-sm';
  const k = 'text-[10px] font-semibold text-slate-500 uppercase tracking-wider';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className={tile}>
          <p className={k}>Обврска: активни поени</p>
          <p className="text-2xl font-bold tabular-nums text-indigo-700">{n(r.liability.active)} ден.</p>
        </div>
        <div className={tile}>
          <p className={k}>На чекање</p>
          <p className="text-2xl font-bold tabular-nums text-slate-800">{n(r.liability.pending)} ден.</p>
        </div>
        <div className={tile}>
          <p className={k}>Истекуваат за 30 дена</p>
          <p className="text-2xl font-bold tabular-nums text-amber-700">{n(r.liability.expiringSoon)}</p>
          {r.liability.nextExpiry && <p className="text-[11px] text-slate-500">прв истек {mkDate(r.liability.nextExpiry)}</p>}
        </div>
        <div className={tile}>
          <p className={k}>Купувачи со профил</p>
          <p className="text-2xl font-bold tabular-nums text-slate-800">{n(r.members.total)}</p>
          <p className="text-[11px] text-slate-500">{n(r.members.withOrders)} со нарачка · {n(r.members.fromWheel)} од тркалото</p>
        </div>
      </div>
      <p className="text-xs text-slate-500">
        Обврската е тоа што купувачите уште можат да го потрошат (1 поен = 1 ден.). Не е трошок додека не се потроши (D-031);
        поените на чекање стануваат обврска по испораката, а дел од нив истекуваат непотрошени.
      </p>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <h2 className="font-bold text-slate-800 text-sm px-4 py-3 border-b border-slate-100">Месец по месец</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-[11px] uppercase tracking-wider text-slate-500 bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left">Месец</th>
                <th className="px-3 py-2 text-right">Нарачки со профил</th>
                <th className="px-3 py-2 text-right">Промет</th>
                <th className="px-3 py-2 text-right">Бруто</th>
                <th className="px-3 py-2 text-right">Поени</th>
                <th className="px-3 py-2 text-right">Купони</th>
                <th className="px-3 py-2 text-right">Достава</th>
                <th className="px-3 py-2 text-right">Чинеше</th>
                <th className="px-3 py-2 text-right">% од бруто</th>
                <th className="px-3 py-2 text-right">Заработени</th>
                <th className="px-3 py-2 text-right">Истечени</th>
                <th className="px-3 py-2 text-right">Регистрации</th>
                <th className="px-3 py-2 text-right">Вртења</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 tabular-nums">
              {months.map((m) => (
                <tr key={m.month}>
                  <td className="px-3 py-2 whitespace-nowrap">{monthLabel(m.month)}</td>
                  <td className="px-3 py-2 text-right">{n(m.memberOrders)}</td>
                  <td className="px-3 py-2 text-right">{n(m.memberRevenue)}</td>
                  <td className="px-3 py-2 text-right">{n(m.memberGross)}</td>
                  <td className="px-3 py-2 text-right">{n(m.pointsSpent)}</td>
                  <td className="px-3 py-2 text-right">{n(m.couponDiscount)}</td>
                  <td className="px-3 py-2 text-right">{n(m.shippingWaived)}</td>
                  <td className="px-3 py-2 text-right font-semibold">{n(m.cost)}</td>
                  <td className={`px-3 py-2 text-right ${m.costShare !== null && m.costShare > 0.25 ? 'text-red-700 font-semibold' : ''}`}>
                    {m.costShare === null ? '—' : `${mkNumber(m.costShare * 100, 1)}%`}
                  </td>
                  <td className="px-3 py-2 text-right">{n(m.pointsEarned)}</td>
                  <td className="px-3 py-2 text-right">{n(m.pointsExpired)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {n(m.registrations)}{m.registrationsFromWheel ? <span className="text-slate-500"> ({n(m.registrationsFromWheel)} тркало)</span> : ''}
                  </td>
                  <td className="px-3 py-2 text-right">{n(m.wheelSpins)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="px-4 py-3 text-xs text-slate-500">
          „Бруто“ е по попустите од програмата, на нарачките со профил што не се откажани. „Чинеше“ е потрошените поени, купоните и
          доставата од купон: попуст што веќе е во цената на парчето (D-031). „% од бруто“ е тој попуст наспроти брутото пред него;
          над 25% е означено. Вкупно досега: {n(total.orders)} нарачки, {n(total.revenue)} ден. промет, {n(total.gross)} бруто, програмата чинеше {n(total.cost)}.
        </p>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <h2 className="font-bold text-slate-800 text-sm px-4 py-3 border-b border-slate-100">Купони по извор</h2>
          {r.coupons.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">Уште нема купони.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-slate-500 bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left">Извор</th>
                  <th className="px-3 py-2 text-right">Издадени</th>
                  <th className="px-3 py-2 text-right">Искористени</th>
                  <th className="px-3 py-2 text-right">Попуст</th>
                  <th className="px-3 py-2 text-right">Достава</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 tabular-nums">
                {r.coupons.map((c) => (
                  <tr key={c.source}>
                    <td className="px-3 py-2">{SOURCE_LABEL[c.source]}</td>
                    <td className="px-3 py-2 text-right">{n(c.issued)}</td>
                    <td className="px-3 py-2 text-right">{n(c.used)}{c.issued ? <span className="text-slate-400"> ({mkNumber((c.used / c.issued) * 100)}%)</span> : ''}</td>
                    <td className="px-3 py-2 text-right">{n(c.discount)}</td>
                    <td className="px-3 py-2 text-right">{n(c.shippingWaived)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="bg-white rounded-xl border border-slate-200 shadow-sm">
          <h2 className="font-bold text-slate-800 text-sm px-4 py-3 border-b border-slate-100">Тркало на среќа</h2>
          {r.wheel.spins === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">Уште нема вртења.</p>
          ) : (
            <div className="p-4 text-sm space-y-2">
              <p>
                <strong>{n(r.wheel.spins)}</strong> вртења ({n(r.wheel.spinsThisMonth)} овој месец) · <strong>{n(r.members.fromWheel)}</strong> регистрации од тркалото
              </p>
              <p className="text-slate-600">
                Дадени {n(r.wheel.pointsGiven)} поени и {n(r.wheel.couponsGiven)} купони, од кои искористени {n(r.wheel.couponsUsed)}.
              </p>
              <ul className="divide-y divide-slate-100">
                {r.wheel.byPrize.map((p) => (
                  <li key={p.label} className="py-1 flex justify-between tabular-nums">
                    <span>{p.label}</span>
                    <span className="text-slate-600">{n(p.total)} <span className="text-slate-400">({n(p.thisMonth)} овој месец)</span></span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </div>
      <p className="text-[11px] text-slate-400">Пресметано {mkDate(r.generatedAt)}. <button type="button" onClick={() => { setReport(null); setReads((x) => x + 1); }} className="underline">Освежи</button></p>
    </div>
  );
}
