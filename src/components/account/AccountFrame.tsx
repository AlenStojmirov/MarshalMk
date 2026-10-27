import type { ReactNode } from 'react';
import { useTranslation } from '@/lib/i18n';

/**
 * The frame of the customer's pages (13.6): one narrow column, mobile first,
 * the same quiet stone palette as the footer.
 */
export default function AccountFrame({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <main className="bg-stone-50 min-h-[70vh]">
      <div className="max-w-md mx-auto px-4 py-8 sm:py-12">
        <h1 className="text-2xl font-bold text-stone-900">{title}</h1>
        {subtitle && <div className="text-sm text-stone-600 mt-1">{subtitle}</div>}
        <div className="mt-6">{children}</div>
      </div>
    </main>
  );
}

/** One labelled input with its error under it. */
export function Field({
  label, error, hint, children,
}: { label: string; error?: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-stone-800">{label}</span>
      <div className="mt-1">{children}</div>
      {error ? <span className="block text-xs text-red-600 mt-1">{error}</span> : hint ? <span className="block text-xs text-stone-500 mt-1">{hint}</span> : null}
    </label>
  );
}

export const inputCls = (error?: string) =>
  `w-full rounded-lg border px-3 py-2.5 text-base sm:text-sm bg-white ${error ? 'border-red-400' : 'border-stone-300'} focus:outline-none focus:ring-2 focus:ring-stone-900/20 focus:border-stone-500`;

/**
 * The birth date (14.8): the browser's own date input and a way to empty it. A
 * phone's date picker, an iPhone's above all, has no "clear", and the date is
 * never required, so a date once picked could not be taken back.
 */
export function BirthDateInput({ value, onChange, error }: { value: string; onChange: (v: string) => void; error?: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex gap-2">
      <input type="date" autoComplete="bday" value={value} onChange={(e) => onChange(e.target.value)} className={`${inputCls(error)} flex-1 min-w-0`} />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          className="shrink-0 rounded-lg border border-stone-300 bg-white px-3 text-sm text-stone-700 hover:bg-stone-100"
        >
          {t('account.common.clearDate')}
        </button>
      )}
    </div>
  );
}

export const buttonCls =
  'w-full rounded-lg bg-stone-900 text-white py-3 text-sm font-semibold hover:bg-black active:bg-black disabled:opacity-50 transition-colors';

export function Notice({ tone, children }: { tone: 'green' | 'amber' | 'red' | 'stone'; children: ReactNode }) {
  const cls = {
    green: 'border-green-200 bg-green-50 text-green-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    red: 'border-red-200 bg-red-50 text-red-900',
    stone: 'border-stone-200 bg-white text-stone-700',
  }[tone];
  return <div className={`rounded-xl border px-4 py-3 text-sm ${cls}`}>{children}</div>;
}
