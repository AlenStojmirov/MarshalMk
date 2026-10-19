'use client';

/**
 * The loyalty programme (EPIC 13). Task 13.1: its settings; 13.3: a customer's points; 13.4: coupons;
 * 13.10: the wheel's prizes; 13.12: the reports.
 *
 * Every number of the programme in one form, each with its default beside it,
 * and a worked example that moves as the numbers do, so a change is seen in
 * denars before it is saved. Admin only: the route is not in any other role's
 * ROLE_PATHS, and migration 014 lets only the admin read or write the row.
 *
 * Every tab reads its own data; the reports come from the server, which alone
 * sees every account.
 */

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/lib/supabase';
import { MARKDOWN_FLOOR } from '@/lib/cost';
import {
  LOYALTY_DEFAULTS, LOYALTY_FIELDS, LoyaltySettings, LoyaltySettingsRead, NumericSetting,
  crossFieldErrors, discountBand, earnRatePctFor, fetchLoyaltySettings, fieldError, redeemCapPctFor, saveLoyaltySettings,
} from '@/lib/loyalty-settings';
import LoyaltyCouponsTab from '@/components/admin/LoyaltyCouponsTab';
import LoyaltyPointsTab from '@/components/admin/LoyaltyPointsTab';
import LoyaltyOrderSync from '@/components/admin/LoyaltyOrderSync';
import LoyaltyWheelTab from '@/components/admin/LoyaltyWheelTab';
import LoyaltyReportsTab from '@/components/admin/LoyaltyReportsTab';
import { AlertTriangle, ArrowLeft, Check, Gift, RotateCcw } from 'lucide-react';

const fmt = (n: number) => Math.round(n).toLocaleString('mk-MK');

type Draft = Record<NumericSetting, string> & { wheelEnabled: boolean };

const SECTIONS: Array<{ title: string; note?: string; keys: NumericSetting[] }> = [
  {
    title: 'Заработка на поени',
    note: '1 поен = 1 денар. Се заокружува надолу на цел број.',
    keys: ['earnRatePct', 'discountBandPct', 'reducedRateSharePct'],
  },
  {
    title: 'Трошење поени',
    keys: ['minPointsToRedeem', 'minOrderForRedeem', 'maxRedeemBasketPct', 'maxRedeemFullPricePct', 'maxRedeemDiscountedPct'],
  },
  {
    title: 'Граница на сите попусти',
    note: 'Акциска цена, купон и поени заедно. Се проверува на крај, по редот акциска цена → купон → поени.',
    keys: ['maxTotalDiscountPct'],
  },
  {
    title: 'Рокови',
    keys: ['pendingDays', 'expiryMonths', 'wheelPointsExpiryDays', 'expiryNoticeFirstDays', 'expiryNoticeSecondDays'],
  },
  {
    title: 'Бонус поени',
    note: 'Се доделуваат само со потврдено купување (првата испорачана и платена нарачка). 0 = исклучено.',
    keys: ['bonusRegistration', 'bonusProfileComplete', 'bonusBirthday'],
  },
  {
    title: 'Купон за добредојде',
    note: 'Личен купон во %, еднаш, откако купувачот ќе ја потврди е-поштата. 0 = без купон.',
    keys: ['welcomeCouponPct', 'welcomeCouponValidDays', 'welcomeCouponMinBasket'],
  },
  {
    title: 'Роденден и потсетници по е-пошта',
    note: 'На роденденот: бонус поените (горе) и купонот. Пораката оди само ако купувачот сака понуди; подарокот го добива секако. Потсетниците за поени (30 и 7 дена) се во „Рокови“.',
    keys: ['birthdayCouponPct', 'birthdayCouponValidDays', 'couponNoticeDays'],
  },
];

const WHEEL_KEYS: NumericSetting[] = ['wheelIntervalDays', 'wheelBonusSpinsPerOrder', 'wheelCouponValidHours', 'wheelCouponMinBasket'];

function toDraft(s: LoyaltySettings): Draft {
  const d = { wheelEnabled: s.wheelEnabled } as Draft;
  for (const k of Object.keys(LOYALTY_FIELDS) as NumericSetting[]) d[k] = String(s[k]).replace('.', ',');
  return d;
}

/** "2,5" and "2.5" are the same number; an empty box is not a number. */
function toNumber(raw: string): number {
  const t = raw.trim().replace(/\s/g, '').replace(',', '.');
  return t === '' ? NaN : Number(t);
}

function fromDraft(d: Draft): LoyaltySettings {
  const s = { ...LOYALTY_DEFAULTS, wheelEnabled: d.wheelEnabled };
  for (const k of Object.keys(LOYALTY_FIELDS) as NumericSetting[]) s[k] = toNumber(d[k]);
  return s;
}

function LoyaltyView() {
  const [read, setRead] = useState<LoyaltySettingsRead | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [tab, setTab] = useState<'settings' | 'coupons' | 'points' | 'wheel' | 'reports'>('settings');
  const [savedAt, setSavedAt] = useState<Date | null>(null);

  const apply = (r: LoyaltySettingsRead) => {
    setRead(r);
    setDraft(toDraft(r.settings));
  };
  useEffect(() => {
    fetchLoyaltySettings(supabase).then((r) => { setRead(r); setDraft(toDraft(r.settings)); });
  }, []);

  const parsed = useMemo(() => (draft ? fromDraft(draft) : null), [draft]);
  const errors = useMemo(() => {
    const out: Partial<Record<NumericSetting, string>> = {};
    if (!parsed) return out;
    for (const f of Object.values(LOYALTY_FIELDS)) {
      const e = fieldError(f, parsed[f.key]);
      if (e) out[f.key] = e;
    }
    return out;
  }, [parsed]);
  const crossErrors = parsed && Object.keys(errors).length === 0 ? crossFieldErrors(parsed) : [];
  const valid = Object.keys(errors).length === 0 && crossErrors.length === 0;
  const dirty = !!(read && parsed && JSON.stringify(fromDraft(toDraft(read.settings))) !== JSON.stringify(parsed));

  if (!read || !draft || !parsed) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const set = (k: NumericSetting, v: string) => { setSavedAt(null); setSaveError(null); setDraft({ ...draft, [k]: v }); };

  const save = async () => {
    if (!valid) return;
    if (parsed.wheelEnabled && !read.settings.wheelEnabled &&
        !confirm('Тркалото ќе се вклучи за купувачите. Дали сметководителот потврдил дека не е наградна игра што бара одобрение?')) return;
    setSaving(true);
    const { error } = await saveLoyaltySettings(supabase, parsed);
    setSaving(false);
    if (error) { setSaveError(error); return; }
    apply(await fetchLoyaltySettings(supabase));
    setSavedAt(new Date());
  };

  const field = (k: NumericSetting) => {
    const f = LOYALTY_FIELDS[k];
    const err = errors[k];
    const isDefault = toNumber(draft[k]) === LOYALTY_DEFAULTS[k];
    return (
      <label key={k} className="block">
        <span className="text-sm font-medium text-slate-700">{f.label}</span>
        <div className="mt-1 flex items-center gap-2">
          <input
            inputMode="decimal"
            value={draft[k]}
            onChange={(e) => set(k, e.target.value)}
            disabled={read.missingTable}
            className={`w-28 rounded-lg border px-2.5 py-1.5 text-right tabular-nums text-sm ${err ? 'border-red-400 bg-red-50' : 'border-slate-300'} disabled:bg-slate-100`}
          />
          <span className="text-sm text-slate-500">{f.unit}</span>
        </div>
        <span className={`block text-[11px] mt-0.5 ${err ? 'text-red-600' : 'text-slate-400'}`}>
          {err ?? [f.hint, isDefault ? null : `стандардно ${String(LOYALTY_DEFAULTS[k]).replace('.', ',')}`].filter(Boolean).join(' · ')}
        </span>
      </label>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        <Link href="/admin" className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-800 mb-4 text-sm">
          <ArrowLeft className="h-4 w-4" />
          Назад на таблата
        </Link>

        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800 flex items-center gap-2">
          <Gift className="h-7 w-7 text-indigo-600" /> Програма за лојалност
        </h1>
        <p className="text-sm text-slate-500 mt-1 mb-4">
          Поени, купони и тркало на среќа, само за нарачки на сајтот со најава (D-032).
          Сите бројки на програмата се во „Извештаи“.
        </p>

        <div className="flex gap-1 mb-6 border-b border-slate-200">
          {([['settings', 'Поставки'], ['coupons', 'Купони'], ['points', 'Поени на купувач'], ['wheel', 'Тркало'], ['reports', 'Извештаи']] as const).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`px-3 py-2 text-sm font-medium -mb-px border-b-2 ${tab === k ? 'border-indigo-600 text-indigo-700' : 'border-transparent text-slate-500 hover:text-slate-800'}`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'points' ? <><LoyaltyPointsTab settings={read.settings} /><LoyaltyOrderSync /></> : tab === 'coupons' ? <LoyaltyCouponsTab /> : tab === 'wheel' ? <LoyaltyWheelTab wheelEnabled={read.settings.wheelEnabled} /> : tab === 'reports' ? <LoyaltyReportsTab /> : (<>
        {read.missingTable && (
          <Banner tone="amber">
            Миграцијата <strong>014</strong> уште не е пуштена. Важат стандардните бројки подолу, а зачувување не е можно.
          </Banner>
        )}
        {!read.missingTable && read.error && <Banner tone="red">Поставките не се прочитаа ({read.error}). Важат стандардните.</Banner>}
        {!read.missingTable && !read.error && !read.stored && (
          <Banner tone="blue">Уште ништо не е зачувано: важат стандардните бројки договорени на 18.10.2026.</Banner>
        )}
        {read.rejected.length > 0 && (
          <Banner tone="red">
            Некои зачувани вредности не важат и се заменети со стандардните: {read.rejected.map((k) => k in LOYALTY_FIELDS ? LOYALTY_FIELDS[k as NumericSetting].label : 'Тркало вклучено').join(', ')}.
            Зачувај повторно за да се поправат.
          </Banner>
        )}

        <Example s={valid ? parsed : read.settings} />

        {SECTIONS.map((sec) => (
          <section key={sec.title} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 mb-4">
            <h2 className="font-bold text-slate-800 text-sm">{sec.title}</h2>
            {sec.note && <p className="text-xs text-slate-500 mt-0.5">{sec.note}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mt-3">{sec.keys.map(field)}</div>
            {sec.title === 'Граница на сите попусти' && (
              <p className="text-xs text-slate-500 mt-3">
                И никогаш под подот: набавна × {String(MARKDOWN_FLOOR).replace('.', ',')}, исто како кај попустите (D-027).
                Подот се пресметува на серверот и купувачот никогаш не го гледа.
              </p>
            )}
            {sec.title === 'Рокови' && crossErrors.map((e) => <p key={e} className="text-xs text-red-600 mt-2">{e}</p>)}
          </section>
        ))}

        <section className={`rounded-xl border shadow-sm p-4 mb-4 ${draft.wheelEnabled ? 'bg-white border-green-300' : 'bg-white border-slate-200'}`}>
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="font-bold text-slate-800 text-sm flex-1">Тркало на среќа</h2>
            <label className="inline-flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={draft.wheelEnabled}
                disabled={read.missingTable}
                onChange={(e) => { setSavedAt(null); setDraft({ ...draft, wheelEnabled: e.target.checked }); }}
                className="h-4 w-4"
              />
              {draft.wheelEnabled ? <span className="text-green-700">Вклучено</span> : <span className="text-slate-600">Исклучено</span>}
            </label>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Додека е исклучено, тркалото не се гледа никаде на сајтот. Пред вклучување: прашај го сметководителот дали е наградна
            игра што бара одобрение. Наградите, шансите и лимитите се во картичката „Тркало“.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 mt-3">{WHEEL_KEYS.map(field)}</div>
        </section>

        <div className="sticky bottom-0 -mx-4 sm:mx-0 bg-slate-50/95 backdrop-blur border-t border-slate-200 sm:border sm:rounded-xl px-4 py-3 flex flex-wrap items-center gap-3">
          <button
            onClick={save}
            disabled={read.missingTable || saving || !valid || !dirty}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? 'Се зачувува…' : 'Зачувај'}
          </button>
          <button
            onClick={() => { setSavedAt(null); setDraft(toDraft(LOYALTY_DEFAULTS)); }}
            disabled={read.missingTable}
            className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-700 hover:bg-white inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Стандардни бројки
          </button>
          <span className="text-xs text-slate-500 ml-auto">
            {savedAt ? (
              <span className="text-green-700 inline-flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Зачувано</span>
            ) : !valid ? (
              <span className="text-red-600">Поправи ги означените полиња</span>
            ) : dirty ? (
              'Има промени што не се зачувани'
            ) : read.updatedAt ? (
              `Последна промена: ${read.updatedAt.toLocaleString('mk-MK')}`
            ) : null}
          </span>
          {saveError && <p className="basis-full text-sm text-red-600">{saveError}</p>}
        </div>
        </>)}
      </div>
    </div>
  );
}

/**
 * The brief's own example, recomputed from the numbers on screen: a product at
 * 2.000 on a 20% sale. It shows the band, what the product earns, what points
 * may pay and where the overall limit sits, so a change reads in denars.
 */
function Example({ s }: { s: LoyaltySettings }) {
  const rows = [
    { label: 'Редовна цена', regular: 2000, price: 2000 },
    { label: 'На −20%', regular: 2000, price: 1600 },
    { label: 'На −40%', regular: 2000, price: 1200 },
  ].map((r) => {
    const band = discountBand(r.regular, r.price, s);
    const earn = Math.floor((r.price * earnRatePctFor(band, s)) / 100);
    const cap = Math.floor((r.price * redeemCapPctFor(band, s)) / 100);
    const lowest = Math.ceil(r.regular * (1 - s.maxTotalDiscountPct / 100));
    const points = Math.max(0, Math.min(cap, r.price - lowest));
    return { ...r, band, earn, cap, lowest, points };
  });
  const bandLabel = { full: 'полна стапка', reduced: 'мал попуст', none: 'без поени' } as const;
  return (
    <section className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 mb-4">
      <h2 className="font-bold text-indigo-900 text-sm">Пример: производ од 2.000 ден.</h2>
      <div className="overflow-x-auto mt-2">
        <table className="w-full text-sm">
          <thead className="text-[11px] uppercase tracking-wider text-indigo-700">
            <tr>
              <th className="py-1 pr-3 text-left">Цена</th>
              <th className="py-1 px-3 text-left">Опсег</th>
              <th className="py-1 px-3 text-right">Заработува</th>
              <th className="py-1 px-3 text-right">Со поени до</th>
              <th className="py-1 pl-3 text-right">Најниска цена</th>
            </tr>
          </thead>
          <tbody className="text-indigo-950">
            {rows.map((r) => (
              <tr key={r.label}>
                <td className="py-1 pr-3 whitespace-nowrap">{r.label} · {fmt(r.price)}</td>
                <td className="py-1 px-3 whitespace-nowrap">{bandLabel[r.band]}</td>
                <td className="py-1 px-3 text-right tabular-nums">{fmt(r.earn)} поени</td>
                <td className="py-1 px-3 text-right tabular-nums">{fmt(r.points)} ден.</td>
                <td className="py-1 pl-3 text-right tabular-nums">{fmt(r.lowest)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-indigo-700 mt-2">
        Најниската цена е границата на сите попусти; подот (набавна × {String(MARKDOWN_FLOOR).replace('.', ',')}) може да ја крене повисоко.
        Целата кошничка уште: поени најмногу {fmt(s.maxRedeemBasketPct)}% од неа, најмалку {fmt(s.minPointsToRedeem)} поени и нарачка од {fmt(s.minOrderForRedeem)} ден.
      </p>
    </section>
  );
}

function Banner({ tone, children }: { tone: 'amber' | 'red' | 'blue'; children: ReactNode }) {
  const cls = {
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    red: 'border-red-200 bg-red-50 text-red-900',
    blue: 'border-blue-200 bg-blue-50 text-blue-900',
  }[tone];
  return (
    <div className={`mb-4 rounded-xl border px-4 py-3 text-sm flex gap-2 ${cls}`}>
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
      <div>{children}</div>
    </div>
  );
}

export default function LoyaltyPage() {
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
        <Link href="/admin" className="text-blue-600 hover:text-blue-700 font-medium">Најави се</Link>
      </div>
    );
  }
  return <LoyaltyView />;
}
