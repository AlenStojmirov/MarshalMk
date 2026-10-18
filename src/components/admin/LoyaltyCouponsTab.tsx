'use client';

/**
 * Coupons, for the owner (Task 13.4): every coupon with its uses, a form to
 * make or change one, and the latest uses on orders.
 *
 * A coupon is public (a code anyone with an account can type) or personal
 * (one account, found by e-mail). It works on every product unless narrowed
 * here (D-032), always within the limits of the basket arithmetic.
 */

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import mk from '@/lib/i18n/translations/mk.json';
import { CATEGORY_GROUPS } from '@/lib/open-to-buy';
import type { CouponKind } from '@/lib/loyalty';
import { findUserByEmail } from '@/lib/points';
import {
  Coupon, CouponWithUses, KIND_LABEL, Redemption, SOURCE_LABEL,
  couponProblems, describeCoupon, fetchCoupons, fetchRedemptions, fetchUserEmails, generateCode, normalizeCode,
  saveCoupon, setCouponActive,
} from '@/lib/coupons';
import { Copy, Pencil, Plus, RefreshCw } from 'lucide-react';

const fmt = (n: number) => Math.round(n).toLocaleString('mk-MK');
const day = (d?: Date) => (d ? d.toLocaleDateString('mk-MK') : '');
const isoDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const CATEGORY_NAMES = (mk as { categoryNames: Record<string, string> }).categoryNames;
const CATEGORIES = Object.keys(CATEGORY_GROUPS).filter((k) => k !== 'vaucer');
const catLabel = (k: string) => CATEGORY_NAMES[k] ?? k;

interface Draft {
  id?: string;
  kind: CouponKind;
  value: string;
  maxDiscount: string;
  minBasket: string;
  startsAt: string;
  endsAt: string;
  maxUses: string;
  maxUsesPerUser: string;
  who: 'public' | 'personal';
  email: string;
  userId?: string;
  code: string;
  include: string[];
  exclude: string[];
  includeProducts: string;
  excludeProducts: string;
  note: string;
  active: boolean;
  source: Coupon['source'];
}

function newDraft(): Draft {
  return {
    kind: 'percent', value: '10', maxDiscount: '', minBasket: '', startsAt: isoDay(new Date()), endsAt: '',
    maxUses: '', maxUsesPerUser: '1', who: 'public', email: '', code: generateCode('MR'),
    include: [], exclude: [], includeProducts: '', excludeProducts: '', note: '', active: true, source: 'public',
  };
}

function toDraft(c: Coupon, email?: string): Draft {
  return {
    id: c.id, kind: c.kind, value: String(c.value), maxDiscount: c.maxDiscount ? String(c.maxDiscount) : '',
    minBasket: c.minBasket ? String(c.minBasket) : '', startsAt: isoDay(c.startsAt), endsAt: c.endsAt ? isoDay(c.endsAt) : '',
    maxUses: c.maxUses ? String(c.maxUses) : '', maxUsesPerUser: c.maxUsesPerUser ? String(c.maxUsesPerUser) : '',
    who: c.userId ? 'personal' : 'public', email: email ?? '', userId: c.userId, code: c.code,
    include: c.includeCategories, exclude: c.excludeCategories,
    includeProducts: c.includeProducts.join(', '), excludeProducts: c.excludeProducts.join(', '),
    note: c.note ?? '', active: c.active, source: c.source,
  };
}

/** Empty is "no limit"; anything else must be a number. */
const num = (s: string) => (s.trim() === '' ? undefined : Number(s.trim().replace(/\s/g, '').replace(',', '.')));
const ids = (s: string) => s.split(/[,\s]+/).map((x) => x.trim()).filter(Boolean);

function fromDraft(d: Draft): Coupon {
  return {
    id: d.id,
    code: normalizeCode(d.code),
    kind: d.kind,
    value: d.kind === 'free_shipping' ? 0 : num(d.value) ?? NaN,
    maxDiscount: d.kind === 'percent' ? num(d.maxDiscount) : undefined,
    minBasket: num(d.minBasket),
    startsAt: new Date(`${d.startsAt}T00:00:00`),
    endsAt: d.endsAt ? new Date(`${d.endsAt}T23:59:59`) : undefined,
    maxUses: num(d.maxUses),
    maxUsesPerUser: num(d.maxUsesPerUser),
    userId: d.who === 'personal' ? d.userId : undefined,
    includeCategories: d.include,
    excludeCategories: d.exclude,
    includeProducts: ids(d.includeProducts),
    excludeProducts: ids(d.excludeProducts),
    source: d.id ? d.source : d.who === 'personal' ? 'manual' : 'public',
    active: d.active,
    note: d.note,
  };
}

function couponState(c: Coupon, now: Date): { text: string; cls: string } {
  if (!c.active) return { text: 'исклучен', cls: 'bg-slate-100 text-slate-600' };
  if (c.endsAt && c.endsAt <= now) return { text: 'истечен', cls: 'bg-slate-100 text-slate-500' };
  if (c.startsAt > now) return { text: 'уште не важи', cls: 'bg-amber-50 text-amber-700' };
  return { text: 'важи', cls: 'bg-green-50 text-green-700' };
}

function scopeText(c: Coupon): string {
  const parts: string[] = [];
  if (c.includeCategories.length) parts.push('само ' + c.includeCategories.map(catLabel).join(', '));
  if (c.includeProducts.length) parts.push(`само ${c.includeProducts.length} производ(и)`);
  if (c.excludeCategories.length) parts.push('без ' + c.excludeCategories.map(catLabel).join(', '));
  if (c.excludeProducts.length) parts.push(`без ${c.excludeProducts.length} производ(и)`);
  return parts.join(' · ');
}

/** The coupons, their latest uses, and the e-mails behind personal ones. */
async function readAll() {
  const [c, r] = await Promise.all([fetchCoupons(supabase), fetchRedemptions(supabase)]);
  const userIds = [...new Set([...c.data.map((x) => x.userId), ...r.data.map((x) => x.userId)].filter((x): x is string => !!x))];
  return { c, r, e: await fetchUserEmails(supabase, userIds) };
}

export default function LoyaltyCouponsTab() {
  const [coupons, setCoupons] = useState<CouponWithUses[]>([]);
  const [uses, setUses] = useState<Redemption[]>([]);
  const [emails, setEmails] = useState<Map<string, string>>(new Map());
  const [loaded, setLoaded] = useState(false);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const [copied, setCopied] = useState<string | null>(null);

  // Bumped to read everything again after a change.
  const [reads, setReads] = useState(0);
  const load = () => setReads((n) => n + 1);
  useEffect(() => {
    let live = true;
    readAll().then(({ c, r, e }) => {
      if (!live) return;
      setMissing(c.missingTable || r.missingTable);
      setError(c.missingTable ? null : c.error ?? r.error ?? null);
      setCoupons(c.data);
      setUses(r.data);
      setEmails(e);
      setNow(new Date());
      setLoaded(true);
    });
    return () => { live = false; };
  }, [reads]);

  const shown = useMemo(
    () => (showAll ? coupons : coupons.filter((c) => couponState(c, now).text === 'важи' || couponState(c, now).text === 'уште не важи')),
    [coupons, showAll, now],
  );

  const copy = async (code: string) => {
    try { await navigator.clipboard.writeText(code); setCopied(code); setTimeout(() => setCopied(null), 1500); } catch { /* no clipboard: the code is on screen */ }
  };

  const toggle = async (c: CouponWithUses) => {
    const r = await setCouponActive(supabase, c.id!, !c.active);
    if (r.error) setError(r.error); else await load();
  };

  const resolveEmail = async () => {
    if (!draft) return;
    const r = await findUserByEmail(supabase, draft.email);
    if (r.error) { setFormError(r.error); return; }
    if (!r.data) { setFormError('Нема профил со таа е-пошта.'); setDraft({ ...draft, userId: undefined }); return; }
    setFormError(null);
    setDraft({ ...draft, userId: r.data.userId, email: r.data.email });
  };

  const save = async () => {
    if (!draft) return;
    if (draft.who === 'personal' && !draft.userId) { setFormError('За личен купон најди го профилот по е-пошта.'); return; }
    const c = fromDraft(draft);
    const problems = couponProblems(c);
    if (problems.length) { setFormError(problems.join(' ')); return; }
    setBusy(true);
    const r = await saveCoupon(supabase, c);
    setBusy(false);
    if (r.error) { setFormError(r.error); return; }
    setDraft(null);
    setFormError(null);
    await load();
  };

  if (!loaded) return <p className="text-sm text-slate-500">Се вчитува…</p>;
  if (missing) {
    return (
      <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        Миграцијата <strong>016</strong> уште не е пуштена: купони уште не постојат.
      </p>
    );
  }

  const set = (patch: Partial<Draft>) => { setFormError(null); setDraft(draft ? { ...draft, ...patch } : draft); };
  const toggleCat = (list: 'include' | 'exclude', k: string) => {
    if (!draft) return;
    const other = list === 'include' ? 'exclude' : 'include';
    const has = draft[list].includes(k);
    set({ [list]: has ? draft[list].filter((x) => x !== k) : [...draft[list], k], [other]: draft[other].filter((x) => x !== k) } as Partial<Draft>);
  };
  const preview = draft ? fromDraft(draft) : null;

  return (
    <div>
      {error && <p className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-900">{error}</p>}

      {!draft && (
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <button
            onClick={() => { setFormError(null); setDraft(newDraft()); }}
            className="px-3 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 inline-flex items-center gap-1.5"
          >
            <Plus className="h-4 w-4" /> Нов купон
          </button>
          <label className="inline-flex items-center gap-2 text-sm text-slate-600 ml-auto">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
            Покажи ги и истечените и исклучените
          </label>
        </div>
      )}

      {draft && preview && (
        <section className="bg-white rounded-xl border border-indigo-200 shadow-sm p-4 mb-4">
          <h2 className="font-bold text-slate-800 text-sm">{draft.id ? `Измени ${draft.code}` : 'Нов купон'}</h2>
          <p className="text-xs text-indigo-700 mt-0.5">{describeCoupon(preview, scopeText(preview))}</p>

          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
            <div className="sm:col-span-2 inline-flex flex-wrap rounded-lg border border-slate-300 overflow-hidden text-sm w-fit">
              {(['percent', 'fixed', 'free_shipping'] as const).map((k) => (
                <button key={k} type="button" onClick={() => set({ kind: k })}
                  className={`px-3 py-1.5 ${draft.kind === k ? 'bg-indigo-600 text-white' : 'bg-white text-slate-700'}`}>
                  {KIND_LABEL[k]}
                </button>
              ))}
            </div>
            {draft.kind !== 'free_shipping' && (
              <Field label={draft.kind === 'percent' ? 'Попуст (%)' : 'Попуст (ден.)'} value={draft.value} onChange={(v) => set({ value: v })} />
            )}
            {draft.kind === 'percent' && (
              <Field label="Најмногу (ден.)" hint="празно = без граница" value={draft.maxDiscount} onChange={(v) => set({ maxDiscount: v })} />
            )}
            <Field label="Најмала кошничка (ден.)" hint="празно = без минимум" value={draft.minBasket} onChange={(v) => set({ minBasket: v })} />
            <div className="flex gap-3">
              <label className="block">
                <span className="text-xs text-slate-600">Важи од</span>
                <input type="date" value={draft.startsAt} onChange={(e) => set({ startsAt: e.target.value })} className="block rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
              </label>
              <label className="block">
                <span className="text-xs text-slate-600">до (празно = без крај)</span>
                <input type="date" value={draft.endsAt} onChange={(e) => set({ endsAt: e.target.value })} className="block rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
              </label>
            </div>
            <Field label="Вкупно користења" hint="празно = без граница" value={draft.maxUses} onChange={(v) => set({ maxUses: v })} />
            <Field label="Користења по купувач" hint="1 = еднократен, празно = без граница" value={draft.maxUsesPerUser} onChange={(v) => set({ maxUsesPerUser: v })} />

            <div className="sm:col-span-2">
              <span className="text-xs text-slate-600">За кого</span>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-sm">
                {(['public', 'personal'] as const).map((w) => (
                  <label key={w} className="inline-flex items-center gap-1.5">
                    <input type="radio" disabled={!!draft.id} checked={draft.who === w} onChange={() => set({ who: w })} />
                    {w === 'public' ? 'Јавен код (секој со профил што го знае)' : 'Личен (еден профил)'}
                  </label>
                ))}
              </div>
              {draft.who === 'personal' && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <input
                    type="email" value={draft.email} disabled={!!draft.id}
                    onChange={(e) => set({ email: e.target.value, userId: undefined })}
                    placeholder="е-пошта на профилот"
                    className="flex-1 min-w-[200px] rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm disabled:bg-slate-100"
                  />
                  {!draft.id && (
                    <button type="button" onClick={resolveEmail} className="px-3 py-1.5 rounded-lg border border-slate-300 text-sm">Најди</button>
                  )}
                  {draft.userId && <span className="text-xs text-green-700">✓ профилот е најден</span>}
                </div>
              )}
            </div>

            <label className="block">
              <span className="text-xs text-slate-600">Код</span>
              <div className="flex gap-2">
                <input
                  value={draft.code} disabled={!!draft.id}
                  onChange={(e) => set({ code: e.target.value.toUpperCase() })}
                  className="block w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-mono disabled:bg-slate-100"
                />
                {!draft.id && (
                  <button type="button" title="Нов код" onClick={() => set({ code: generateCode('MR') })} className="px-2.5 rounded-lg border border-slate-300">
                    <RefreshCw className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
              <span className="text-[11px] text-slate-400">латиница, бројки, цртичка; на пр. ZIMA10</span>
            </label>
            <label className="block">
              <span className="text-xs text-slate-600">Белешка (само за тебе)</span>
              <input value={draft.note} onChange={(e) => set({ note: e.target.value })} className="block w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm" />
            </label>

            <div className="sm:col-span-2">
              <span className="text-xs text-slate-600">Категории: стандардно важи на сите производи (D-032)</span>
              {(['include', 'exclude'] as const).map((list) => (
                <div key={list} className="mt-1.5">
                  <span className="text-[11px] font-semibold text-slate-500">{list === 'include' ? 'Важи само за:' : 'Не важи за:'}</span>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {CATEGORIES.map((k) => (
                      <button key={k} type="button" onClick={() => toggleCat(list, k)}
                        className={`px-2 py-0.5 rounded-full border text-xs ${draft[list].includes(k)
                          ? list === 'include' ? 'bg-indigo-600 border-indigo-600 text-white' : 'bg-red-600 border-red-600 text-white'
                          : 'bg-white border-slate-300 text-slate-600'}`}>
                        {catLabel(k)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <Field label="Само за производи (ID, со запирка)" hint="празно = сите" value={draft.includeProducts} onChange={(v) => set({ includeProducts: v })} wide />
            <Field label="Не важи за производи (ID, со запирка)" value={draft.excludeProducts} onChange={(v) => set({ excludeProducts: v })} wide />
          </div>

          {formError && <p className="mt-3 text-sm text-red-600">{formError}</p>}
          <div className="mt-4 flex gap-2">
            <button onClick={save} disabled={busy} className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 disabled:opacity-50">
              {busy ? 'Се зачувува…' : 'Зачувај'}
            </button>
            <button onClick={() => { setDraft(null); setFormError(null); }} className="px-3 py-2 rounded-lg border border-slate-300 text-sm text-slate-700">Откажи</button>
          </div>
        </section>
      )}

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm mb-4">
        <h2 className="font-bold text-slate-800 text-sm px-4 py-3 border-b border-slate-100">Купони ({shown.length})</h2>
        {shown.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">Нема купони{showAll ? '' : ' што важат'}.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-slate-500 bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left">Код</th>
                  <th className="px-3 py-2 text-left">Што</th>
                  <th className="px-3 py-2 text-left">За кого</th>
                  <th className="px-3 py-2 text-left">Важи</th>
                  <th className="px-3 py-2 text-right">Користења</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((c) => {
                  const st = couponState(c, now);
                  return (
                    <tr key={c.id}>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <button onClick={() => copy(c.code)} className="font-mono font-medium text-slate-800 inline-flex items-center gap-1 hover:text-indigo-700" title="Копирај">
                          {c.code} <Copy className="h-3 w-3 text-slate-400" />
                        </button>
                        {copied === c.code && <span className="ml-1 text-[11px] text-green-700">копирано</span>}
                        <p className="text-[11px] text-slate-400">{SOURCE_LABEL[c.source]}</p>
                      </td>
                      <td className="px-3 py-2 text-slate-700">
                        {describeCoupon(c, scopeText(c))}
                        {c.note && <p className="text-[11px] text-slate-400">{c.note}</p>}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{c.userId ? emails.get(c.userId) ?? 'личен' : 'јавен'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`px-1.5 py-0.5 rounded text-[11px] font-medium ${st.cls}`}>{st.text}</span>
                        <p className="text-[11px] text-slate-500 mt-0.5">{day(c.startsAt)} – {c.endsAt ? day(c.endsAt) : 'без крај'}</p>
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">
                        {fmt(c.uses)} / {c.maxUses ? fmt(c.maxUses) : '∞'}
                        <p className="text-[11px] text-slate-400">{c.maxUsesPerUser ? `${c.maxUsesPerUser}× по купувач` : 'без граница по купувач'}</p>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-right">
                        <button onClick={() => { setFormError(null); setDraft(toDraft(c, c.userId ? emails.get(c.userId) : undefined)); }} className="p-1.5 text-slate-500 hover:text-indigo-700" title="Измени">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button onClick={() => toggle(c)} className={`ml-1 px-2 py-1 rounded text-xs border ${c.active ? 'border-slate-300 text-slate-600' : 'border-green-300 text-green-700'}`}>
                          {c.active ? 'Исклучи' : 'Вклучи'}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm">
        <h2 className="font-bold text-slate-800 text-sm px-4 py-3 border-b border-slate-100">Последни користења ({uses.length})</h2>
        {uses.length === 0 ? (
          <p className="px-4 py-6 text-sm text-slate-500">Уште ниту еден купон не е искористен.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[11px] uppercase tracking-wider text-slate-500 bg-slate-50">
                <tr>
                  <th className="px-3 py-2 text-left">Датум</th>
                  <th className="px-3 py-2 text-left">Код</th>
                  <th className="px-3 py-2 text-left">Купувач</th>
                  <th className="px-3 py-2 text-left">Нарачка</th>
                  <th className="px-3 py-2 text-right">Попуст</th>
                  <th className="px-3 py-2 text-right">Достава</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {uses.map((u) => (
                  <tr key={u.id} className={u.releasedAt ? 'text-slate-400' : ''}>
                    <td className="px-3 py-2 whitespace-nowrap">{day(u.createdAt)}</td>
                    <td className="px-3 py-2 font-mono">{u.code}</td>
                    <td className="px-3 py-2">{emails.get(u.userId) ?? ''}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {u.orderNumber ?? ''}
                      {u.releasedAt && <span className="ml-1 text-[11px]">(откажана, не се брои)</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(u.discount)} ден.</td>
                    <td className="px-3 py-2 text-right tabular-nums">{u.shippingWaived ? `${fmt(u.shippingWaived)} ден.` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Field({ label, hint, value, onChange, wide }: { label: string; hint?: string; value: string; onChange: (v: string) => void; wide?: boolean }) {
  return (
    <label className={`block ${wide ? 'sm:col-span-2' : ''}`}>
      <span className="text-xs text-slate-600">{label}</span>
      <input
        inputMode={wide ? 'text' : 'decimal'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`block rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm ${wide ? 'w-full' : 'w-32 text-right tabular-nums'}`}
      />
      {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}
