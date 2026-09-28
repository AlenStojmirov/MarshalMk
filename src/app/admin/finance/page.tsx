'use client';

/**
 * Monthly result — running costs, and what they leave.
 *
 * The shop's running costs lived nowhere in the system, so nothing could show a
 * net figure; every report stopped at gross profit. This is where the costs go
 * in, and because the sales data is already there it is also the first screen
 * that answers the only question that matters during a turnaround: was this
 * month positive.
 *
 * No VAT arithmetic anywhere — the shop is not VAT registered (D-003), so input
 * VAT is part of the purchase price and margin is already the real margin.
 *
 * Costs can go in as one figure for the month or as line items. A month is one
 * or the other, never both (see lib/expenses.ts), so a rough entry now can be
 * broken down later without the two ever adding up together.
 */

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { useProducts } from '@/hooks/useProducts';
import {
  Expense,
  ExpenseCategory,
  EXPENSE_CATEGORIES,
  CATEGORY_LABELS_MK,
  addExpenses,
  deleteExpense,
  expensesForPeriod,
  getExpenses,
  periodLabel,
  periodsBetween,
  periodsSince,
  spreadExpense,
} from '@/lib/expenses';
import { ArrowLeft, Plus, Trash2, TrendingDown, TrendingUp, AlertTriangle, Wallet, Download } from 'lucide-react';

const START_PERIOD = '2025-01';
const fmt = (n: number) => Math.round(n).toLocaleString('mk-MK');

interface MonthRow {
  period: string;
  units: number;
  revenue: number;
  cogs: number;
  costCoverage: number;
  gross: number;
  expenses: number;
  expensesKnown: boolean;
  fromMonthlyTotal: boolean;
  conflict: boolean;
  net: number;
  /** Revenue in the same month a year earlier, or null when that month is before the data. */
  lastYearRevenue: number | null;
}

function FinanceView() {
  const { products, loading: productsLoading } = useProducts();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    period: periodsSince(START_PERIOD)[0],
    /** Last month of the range; the same as `period` for one month. */
    periodTo: periodsSince(START_PERIOD)[0],
    /** Over several months: the same amount each month, or one bill divided. */
    mode: 'repeat' as 'repeat' | 'split',
    amount: '',
    description: '',
    category: 'other' as ExpenseCategory,
    detailed: false,
  });
  const [notice, setNotice] = useState<string | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      setExpenses(await getExpenses());
      setError(null);
    } catch (err) {
      setError(
        err instanceof Error && err.message.includes('operating_expenses')
          ? 'Табелата не постои — пушти supabase/migrations/003_operating_expenses.sql'
          : 'Не може да се вчитаат трошоците.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const months = useMemo<MonthRow[]>(() => {
    // Sales come from products.sold[], still the source of truth (D-008).
    const byPeriod = new Map<string, { units: number; revenue: number; cogs: number; costed: number }>();

    for (const p of products) {
      const cost = p.purchasePrice;
      for (const s of p.sold ?? []) {
        const price = Number(s.price) || 0;
        if (price <= 0) continue; // giveaways and write-offs are not revenue
        const m = /^(\d{4})-(\d{2})/.exec(String(s.soldDate));
        if (!m) continue;
        const key = m[1] + '-' + m[2];
        const st = byPeriod.get(key) ?? { units: 0, revenue: 0, cogs: 0, costed: 0 };
        st.units += 1;
        st.revenue += price;
        if (cost !== undefined) { st.cogs += cost; st.costed += 1; }
        byPeriod.set(key, st);
      }
    }

    return periodsSince(START_PERIOD).map((period) => {
      const s = byPeriod.get(period) ?? { units: 0, revenue: 0, cogs: 0, costed: 0 };
      // Scale COGS up when only part of the month's sales have a known cost,
      // rather than understating it and overstating the margin.
      const coverage = s.units > 0 ? s.costed / s.units : 1;
      const cogs = coverage > 0 ? s.cogs / coverage : 0;
      const gross = s.revenue - cogs;
      const e = expensesForPeriod(expenses, period);
      return {
        period,
        units: s.units,
        revenue: s.revenue,
        cogs,
        costCoverage: coverage,
        gross,
        expenses: e.total,
        expensesKnown: e.items.length > 0,
        fromMonthlyTotal: e.fromMonthlyTotal,
        conflict: e.conflict,
        net: gross - e.total,
        lastYearRevenue: (() => {
          // Same month last year — the only comparison that is not distorted by
          // the season. January against December says nothing; January against
          // January says whether the business moved.
          const [y, mo] = period.split('-').map(Number);
          const prev = `${y - 1}-${String(mo).padStart(2, '0')}`;
          // Sales history runs back further than the expenses table does, so a
          // month with no costs entered can still be compared on revenue.
          return byPeriod.has(prev) ? byPeriod.get(prev)!.revenue : null;
        })(),
      };
    });
  }, [products, expenses]);

  // For the accountant, or a spreadsheet: every month as the table shows it.
  const downloadCsv = () => {
    const header = ['месец', 'парчиња', 'приход', 'приход_лани', 'набавна', 'бруто', 'маржа_%',
      'трошоци', 'трошоци_внесени', 'резултат'];
    const rows = months.map((m) => [
      m.period, m.units, Math.round(m.revenue), m.lastYearRevenue === null ? '' : Math.round(m.lastYearRevenue),
      Math.round(m.cogs), Math.round(m.gross),
      m.revenue > 0 ? ((m.gross / m.revenue) * 100).toFixed(1) : '',
      Math.round(m.expenses), m.expensesKnown ? 'да' : 'не', Math.round(m.net),
    ].join(','));
    // BOM so Excel reads the Cyrillic header correctly.
    const blob = new Blob(['\uFEFF' + [header.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `finansii-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const withExpenses = months.filter((m) => m.expensesKnown);
  const ytd = months.filter((m) => m.period.startsWith(String(new Date().getFullYear())));
  const sum = (rows: MonthRow[], k: keyof MonthRow) =>
    rows.reduce((a, r) => a + (typeof r[k] === 'number' ? (r[k] as number) : 0), 0);

  const range = periodsBetween(form.period, form.periodTo);
  const amountNum = Number(form.amount);
  const spread =
    Number.isFinite(amountNum) && amountNum > 0
      ? spreadExpense(
          {
            category: form.detailed ? form.category : 'other',
            amount: amountNum,
            description: form.description,
            isMonthlyTotal: !form.detailed,
          },
          range,
          range.length > 1 ? form.mode : 'repeat',
          expenses,
        )
      : null;

  const handleAdd = async () => {
    if (!spread || spread.rows.length === 0) return;
    if (spread.rows.length > 1 && !confirm(
      `Ќе се внесат ${spread.rows.length} реда, вкупно ${fmt(spread.rows.reduce((a, r) => a + r.amount, 0))} ден. Продолжи?`,
    )) return;
    setSaving(true);
    try {
      await addExpenses(spread.rows);
      setNotice(
        spread.skipped.length
          ? `Внесени ${spread.rows.length}. Прескокнати ${spread.skipped.length} (веќе го имаат истиот трошок): ${spread.skipped.map(periodLabel).join(', ')}.`
          : `Внесени ${spread.rows.length}.`,
      );
      setForm((f) => ({ ...f, amount: '', description: '' }));
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Не успеа');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (e: Expense) => {
    if (!confirm(`Да се избрише „${e.description || CATEGORY_LABELS_MK[e.category]}" (${fmt(e.amount)} ден.)?`)) return;
    await deleteExpense(e.id);
    await load();
  };

  if (productsLoading || loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        <Link href="/admin" className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-800 mb-4 text-sm">
          <ArrowLeft className="h-4 w-4" />
          Назад на таблата
        </Link>

        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Трошоци и месечен резултат</h1>
        <p className="text-sm text-slate-500 mt-1 mb-6">
          Приходот и набавната цена доаѓаат од продажбите. Внеси ги трошоците и месецот се затвора сам.
          Продавницата не е во ДДВ систем, па нема нето-бруто пресметка — маржата е онаа што се гледа.
        </p>

        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        )}

        {/* year to date */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          {[
            { k: 'Приход годинава', v: sum(ytd, 'revenue'), tone: 'text-slate-800' },
            { k: 'Бруто профит', v: sum(ytd, 'gross'), tone: 'text-slate-800' },
            { k: 'Трошоци', v: sum(ytd, 'expenses'), tone: 'text-slate-800' },
            {
              k: 'Нето резултат',
              v: sum(ytd, 'gross') - sum(ytd, 'expenses'),
              tone: sum(ytd, 'gross') - sum(ytd, 'expenses') >= 0 ? 'text-green-700' : 'text-red-700',
            },
          ].map((tile) => (
            <div key={tile.k} className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{tile.k}</p>
              <p className={`text-xl font-bold tabular-nums ${tile.tone}`}>{fmt(tile.v)}</p>
              <p className="text-[11px] text-slate-400">денари</p>
            </div>
          ))}
        </div>

        {/* add */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Wallet className="h-4 w-4 text-slate-500" />
            <h2 className="font-bold text-slate-800 text-sm">Внеси трошок</h2>
            <label className="ml-auto flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
              <input
                type="checkbox"
                checked={form.detailed}
                onChange={(e) => setForm((f) => ({ ...f, detailed: e.target.checked }))}
                className="h-3.5 w-3.5 rounded border-slate-300"
              />
              По ставка наместо вкупно за месецот
            </label>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Од месец</label>
              <select
                value={form.period}
                // Moving the start past the end drags the end along: one month by default.
                onChange={(e) => setForm((f) => ({ ...f, period: e.target.value, periodTo: e.target.value > f.periodTo ? e.target.value : f.periodTo }))}
                className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {periodsSince(START_PERIOD).map((p) => (
                  <option key={p} value={p}>{periodLabel(p)}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">До месец</label>
              <select
                value={form.periodTo}
                onChange={(e) => setForm((f) => ({ ...f, periodTo: e.target.value, period: e.target.value < f.period ? e.target.value : f.period }))}
                className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
              >
                {periodsSince(START_PERIOD).map((p) => (
                  <option key={p} value={p}>{periodLabel(p)}</option>
                ))}
              </select>
            </div>
            {form.detailed && (
              <div>
                <label className="block text-[11px] font-medium text-slate-500 mb-1">Категорија</label>
                <select
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as ExpenseCategory }))}
                  className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {EXPENSE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{CATEGORY_LABELS_MK[c]}</option>
                  ))}
                </select>
              </div>
            )}
            <div>
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Износ</label>
              <input
                type="number"
                min="0"
                step="1"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="65000"
                className="w-28 px-3 py-1.5 text-sm border border-slate-300 rounded-lg tabular-nums"
              />
            </div>
            <div className="flex-1 min-w-[180px]">
              <label className="block text-[11px] font-medium text-slate-500 mb-1">Опис</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder={form.detailed ? 'на пр. кирија за локал' : 'на пр. вкупни трошоци'}
                className="w-full px-3 py-1.5 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <button
              onClick={handleAdd}
              disabled={saving || !spread || spread.rows.length === 0}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-40"
            >
              <Plus className="h-4 w-4" />
              {saving ? '…' : range.length > 1 ? `Додади во ${range.length} месеци` : 'Додади'}
            </button>
          </div>

          {range.length > 1 && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" checked={form.mode === 'repeat'} onChange={() => setForm((f) => ({ ...f, mode: 'repeat' }))} />
                Ист износ секој месец <span className="text-slate-400">(кирија, плати)</span>
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" checked={form.mode === 'split'} onChange={() => setForm((f) => ({ ...f, mode: 'split' }))} />
                Подели го износот на месеците <span className="text-slate-400">(една сметка за повеќе месеци)</span>
              </label>
            </div>
          )}
          {spread && range.length > 1 && (
            <p className="mt-2 text-xs text-slate-500">
              {spread.rows.length > 0
                ? form.mode === 'split'
                  ? `${fmt(amountNum)} ден. поделени на ${range.length} месеци: по ${fmt(spread.rows[0].amount)} ден.`
                  : `${fmt(amountNum)} ден. × ${spread.rows.length} месеци = ${fmt(amountNum * spread.rows.length)} ден.`
                : 'Сите избрани месеци веќе го имаат овој трошок.'}
              {spread.skipped.length > 0 && spread.rows.length > 0 && ` Се прескокнуваат ${spread.skipped.length} што веќе го имаат.`}
            </p>
          )}
          {notice && <p className="mt-2 text-xs text-emerald-700">{notice}</p>}
          <p className="mt-2 text-[11px] text-slate-400">
            Месецот се смета за внесен кога има „вкупно за месецот“, или барем кирија и плати (D-024). Инаку нулата се пресметува со 65.000.
          </p>
        </div>

        {/* months */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-4 py-2 border-b border-slate-200 flex items-center">
            <p className="text-[11px] text-slate-500">
              „Лани“ е истиот месец минатата година — единствената споредба што сезоната не ја искривува.
            </p>
            <button
              onClick={downloadCsv}
              className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  {['Месец', 'Парчиња', 'Приход', 'Лани', 'Набавна', 'Бруто', 'Маржа', 'Трошоци', 'Резултат'].map((h, i) => (
                    <th
                      key={h}
                      className={`px-3 py-3 text-[10px] font-semibold text-slate-500 uppercase tracking-wider ${i === 0 ? 'text-left' : 'text-right'}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {months.map((m) => {
                  const margin = m.revenue > 0 ? (m.gross / m.revenue) * 100 : null;
                  const expanded = open === m.period;
                  const rows = expenses.filter((e) => e.period === m.period);
                  return (
                    <Fragment key={m.period}>
                      <tr
                        onClick={() => setOpen(expanded ? null : m.period)}
                        className="hover:bg-slate-50/60 cursor-pointer transition-colors"
                      >
                        <td className="px-3 py-2.5 font-medium text-slate-800 whitespace-nowrap">
                          {periodLabel(m.period)}
                          {m.conflict && (
                            <AlertTriangle className="inline h-3.5 w-3.5 text-amber-600 ml-1.5" />
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{m.units || '—'}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{m.revenue ? fmt(m.revenue) : '—'}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-xs">
                          {m.lastYearRevenue === null || m.lastYearRevenue === 0 ? (
                            <span className="text-slate-300">—</span>
                          ) : (
                            <span className={m.revenue >= m.lastYearRevenue ? 'text-green-700' : 'text-red-700'}>
                              {m.revenue >= m.lastYearRevenue ? '+' : '−'}
                              {Math.abs(Math.round(((m.revenue - m.lastYearRevenue) / m.lastYearRevenue) * 100))}%
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{m.cogs ? fmt(m.cogs) : '—'}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-700">{m.gross ? fmt(m.gross) : '—'}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">
                          {margin === null ? '—' : margin.toFixed(0) + '%'}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums">
                          {m.expensesKnown ? (
                            <span className="text-slate-700">{fmt(m.expenses)}</span>
                          ) : (
                            <span className="text-slate-300">не внесени</span>
                          )}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums font-semibold">
                          {m.expensesKnown ? (
                            <span className={m.net >= 0 ? 'text-green-700' : 'text-red-700'}>
                              {m.net >= 0 ? '+' : '−'}{fmt(Math.abs(m.net))}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="bg-slate-50/60">
                          <td colSpan={9} className="px-3 py-3">
                            {m.conflict && (
                              <p className="text-xs text-amber-800 mb-2">
                                Овој месец има и вкупна сума и поединечни ставки. Се брои вкупната —
                                избриши ја кога детаљите се комплетни.
                              </p>
                            )}
                            {rows.length === 0 ? (
                              <p className="text-xs text-slate-400">Нема внесени трошоци за овој месец.</p>
                            ) : (
                              <div className="space-y-1">
                                {rows.map((e) => (
                                  <div key={e.id} className="flex items-center gap-2 text-xs">
                                    <span className={`px-1.5 py-0.5 rounded font-medium ${
                                      e.isMonthlyTotal ? 'bg-blue-100 text-blue-800' : 'bg-slate-200 text-slate-700'
                                    }`}>
                                      {e.isMonthlyTotal ? 'вкупно за месецот' : CATEGORY_LABELS_MK[e.category]}
                                    </span>
                                    <span className="text-slate-600 truncate">{e.description || '—'}</span>
                                    <span className="ml-auto tabular-nums font-semibold text-slate-800">
                                      {fmt(e.amount)} ден.
                                    </span>
                                    <button
                                      onClick={(ev) => { ev.stopPropagation(); handleDelete(e); }}
                                      className="p-1 text-slate-400 hover:text-red-600"
                                    >
                                      <Trash2 className="h-3.5 w-3.5" />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                            {m.costCoverage < 0.99 && m.units > 0 && (
                              <p className="text-[11px] text-slate-400 mt-2">
                                Набавната цена е позната за {(m.costCoverage * 100).toFixed(0)}% од продажбите
                                овој месец; остатокот е скалиран пропорционално.
                              </p>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {withExpenses.length > 0 && (
          <p className="text-xs text-slate-500 mt-4 flex items-center gap-1.5">
            {sum(withExpenses, 'gross') - sum(withExpenses, 'expenses') >= 0 ? (
              <TrendingUp className="h-3.5 w-3.5 text-green-600" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 text-red-600" />
            )}
            Низ {withExpenses.length} месеци со внесени трошоци: бруто {fmt(sum(withExpenses, 'gross'))},
            трошоци {fmt(sum(withExpenses, 'expenses'))}, резултат{' '}
            <strong className={sum(withExpenses, 'gross') - sum(withExpenses, 'expenses') >= 0 ? 'text-green-700' : 'text-red-700'}>
              {fmt(sum(withExpenses, 'gross') - sum(withExpenses, 'expenses'))} ден.
            </strong>
          </p>
        )}
      </div>
    </div>
  );
}

export default function FinancePage() {
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

  return <FinanceView />;
}
