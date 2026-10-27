'use client';

/**
 * The shop's settings (Task 14.2). For now one: the addresses that get an
 * e-mail for every new order. Admin only: the route is in no other role's
 * ROLE_PATHS, and migration 020 lets only the admin read or write the row.
 */

import { useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, Check, Mail, Send, Settings, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { accountFetch } from '@/lib/account-client';
import {
  MAX_ORDER_NOTIFY_EMAILS, StoreSettingsRead, fetchStoreSettings, isEmail, saveStoreSettings,
} from '@/lib/store-settings';
import type { OrderNotifyResult } from '@/lib/order-notify-server';

export default function SettingsPage() {
  const [read, setRead] = useState<StoreSettingsRead | null>(null);
  const [emails, setEmails] = useState<string[]>([]);
  const [typed, setTyped] = useState('');
  const [typedError, setTypedError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);

  const apply = (r: StoreSettingsRead) => {
    setRead(r);
    setEmails(r.settings.orderNotifyEmails);
  };
  useEffect(() => {
    fetchStoreSettings(supabase).then((r) => { setRead(r); setEmails(r.settings.orderNotifyEmails); });
  }, []);

  if (!read) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const saved = read.settings.orderNotifyEmails;
  const dirty = JSON.stringify(saved) !== JSON.stringify(emails);
  const full = emails.length >= MAX_ORDER_NOTIFY_EMAILS;
  const touched = () => { setSavedAt(null); setSaveError(null); setTest(null); };

  const add = () => {
    const e = typed.trim().toLowerCase();
    if (!e) return;
    if (!isEmail(e)) { setTypedError('Ова не е е-пошта.'); return; }
    if (emails.includes(e)) { setTypedError('Оваа адреса е веќе на листата.'); return; }
    if (full) { setTypedError(`Најмногу ${MAX_ORDER_NOTIFY_EMAILS} адреси.`); return; }
    touched();
    setEmails([...emails, e]);
    setTyped('');
    setTypedError(null);
  };

  const remove = (e: string) => { touched(); setEmails(emails.filter((x) => x !== e)); };

  const save = async () => {
    setSaving(true);
    const { error } = await saveStoreSettings(supabase, { orderNotifyEmails: emails });
    setSaving(false);
    if (error) { setSaveError(error); return; }
    apply(await fetchStoreSettings(supabase));
    setSavedAt(new Date());
  };

  const sendTest = async () => {
    setTesting(true);
    setTest(null);
    const r = await accountFetch<OrderNotifyResult>('/api/admin/order-email-test', { method: 'POST' });
    setTesting(false);
    if (r.error || !r.data) { setTest({ ok: false, text: r.error ?? 'Не успеа.' }); return; }
    const { sent, failed, skipped } = r.data;
    if (skipped) setTest({ ok: false, text: `Не е пратено: ${skipped}.` });
    else if (failed.length) setTest({ ok: false, text: `Не стигна до: ${failed.join(' · ')}${sent.length ? `. Пратено на ${sent.join(', ')}.` : ''}` });
    else setTest({ ok: true, text: `Пратено на ${sent.join(', ')}: две пораки, за продавницата и примерот што го добива купувачот. Провери го сандачето (и „Spam“).` });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        <Link href="/admin" className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-800 mb-4 text-sm">
          <ArrowLeft className="h-4 w-4" />
          Назад на таблата
        </Link>

        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 flex items-center gap-2">
          <Settings className="h-7 w-7 text-slate-600" /> Поставки
        </h1>
        <p className="text-sm text-slate-500 mt-1 mb-6">Поставки на продавницата.</p>

        {read.missingTable && (
          <Banner tone="amber">
            Миграцијата <strong>020</strong> уште не е пуштена. Додека не се пушти, е-пошта за нарачки не се праќа, а зачувување не е можно.
          </Banner>
        )}
        {!read.missingTable && read.error && <Banner tone="red">Поставките не се прочитаа ({read.error}).</Banner>}

        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-5">
          <h2 className="font-semibold text-slate-800 flex items-center gap-2">
            <Mail className="h-4 w-4 text-slate-500" /> Е-пошта за нови нарачки
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            За секоја нова нарачка на сајтот, на овие адреси стигнува е-пошта: купувач, телефон, адреса,
            производи со големина и колку се наплаќа. Без адреса не се праќа ништо.
            И купувачот добива своја порака: бројот на нарачката, производите, колку плаќа и копче за следење.
          </p>

          <ul className="mt-4 space-y-2">
            {emails.length === 0 && <li className="text-sm text-slate-400">Нема адреса.</li>}
            {emails.map((e) => (
              <li key={e} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
                <span className="flex-1 truncate text-slate-800">{e}</span>
                <button
                  type="button"
                  onClick={() => remove(e)}
                  disabled={read.missingTable}
                  aria-label={`Тргни ${e}`}
                  className="p-1 text-slate-400 hover:text-red-600 disabled:opacity-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex gap-2">
            <input
              type="email"
              inputMode="email"
              value={typed}
              onChange={(e) => { setTyped(e.target.value); setTypedError(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add(); } }}
              placeholder="ime@primer.mk"
              disabled={read.missingTable || full}
              aria-label="Нова адреса"
              className="flex-1 min-w-0 rounded-lg border border-slate-300 px-3 py-2 text-base sm:text-sm disabled:bg-slate-100"
            />
            <button
              type="button"
              onClick={add}
              disabled={read.missingTable || full || !typed.trim()}
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Додај
            </button>
          </div>
          <p className={`text-[11px] mt-1 ${typedError ? 'text-red-600' : 'text-slate-400'}`}>
            {typedError ?? `Една или повеќе, најмногу ${MAX_ORDER_NOTIFY_EMAILS}.`}
          </p>

          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={save}
              disabled={read.missingTable || saving || !dirty}
              className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? 'Се зачувува…' : 'Зачувај'}
            </button>
            <button
              type="button"
              onClick={sendTest}
              disabled={read.missingTable || testing || dirty || saved.length === 0}
              title={dirty ? 'Прво зачувај' : undefined}
              className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-slate-50 inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" /> {testing ? 'Се праќа…' : 'Прати пробна'}
            </button>
            {savedAt && <span className="text-sm text-emerald-700 inline-flex items-center gap-1"><Check className="h-4 w-4" /> Зачувано</span>}
            {dirty && !saving && <span className="text-xs text-slate-400">Има незачувани промени.</span>}
          </div>
          {saveError && <p className="text-sm text-red-600 mt-2">{saveError}</p>}
          {test && <p className={`text-sm mt-2 ${test.ok ? 'text-emerald-700' : 'text-red-600'}`}>{test.text}</p>}
        </section>
      </div>
    </div>
  );
}

function Banner({ tone, children }: { tone: 'amber' | 'red'; children: ReactNode }) {
  const cls = { amber: 'border-amber-200 bg-amber-50 text-amber-900', red: 'border-red-200 bg-red-50 text-red-900' }[tone];
  return (
    <div className={`mb-4 rounded-xl border px-4 py-3 text-sm flex gap-2 ${cls}`}>
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}
