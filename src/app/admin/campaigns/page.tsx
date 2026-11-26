'use client';

/**
 * Campaigns — Black Friday and the like (D-051). Admin only: the route is in
 * no other role's ROLE_PATHS, and the settings row is the admin's (020).
 *
 * A campaign is its dates, its words, and a price for each product in it.
 * Nothing is written to the products: the shop sells at the campaign price
 * from the start to the end on its own, and at its own price again after.
 * The prices are suggested by the discount rule (D-027) and the floor
 * (cost + 15%), and every one can be changed here before saving.
 */

import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, Check, Copy, Plus, Sparkles, Trash2, Wand2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useProducts } from '@/hooks/useProducts';
import type { Product } from '@/types';
import { fetchStoreSettings, saveStoreSettings, type StoreSettingsRead } from '@/lib/store-settings';
import {
  campaignPhase, campaignProblems, campaignReference, shopDate, standingPrice, MAX_CAMPAIGN_DAYS,
  type Campaign, type CampaignItem, type CampaignPhase,
} from '@/lib/campaign';
import {
  blackFridayDay, campaignPriceFor, DEFAULT_SUGGEST_RULE, newBlackFriday, suggestCampaign,
  type SuggestRule,
} from '@/lib/campaign-suggest';
import { discountVerdict, type DiscountKind } from '@/lib/discount-rule';
import { markdownFloorPrice } from '@/lib/cost';
import { productTitle } from '@/lib/product-display';
import { mkDen, mkNumber } from '@/lib/mk-format';
import CampaignInstagram from '@/components/admin/CampaignInstagram';

const PHASE_LABEL: Record<CampaignPhase, string> = {
  upcoming: 'Закажана',
  teaser: 'Одбројува',
  live: 'Трае сега',
  over: 'Заврши',
};
const PHASE_TONE: Record<CampaignPhase, string> = {
  upcoming: 'bg-slate-100 text-slate-700',
  teaser: 'bg-amber-100 text-amber-800',
  live: 'bg-green-100 text-green-800',
  over: 'bg-slate-100 text-slate-500',
};
const KIND_LABEL: Record<DiscountKind, string> = {
  dead: 'Мртва стока',
  sizes: '1–2 големини',
  preseason: 'Остаток, пред-сезона',
  wait: 'Надвор од сезона',
  full: 'Цела серија',
};
const KIND_HINT: Record<DiscountKind, string> = {
  dead: 'година без продажба: пари што стојат',
  sizes: 'скршена серија: смее попуст (D-027)',
  preseason: 'лањски остаток, сезоната почнува',
  wait: 'D-027: попуст во пред-сезона, не сега',
  full: 'полна цена: се продава и без попуст',
};
const KINDS: DiscountKind[] = ['dead', 'sizes', 'preseason', 'wait', 'full'];

const pad = (n: number) => String(n).padStart(2, '0');
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fromLocalInput(v: string): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

const onShelf = (p: Product) => p.isVisible !== false && (p.sizes ?? []).some((s) => s.quantity >= 1);
const unitsOf = (p: Product) => (p.sizes ?? []).reduce((a, s) => a + Math.max(0, s.quantity), 0);
const hasPhoto = (p: Product) => /^(https?:\/\/|\/)/.test(p.imageUrl?.trim() ?? '');

/** The Black Friday a new campaign is for: this year's until it has passed, then next year's. */
function nextBlackFridayYear(now = new Date()): number {
  const { y, m, d } = blackFridayDay(now.getFullYear());
  return now > new Date(y, m - 1, d + 3) ? y + 1 : y;
}

interface Totals {
  models: number;
  units: number;
  revenue: number;
  cost: number;
  maxPct: number;
  belowFloor: number;
}

function Stat({ k, v, tone = 'text-slate-800' }: { k: string; v: string; tone?: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 px-4 py-3">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{k}</div>
      <div className={`text-lg font-bold ${tone}`}>{v}</div>
    </div>
  );
}

function Editor({
  initial, isNew, products, others, onSaved, onCancel,
}: {
  initial: Campaign;
  /** Not saved yet: its id may still change. */
  isNew: boolean;
  products: Product[];
  others: Campaign[];
  onSaved: (all: Campaign[]) => void;
  onCancel: () => void;
}) {
  const [c, setC] = useState<Campaign>(initial);
  const [items, setItems] = useState<Map<string, CampaignItem>>(() => new Map(initial.items.map((i) => [i.id, i])));
  const [rule, setRule] = useState<SuggestRule>(DEFAULT_SUGGEST_RULE);
  const [onlyIn, setOnlyIn] = useState(initial.items.length > 0);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [now] = useState(() => Date.now());

  const shelf = useMemo(() => products.filter(onShelf), [products]);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const verdicts = useMemo(() => new Map(shelf.map((p) => [p.id, discountVerdict(p, now)])), [shelf, now]);

  const touched = () => { setSaved(false); setError(null); };
  const set = (patch: Partial<Campaign>) => { touched(); setC({ ...c, ...patch }); };

  const suggest = () => {
    touched();
    const next = new Map<string, CampaignItem>();
    for (const s of suggestCampaign(shelf, rule, now)) {
      if (s.price === null) continue;
      next.set(s.product.id, { id: s.product.id, price: s.price, before: items.get(s.product.id)?.before ? Math.min(items.get(s.product.id)!.before, s.before) : s.before });
    }
    setItems(next);
    setOnlyIn(true);
  };

  const setItem = (p: Product, patch: Partial<CampaignItem> | null) => {
    touched();
    const next = new Map(items);
    if (patch === null) next.delete(p.id);
    else {
      const was = next.get(p.id) ?? { id: p.id, price: standingPrice(p), before: standingPrice(p) };
      next.set(p.id, { ...was, ...patch });
    }
    setItems(next);
  };

  const rows = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const match = (p: Product) => {
      if (!words.length) return true;
      const hay = `${p.name} ${p.id} ${productTitle(p, 'mk')} ${p.category}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    };
    const pctOf = (p: Product) => {
      const it = items.get(p.id);
      return it ? 1 - it.price / campaignReference(it, p) : -1;
    };
    return shelf
      .filter((p) => (!onlyIn || items.has(p.id)) && match(p))
      .sort((a, b) => pctOf(b) - pctOf(a) || unitsOf(b) * standingPrice(b) - unitsOf(a) * standingPrice(a));
  }, [shelf, items, onlyIn, query]);

  const totals: Totals = useMemo(() => {
    const t: Totals = { models: 0, units: 0, revenue: 0, cost: 0, maxPct: 0, belowFloor: 0 };
    for (const it of items.values()) {
      const p = byId.get(it.id);
      if (!p || !onShelf(p)) continue;
      const ref = campaignReference(it, p);
      if (!(it.price < ref)) continue;
      const u = unitsOf(p);
      t.models++;
      t.units += u;
      t.revenue += u * it.price;
      t.cost += u * (p.purchasePrice ?? 0);
      t.maxPct = Math.max(t.maxPct, Math.round((1 - it.price / ref) * 100));
      const floor = markdownFloorPrice(p.purchasePrice);
      if (floor !== null && it.price < floor) t.belowFloor++;
    }
    return t;
  }, [items, byId]);

  const draft: Campaign = { ...c, items: [...items.values()].filter((i) => byId.has(i.id)) };
  const problems = campaignProblems(draft);
  if (others.some((o) => o.id === draft.id)) problems.push('Веќе има кампања со оваа ознака.');

  const save = async () => {
    if (problems.length) return;
    setSaving(true);
    setError(null);
    const all = [draft, ...others.filter((o) => o.id !== initial.id && o.id !== draft.id)];
    const r = await saveStoreSettings(supabase, { campaigns: all });
    setSaving(false);
    if (r.error) { setError(r.error); return; }
    setSaved(true);
    onSaved(all);
  };

  const margin = totals.revenue > 0 ? Math.round((1 - totals.cost / totals.revenue) * 100) : null;
  const regular = [...items.values()].reduce((a, it) => {
    const p = byId.get(it.id);
    return p && onShelf(p) ? a + unitsOf(p) * campaignReference(it, p) : a;
  }, 0);

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-800 mb-4">Датуми и текст</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm">
            <span className="text-slate-600">Име (се гледа на сајтот, исто на двата јазика)</span>
            <input value={c.name} onChange={(e) => set({ name: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="text-slate-600">Ознака (за следната година: нова ознака)</span>
            <input value={c.id} disabled={!isNew} onChange={(e) => set({ id: e.target.value.trim().toLowerCase() })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm disabled:bg-slate-50 disabled:text-slate-500" />
          </label>
          <label className="text-sm">
            <span className="text-slate-600">Почеток (цените паѓаат)</span>
            <input type="datetime-local" value={toLocalInput(c.startsAt)} onChange={(e) => set({ startsAt: fromLocalInput(e.target.value) ?? c.startsAt })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="text-slate-600">Крај (цените се враќаат сами)</span>
            <input type="datetime-local" value={toLocalInput(c.endsAt)} onChange={(e) => set({ endsAt: fromLocalInput(e.target.value) ?? c.endsAt })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="text-slate-600">Одбројување на сајтот од (празно: без)</span>
            <input type="datetime-local" value={toLocalInput(c.teaserFrom)} onChange={(e) => set({ teaserFrom: fromLocalInput(e.target.value) })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="flex items-center gap-2 text-sm self-end pb-2">
            <input type="checkbox" checked={c.intro} onChange={(e) => set({ intro: e.target.checked })} className="h-4 w-4" />
            <span className="text-slate-700">Анимација при влез на сајтот (еднаш по посетител)</span>
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="text-slate-600">Порака под името, македонски</span>
            <input value={c.headline.mk} onChange={(e) => set({ headline: { ...c.headline, mk: e.target.value } })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
          <label className="text-sm sm:col-span-2">
            <span className="text-slate-600">Порака под името, англиски</span>
            <input value={c.headline.en} onChange={(e) => set({ headline: { ...c.headline, en: e.target.value } })} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
          </label>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          Акциска продажба смее да трае најмногу {MAX_CAMPAIGN_DAYS} дена, а датумите мора да се кажат во рекламата — сајтот и
          сликите за Instagram ги пишуваат сами. Зачуваното е на сајтот за една минута.
        </p>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-3">
          <div>
            <h2 className="font-semibold text-slate-800 flex items-center gap-2"><Wand2 className="h-4 w-4" /> Предлог за цени</h2>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              Попуст од цената што производот ја има денес (таа е прецртаната цена: најниската во 30 дена пред акцијата).
              Никогаш под подот: набавна + 15%. Цените завршуваат на 0 или 50.
            </p>
          </div>
          <button type="button" onClick={suggest} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
            <Sparkles className="h-4 w-4" /> Предложи цени
          </button>
        </div>
        <div className="grid gap-3 sm:grid-cols-5">
          {KINDS.map((k) => {
            const n = shelf.filter((p) => verdicts.get(p.id)?.kind === k).length;
            return (
              <label key={k} className="rounded-lg border border-slate-200 p-3 text-sm">
                <span className="font-medium text-slate-800">{KIND_LABEL[k]}</span>
                <span className="block text-[11px] text-slate-500">{n} модели · {KIND_HINT[k]}</span>
                <span className="mt-2 flex items-center gap-1">
                  <span className="text-slate-500">−</span>
                  <input
                    type="number" min={0} max={70} step={5} value={rule[k]}
                    onChange={(e) => setRule({ ...rule, [k]: Math.max(0, Math.min(70, Number(e.target.value) || 0)) })}
                    className="w-16 rounded border border-slate-300 px-2 py-1 text-right"
                  />
                  <span className="text-slate-500">%</span>
                </span>
              </label>
            );
          })}
        </div>
      </section>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <Stat k="Модели во акција" v={mkNumber(totals.models)} />
        <Stat k="Парчиња" v={mkNumber(totals.units)} />
        <Stat k="Ако се продаде сè" v={mkDen(totals.revenue)} />
        <Stat k="Маржа во акција" v={margin === null ? '—' : `${margin}%`} tone={margin !== null && margin < 25 ? 'text-red-700' : 'text-slate-800'} />
        <Stat k="Најголем попуст" v={totals.maxPct ? `до −${totals.maxPct}%` : '—'} tone="text-amber-700" />
      </div>
      {regular > totals.revenue && totals.revenue > 0 && (
        <p className="text-xs text-slate-500 -mt-3">
          По цените од денес истите парчиња се {mkDen(regular)}: акцијата дава {mkDen(regular - totals.revenue)} попуст ако се продаде сè.
        </p>
      )}

      <section className="bg-white rounded-xl border border-slate-200">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 p-4">
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Барај: шифра, наслов…" className="flex-1 min-w-[12rem] rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input type="checkbox" checked={onlyIn} onChange={(e) => setOnlyIn(e.target.checked)} className="h-4 w-4" />
            Само во акција ({items.size})
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2 w-8" />
                <th className="px-3 py-2 text-left">Модел</th>
                <th className="px-3 py-2 text-left">Правило</th>
                <th className="px-3 py-2 text-right">Парч.</th>
                <th className="px-3 py-2 text-right" title="Прецртаната цена: најниската во 30 дена пред акцијата">Цена пред</th>
                <th className="px-3 py-2 text-right">Попуст</th>
                <th className="px-3 py-2 text-right">Акциска</th>
                <th className="px-3 py-2 text-right">Маржа</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((p) => {
                const it = items.get(p.id);
                const v = verdicts.get(p.id);
                // What the site strikes through: never above the price it sells at now.
                const before = it ? campaignReference(it, p) : standingPrice(p);
                const capped = !!it && it.before > before;
                const pct = it && before > 0 ? Math.round((1 - it.price / before) * 100) : 0;
                const floor = markdownFloorPrice(p.purchasePrice);
                const below = !!it && floor !== null && it.price < floor;
                const notLower = !!it && it.price >= before;
                const m = it && p.purchasePrice ? Math.round((1 - p.purchasePrice / it.price) * 100) : null;
                return (
                  <tr key={p.id} className={it ? 'bg-amber-50/40' : ''}>
                    <td className="px-3 py-2">
                      <input
                        type="checkbox" checked={!!it} className="h-4 w-4"
                        aria-label="Во акција"
                        onChange={(e) => {
                          if (!e.target.checked) return setItem(p, null);
                          const pctFor = rule[v?.kind ?? 'full'] || 20;
                          setItem(p, { before: standingPrice(p), price: campaignPriceFor(standingPrice(p), pctFor, p.purchasePrice).price });
                        }}
                      />
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-3">
                        <div className="relative h-12 w-9 shrink-0 overflow-hidden rounded bg-slate-100">
                          {hasPhoto(p) && <Image src={p.imageUrl.trim()} alt="" fill sizes="36px" className="object-cover" />}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate font-medium text-slate-800 max-w-[16rem]">{productTitle(p, 'mk')}</div>
                          <div className="font-mono text-[11px] text-slate-500">{p.name}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600" title={v?.reason}>{v ? KIND_LABEL[v.kind] : ''}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{unitsOf(p)}</td>
                    <td className="px-3 py-2 text-right">
                      {it ? (
                        <input
                          type="number" min={1} value={it.before}
                          onChange={(e) => setItem(p, { before: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                          className={`w-20 rounded border px-2 py-1 text-right tabular-nums ${capped ? 'border-amber-400' : 'border-slate-300'}`}
                        />
                      ) : (
                        <span className="tabular-nums text-slate-600">{mkNumber(standingPrice(p))}</span>
                      )}
                      {capped && <div className="text-[10px] text-amber-700">на сајтот {mkNumber(before)}: сега е по таа цена</div>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {it && (
                        <span className="inline-flex items-center gap-1">
                          −<input
                            type="number" min={0} max={90} step={5} value={pct}
                            onChange={(e) => setItem(p, { price: campaignPriceFor(before, Math.max(0, Number(e.target.value) || 0), p.purchasePrice).price })}
                            className="w-14 rounded border border-slate-300 px-2 py-1 text-right tabular-nums"
                          />%
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {it && (
                        <input
                          type="number" min={1} value={it.price}
                          onChange={(e) => setItem(p, { price: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                          className={`w-20 rounded border px-2 py-1 text-right font-semibold tabular-nums ${below || notLower ? 'border-red-400 text-red-700' : 'border-slate-300'}`}
                        />
                      )}
                      {below && <div className="text-[10px] text-red-600">под подот {mkNumber(floor!)}</div>}
                      {notLower && <div className="text-[10px] text-red-600">не е пониска</div>}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${m !== null && m < 20 ? 'text-red-700' : 'text-slate-600'}`}>{m === null ? '' : `${m}%`}</td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-10 text-center text-slate-500">{onlyIn ? 'Ништо уште не е во акција: „Предложи цени“ или штиклирај од целата листа.' : 'Нема такви производи на сајтот.'}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="sticky bottom-0 z-10 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        {problems.length > 0 && (
          <ul className="mb-2 space-y-0.5 text-sm text-red-700">
            {problems.map((p) => <li key={p} className="flex items-center gap-1.5"><AlertTriangle className="h-3.5 w-3.5" />{p}</li>)}
          </ul>
        )}
        {totals.belowFloor > 0 && (
          <p className="mb-2 text-sm text-amber-700">{totals.belowFloor} цени се под подот (набавна + 15%): секое такво парче го троши капиталот.</p>
        )}
        {error && <p className="mb-2 text-sm text-red-700">{error}</p>}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={save} disabled={saving || problems.length > 0} className="inline-flex items-center gap-2 rounded-lg bg-amber-400 px-5 py-2.5 font-semibold text-slate-900 hover:bg-amber-300 disabled:opacity-50">
            {saved ? <Check className="h-4 w-4" /> : null}
            {saving ? 'Се зачувува…' : saved ? 'Зачувано' : 'Зачувај ја кампањата'}
          </button>
          <button type="button" onClick={onCancel} className="inline-flex items-center gap-1 rounded-lg px-4 py-2.5 text-slate-600 hover:bg-slate-100">
            <X className="h-4 w-4" /> Назад на листата
          </button>
          <span className="text-xs text-slate-500">
            {shopDate('mk', c.startsAt)} {new Date(c.startsAt).toTimeString().slice(0, 5)} → {shopDate('mk', c.endsAt, true)} {new Date(c.endsAt).toTimeString().slice(0, 5)}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function CampaignsPage() {
  const { products, loading } = useProducts();
  const [read, setRead] = useState<StoreSettingsRead | null>(null);
  const [editing, setEditing] = useState<Campaign | null>(null);
  const [instagram, setInstagram] = useState<string | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchStoreSettings(supabase).then(setRead);
  }, []);

  if (loading || !read) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  const campaigns = read.settings.campaigns;
  const year = nextBlackFridayYear();
  const nextId = `black-friday-${year}`;
  const hasNext = campaigns.some((c) => c.id === nextId);
  const shownFor = instagram ? campaigns.find((c) => c.id === instagram) : null;

  const remove = async (id: string) => {
    setError(null);
    const all = campaigns.filter((c) => c.id !== id);
    const r = await saveStoreSettings(supabase, { campaigns: all });
    setRemoving(null);
    if (r.error) { setError(r.error); return; }
    setRead({ ...read, settings: { ...read.settings, campaigns: all } });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
        <Link href="/admin" className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-800 mb-4 text-sm">
          <ArrowLeft className="h-4 w-4" />
          Назад на таблата
        </Link>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">Кампањи · Black Friday</h1>
        <p className="text-sm text-slate-500 mt-1 mb-6 max-w-3xl">
          Цените на акцијата важат само од почетокот до крајот, сами — ништо не се враќа рачно, а цената на производот
          не се менува. На сајтот: црна лента со одбројување на секоја страна, анимација при влез, голем дел на почетната и
          страница <Link href="/black-friday" className="underline" target="_blank">/black-friday</Link>. Важи и на каса во дуќанот (продажба со QR).
        </p>

        {read.missingTable && (
          <p className="mb-6 rounded-lg bg-red-50 p-3 text-sm text-red-700">Табелата за поставки ја нема (миграција 020): кампања не може да се зачува.</p>
        )}
        {error && <p className="mb-4 text-sm text-red-700">{error}</p>}

        {editing ? (
          <Editor
            key={editing.id}
            initial={editing}
            isNew={!campaigns.some((c) => c.id === editing.id)}
            products={products}
            others={campaigns.filter((c) => c.id !== editing.id)}
            onSaved={(all) => setRead({ ...read, settings: { ...read.settings, campaigns: all } })}
            onCancel={() => setEditing(null)}
          />
        ) : (
          <>
            {!hasNext && (
              <button
                type="button"
                onClick={() => setEditing(newBlackFriday(year, campaigns[0]))}
                className="mb-6 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-3 font-semibold text-white hover:bg-slate-700"
              >
                <Plus className="h-4 w-4" /> Нов Black Friday {year}
              </button>
            )}

            <div className="space-y-3">
              {campaigns.length === 0 && (
                <p className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500">
                  Уште нема кампања. „Нов Black Friday“ ги пополнува датумите (петок–недела) и текстот; цените ги предлага правилото.
                </p>
              )}
              {campaigns.map((c) => {
                const phase = campaignPhase(c);
                const live = c.items.filter((i) => { const p = products.find((x) => x.id === i.id); return p && onShelf(p); }).length;
                return (
                  <div key={c.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex-1 min-w-[14rem]">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-800">{c.name}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${PHASE_TONE[phase]}`}>{PHASE_LABEL[phase]}</span>
                      </div>
                      <div className="text-sm text-slate-500">
                        {shopDate('mk', c.startsAt)} – {shopDate('mk', c.endsAt, true)} · {c.items.length} производи ({live} на полица) · <span className="font-mono text-xs">{c.id}</span>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {phase !== 'over' && (
                        <button type="button" onClick={() => setEditing(c)} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">Уреди</button>
                      )}
                      <button type="button" onClick={() => setInstagram(instagram === c.id ? null : c.id)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
                        Instagram
                      </button>
                      {phase === 'over' && !hasNext && (
                        <button type="button" onClick={() => setEditing(newBlackFriday(year, c))} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
                          <Copy className="h-4 w-4" /> Истото за {year}
                        </button>
                      )}
                      {removing === c.id ? (
                        <span className="inline-flex items-center gap-2 text-sm">
                          <span className="text-red-700">Да се избрише?</span>
                          <button type="button" onClick={() => remove(c.id)} className="rounded-lg bg-red-600 px-3 py-2 text-white">Да</button>
                          <button type="button" onClick={() => setRemoving(null)} className="rounded-lg px-3 py-2 text-slate-600 hover:bg-slate-100">Не</button>
                        </span>
                      ) : (
                        <button type="button" onClick={() => setRemoving(c.id)} aria-label="Избриши" className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {shownFor && <CampaignInstagram campaign={shownFor} products={products} />}
          </>
        )}
      </div>
    </div>
  );
}
