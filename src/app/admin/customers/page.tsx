'use client';

/**
 * Online customers — Tasks 7.1, 7.2 and 7.4 on one screen, because all three
 * read the same thing: who ordered, and how it ended.
 *
 *  - Repeat customers (7.1): a person is their normalised phone number.
 *  - Refusals (7.2): how orders ended, overall and along the cuts that would
 *    point at a cause — courier or pickup, order size, city, first order or not.
 *  - Contact list (7.4): numbers to export for a Viber broadcast, filtered, with
 *    an opt-out that keeps a number off every list for good.
 *
 * Online only. The shop counter does not record who bought, so an in-store
 * regular is invisible here, and every figure says "online" for that reason.
 * The logic is in `src/lib/customers.ts`.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useProducts } from '@/hooks/useProducts';
import { getOrders } from '@/lib/orders';
import { supabase } from '@/lib/supabase';
import { Order } from '@/types';
import {
  Customer, OutcomeBucket, buildCustomers, outcomeStats, repeatStats,
} from '@/lib/customers';
import { ArrowLeft, Download, ClipboardCopy, Users, AlertTriangle, BellOff } from 'lucide-react';

const fmt = (n: number) => Math.round(n).toLocaleString('mk-MK');
const pc = (n: number | null) => (n === null ? '—' : `${Math.round(n * 100)}%`);
const DAY = 86_400_000;

type Segment = 'all' | 'repeat' | 'paid' | 'lapsed' | 'category';

function CustomersView() {
  const { products } = useProducts();
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [optout, setOptout] = useState<Set<string>>(new Set());
  // Null until known; false when migration 006 has not run yet.
  const [optoutReady, setOptoutReady] = useState<boolean | null>(null);
  const [segment, setSegment] = useState<Segment>('all');
  const [category, setCategory] = useState('');
  const [copied, setCopied] = useState(false);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    getOrders().then(setOrders).catch(() => setOrders([]));
    supabase.from('marketing_optout').select('phone_norm').then(({ data, error }) => {
      if (error) { setOptoutReady(false); return; }
      setOptout(new Set((data ?? []).map((r: { phone_norm: string }) => r.phone_norm)));
      setOptoutReady(true);
    });
  }, []);

  const model = useMemo(() => {
    const list = orders ?? [];
    const customers = buildCustomers(list);
    return {
      customers,
      repeat: repeatStats(customers, now),
      outcomes: outcomeStats(list),
      orderCount: list.length,
    };
  }, [orders, now]);

  // product id → category, for the "bought from category X" segment
  const catOf = useMemo(() => new Map(products.map((p) => [p.id, p.category])), [products]);
  const categories = useMemo(() => {
    const s = new Set<string>();
    for (const c of model.customers) for (const o of c.orders) for (const it of o.items) {
      const cat = catOf.get(it.productId);
      if (cat) s.add(cat);
    }
    return [...s].sort();
  }, [model.customers, catOf]);

  if (orders === null) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const inSegment = (c: Customer) => {
    switch (segment) {
      case 'repeat': return c.orders.length >= 2;
      case 'paid': return c.paid > 0;
      // Bought before, quiet for half a year — the pre-season "we're back" list.
      case 'lapsed': return c.paid > 0 && now - c.lastAt.getTime() > 180 * DAY;
      case 'category':
        return !!category && c.orders.some((o) => o.items.some((it) => catOf.get(it.productId) === category));
      default: return true;
    }
  };
  const list = model.customers.filter(inSegment);
  const exportable = list.filter((c) => !optout.has(c.phone));

  const toggleOptout = async (phone: string) => {
    if (!optoutReady) return;
    const isOut = optout.has(phone);
    const { error } = isOut
      ? await supabase.from('marketing_optout').delete().eq('phone_norm', phone)
      : await supabase.from('marketing_optout').insert({ phone_norm: phone });
    if (error) { alert(error.message); return; }
    setOptout((prev) => {
      const next = new Set(prev);
      if (isOut) next.delete(phone); else next.add(phone);
      return next;
    });
  };

  const downloadCsv = () => {
    const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const rows = [
      ['телефон', 'име', 'град', 'нарачки', 'платени', 'последна'].join(','),
      ...exportable.map((c) => [
        c.phone, esc(c.name), esc(c.city), c.orders.length, c.paid,
        c.lastAt.toISOString().slice(0, 10),
      ].join(',')),
    ];
    // BOM so Excel opens Cyrillic correctly.
    const blob = new Blob(['﻿' + rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kupuvaci-${segment}-${new Date(now).toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyPhones = async () => {
    try {
      await navigator.clipboard.writeText(exportable.map((c) => c.phone).join('\n'));
      setCopied(true);
    } catch { setCopied(false); }
  };

  const o = model.outcomes;
  const bucketRow = (b: OutcomeBucket) => (
    <tr key={b.label}>
      <td className="px-3 py-2 text-xs text-slate-700">{b.label}</td>
      <td className="px-3 py-2 text-right tabular-nums text-xs text-slate-600">{b.closed}</td>
      <td className="px-3 py-2 text-right tabular-nums text-xs text-slate-600">{b.failed}</td>
      <td className={`px-3 py-2 text-right tabular-nums text-xs font-semibold ${
        b.rate === null ? 'text-slate-300' : b.rate > 0.15 ? 'text-red-700' : 'text-slate-700'
      }`}>
        {pc(b.rate)}
      </td>
    </tr>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        <Link href="/admin" className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-800 mb-4 text-sm">
          <ArrowLeft className="h-4 w-4" />
          Назад на таблата
        </Link>

        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Online купувачи</h1>
        <p className="text-sm text-slate-500 mt-1 mb-6">
          Купувачот е неговиот телефон — курирот мора да стигне до него, па тоа е полето што вистински
          купувач го внесува точно. Само online нарачки: касата не бележи кој купил.
        </p>

        {model.orderCount < 20 && (
          <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 flex gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Вкупно <strong>{model.orderCount}</strong> online нарачки. Процентите подолу се точни, но на
              ваков број една нарачка ги поместува за десетици поени — читај ги како бројки, не како тренд.
            </span>
          </div>
        )}

        {/* 7.1 */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Купувачи (12 мес.)</p>
            <p className="text-xl font-bold text-slate-800 tabular-nums">{model.repeat.customers}</p>
            <p className="text-[11px] text-slate-400">вкупно досега {model.customers.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Повторени</p>
            <p className={`text-xl font-bold tabular-nums ${
              model.repeat.repeatRate !== null && model.repeat.repeatRate >= 0.25 ? 'text-green-700' : 'text-slate-800'
            }`}>
              {pc(model.repeat.repeatRate)}
            </p>
            <p className="text-[11px] text-slate-400">{model.repeat.repeat} купувачи · цел 25%</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Вредност по купувач</p>
            <p className="text-xl font-bold text-slate-800 tabular-nums">
              {model.repeat.ltv === null ? '—' : fmt(model.repeat.ltv)}
            </p>
            <p className="text-[11px] text-slate-400">ден. платено, досега</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Неуспешни нарачки</p>
            <p className={`text-xl font-bold tabular-nums ${
              o.failRate !== null && o.failRate > 0.15 ? 'text-red-700' : 'text-slate-800'
            }`}>
              {pc(o.failRate)}
            </p>
            <p className="text-[11px] text-slate-400">{o.failed} од {o.closed} затворени · праг 15%</p>
          </div>
        </div>

        {/* 7.2 */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm mb-6 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/60">
            <h2 className="font-bold text-slate-800 text-sm">Како завршија нарачките</h2>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Испорачани {o.counts.delivered} · одбиени {o.counts.refused} · вратени {o.counts.returned} · неподигнати{' '}
              {o.counts.not_collected} · отворени {o.counts.open}
              {o.counts.cancelled > 0 && ` · откажани од продавницата ${o.counts.cancelled} (не се бројат)`}
            </p>
          </div>
          {o.estimatedCost > 0 && (
            <p className="px-4 py-2 text-xs text-red-800 bg-red-50 border-b border-red-100">
              Одбиените и вратените пратки чинат околу <strong>{fmt(o.estimatedCost)} ден.</strong> поштарина —
              проценка: цената на достава на checkout, двапати. Вистинската тарифа е на курирот.
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-slate-100">
            {([
              ['По начин', o.byMethod],
              ['По износ', o.byValue],
              ['Прва или повторна', o.byCustomer],
              ['По град (курир)', o.byCity],
            ] as const).map(([title, rows]) => (
              <div key={title} className="bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100">
                      {[title, 'Затворени', 'Неуспешни', 'Стапка'].map((h, i) => (
                        <th key={h} className={`px-3 py-2 text-[10px] font-semibold text-slate-500 uppercase tracking-wider ${i === 0 ? 'text-left' : 'text-right'}`}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {rows.length === 0
                      ? <tr><td colSpan={4} className="px-3 py-3 text-xs text-slate-300">нема податоци</td></tr>
                      : rows.map(bucketRow)}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
          <p className="px-4 py-2 text-[11px] text-slate-400 border-t border-slate-100">
            Исходот се бележи во <Link href="/admin/orders" className="underline">нарачки</Link>. Над 15% неуспешни
            вреди да се потврдува по телефон пред испраќање — за нови купувачи и нарачки над прагот прво.
          </p>
        </div>

        {/* 7.4 */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/60 flex flex-wrap items-center gap-2">
            <Users className="h-4 w-4 text-slate-500" />
            <h2 className="font-bold text-slate-800 text-sm">Листа за Viber / SMS</h2>
            <span className="text-[11px] text-slate-500">
              {exportable.length} за извоз{list.length !== exportable.length && ` · ${list.length - exportable.length} отпишани`}
            </span>
            <div className="ml-auto flex gap-2">
              <button
                onClick={copyPhones}
                disabled={exportable.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
              >
                <ClipboardCopy className="h-3.5 w-3.5" />
                {copied ? 'Копирано' : 'Копирај броеви'}
              </button>
              <button
                onClick={downloadCsv}
                disabled={exportable.length === 0}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 text-white text-xs font-semibold hover:bg-slate-900 disabled:opacity-40"
              >
                <Download className="h-3.5 w-3.5" />
                CSV
              </button>
            </div>
          </div>

          <div className="px-4 py-2 border-b border-slate-100 flex flex-wrap items-center gap-1.5 text-xs">
            {([
              ['all', 'Сите'],
              ['paid', 'Платиле барем еднаш'],
              ['repeat', 'Повторени'],
              ['lapsed', 'Неактивни 6+ мес.'],
              ['category', 'Купиле од категорија'],
            ] as const).map(([k, label]) => (
              <button
                key={k}
                onClick={() => { setSegment(k); setCopied(false); }}
                className={`px-2.5 py-1 rounded-lg font-medium ${
                  segment === k ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600'
                }`}
              >
                {label}
              </button>
            ))}
            {segment === 'category' && (
              <select
                value={category}
                onChange={(e) => { setCategory(e.target.value); setCopied(false); }}
                className="px-2 py-1 border border-slate-200 rounded-lg"
              >
                <option value="">избери…</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            )}
          </div>

          {optoutReady === false && (
            <p className="px-4 py-2 text-xs text-amber-800 bg-amber-50 border-b border-amber-100">
              Отписот не работи додека не се пушти миграцијата 006. Листата може да се извезе, но без
              можност некој да се отпише.
            </p>
          )}

          {list.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-400">Нема купувачи во оваа група.</p>
          ) : (
            <div className="divide-y divide-slate-50">
              {list.slice(0, 100).map((c) => {
                const out = optout.has(c.phone);
                return (
                  <div key={c.phone} className={`flex items-center gap-3 px-4 py-2.5 text-sm ${out ? 'opacity-50' : ''}`}>
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-800 truncate">{c.name || '—'}</p>
                      <p className="text-[11px] text-slate-400 tabular-nums">
                        {c.phone} · {c.city || '—'}
                      </p>
                    </div>
                    <div className="text-right text-xs tabular-nums text-slate-600 w-28 shrink-0">
                      {c.orders.length} нар. · {c.paid} плат.
                      {c.failed > 0 && <span className="text-red-600"> · {c.failed} неусп.</span>}
                    </div>
                    <div className="text-right text-[11px] text-slate-400 w-20 shrink-0">
                      {c.lastAt.toLocaleDateString('mk-MK')}
                    </div>
                    <button
                      onClick={() => toggleOptout(c.phone)}
                      disabled={!optoutReady}
                      title={out ? 'Врати во листата' : 'Отпиши — нема да се појави во ниту една листа'}
                      className={`shrink-0 inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium disabled:opacity-40 ${
                        out ? 'bg-slate-200 text-slate-700' : 'text-slate-500 hover:bg-slate-100'
                      }`}
                    >
                      <BellOff className="h-3 w-3" />
                      {out ? 'Отпишан' : 'Отпиши'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          <p className="px-4 py-2 text-[11px] text-slate-400 border-t border-slate-100">
            Во листата се само луѓе што нарачале. Кој ќе побара да не добива пораки — кликни „Отпиши“; бројот
            повеќе не се појавува во ниту една група, ниту во извозот.
          </p>
        </div>
      </div>
    </div>
  );
}

export default function CustomersPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-500 mb-4">Please log in to access this page.</p>
          <Link href="/admin" className="text-blue-600 hover:text-blue-700 font-medium">
            Go to Admin Login
          </Link>
        </div>
      </div>
    );
  }

  return <CustomersView />;
}
