'use client';

/**
 * One campaign's dates, words and prices (D-051), on /admin/campaigns.
 *
 * The product list only moves when a filter or the order changes: ticking a
 * product never re-sorts it away or drops it from the view, so the page stays
 * where it is (it used to sort by the cut, and a ticked row jumped up with the
 * page after it). Filters by group, kind of category and the discount rule,
 * and whatever is shown can be added, removed or given one cut at once. Each
 * product in the campaign has its story for Instagram, and all of them come
 * at once as a .zip.
 */

import { useMemo, useState, useSyncExternalStore } from 'react';
import Image from 'next/image';
import { AlertTriangle, Check, ImageDown, Loader2, Sparkles, Wand2, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { Product } from '@/types';
import { saveStoreSettings } from '@/lib/store-settings';
import {
  campaignProblems, campaignReference, shopDate, standingPrice, MAX_CAMPAIGN_DAYS,
  type Campaign, type CampaignItem,
} from '@/lib/campaign';
import { campaignPriceFor, DEFAULT_SUGGEST_RULE, suggestCampaign, type SuggestRule } from '@/lib/campaign-suggest';
import { discountVerdict, type DiscountKind } from '@/lib/discount-rule';
import { markdownFloorPrice } from '@/lib/cost';
import { canonicalCategory, groupOfCategory, groupsInSeasonOrder, type GroupKey } from '@/config/categories';
import { categoryName, groupName, productTitle } from '@/lib/product-display';
import { mkDen, mkNumber } from '@/lib/mk-format';
import { campaignArt, campaignCard, hasPhoto, storyFileName } from '@/lib/campaign-art';
import { BulkStoriesButton, StoryPreview, useCampaignStories, type StoryJob } from '@/components/admin/CampaignStories';

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

type Status = 'all' | 'in' | 'out';
type Sort = 'group' | 'discount' | 'priceDesc' | 'priceAsc' | 'units' | 'newest';
const SORT_LABEL: Record<Sort, string> = {
  group: 'По категорија',
  discount: 'Најголем попуст',
  priceDesc: 'Цена: највисока',
  priceAsc: 'Цена: најниска',
  units: 'Најмногу парчиња',
  newest: 'Најнови',
};
/** The cut a product gets when ticked and its kind's rule says none. */
const DEFAULT_CUT = 20;

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

export const onShelf = (p: Product) => p.isVisible !== false && (p.sizes ?? []).some((s) => s.quantity >= 1);
const unitsOf = (p: Product) => (p.sizes ?? []).reduce((a, s) => a + Math.max(0, s.quantity), 0);
const liveSizes = (p: Product) => (p.sizes ?? []).filter((s) => s.quantity >= 1).map((s) => s.size).join(' ');
const time = (d: Date | string | undefined) => (d ? new Date(d).getTime() || 0 : 0);

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

/** The shop's header stays on top of every page, the back office too: the filters stop under it. */
function headerHeight(): number {
  return Math.round(document.querySelector('header.sticky')?.getBoundingClientRect().height ?? 0);
}
function onHeaderResize(cb: () => void) {
  const header = document.querySelector('header.sticky');
  if (!header) return () => {};
  const ro = new ResizeObserver(cb);
  ro.observe(header);
  return () => ro.disconnect();
}

function chip(active: boolean) {
  return `inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
    active ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:ring-slate-400'
  }`;
}

export default function CampaignEditor({
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
  // The selection as it was when the list was last ordered: what decides which
  // rows show under "in the campaign" and in what order, so ticking moves nothing.
  const [view, setView] = useState<Map<string, CampaignItem>>(items);
  const [rule, setRule] = useState<SuggestRule>(DEFAULT_SUGGEST_RULE);
  const [status, setStatus] = useState<Status>(initial.items.length > 0 ? 'in' : 'all');
  const [group, setGroup] = useState<GroupKey | 'all'>('all');
  const [cat, setCat] = useState<string>('all');
  const [kind, setKind] = useState<DiscountKind | 'all'>('all');
  const [sort, setSort] = useState<Sort>('group');
  const [query, setQuery] = useState('');
  const [bulkPct, setBulkPct] = useState(30);
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [now] = useState(() => Date.now());
  const headerH = useSyncExternalStore(onHeaderResize, headerHeight, () => 0);

  const shelf = useMemo(() => products.filter(onShelf), [products]);
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const verdicts = useMemo(() => new Map(shelf.map((p) => [p.id, discountVerdict(p, now)])), [shelf, now]);
  const groups = useMemo(() => groupsInSeasonOrder(new Date(now)), [now]);

  const touched = () => { setSaved(false); setError(null); setNote(null); };
  const set = (patch: Partial<Campaign>) => { touched(); setC({ ...c, ...patch }); };
  /** A filter or the order changed: the list is drawn again from the selection as it is now. */
  const refilter = () => { setView(items); setNote(null); };

  /** The price a product goes in at when ticked: its kind's cut, never under the floor. */
  const fresh = (p: Product): CampaignItem => {
    const pct = rule[verdicts.get(p.id)?.kind ?? 'full'] || DEFAULT_CUT;
    const before = standingPrice(p);
    return { id: p.id, before, price: campaignPriceFor(before, pct, p.purchasePrice).price };
  };

  const suggest = () => {
    touched();
    const next = new Map<string, CampaignItem>();
    for (const s of suggestCampaign(shelf, rule, now)) {
      if (s.price === null) continue;
      const was = items.get(s.product.id)?.before;
      next.set(s.product.id, { id: s.product.id, price: s.price, before: was ? Math.min(was, s.before) : s.before });
    }
    setItems(next);
    setView(next);
    setStatus('in');
  };

  const setItem = (p: Product, patch: Partial<CampaignItem> | null) => {
    touched();
    const next = new Map(items);
    if (patch === null) next.delete(p.id);
    else next.set(p.id, { ...(next.get(p.id) ?? fresh(p)), ...patch });
    setItems(next);
  };

  const groupOf = (p: Product) => groupOfCategory(p.category)?.key;

  const rows = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const matches = (p: Product) => {
      if (!words.length) return true;
      const hay = `${p.name} ${p.id} ${productTitle(p, 'mk')} ${p.category} ${categoryName(p.category, 'mk')}`.toLowerCase();
      return words.every((w) => hay.includes(w));
    };
    const gIndex = new Map(groups.map((g, i) => [g.key, i]));
    const catIndex = (p: Product) => groupOfCategory(p.category)?.categories.indexOf(canonicalCategory(p.category)) ?? 99;
    const cutIn = (p: Product) => {
      const it = view.get(p.id);
      return it ? 1 - it.price / campaignReference(it, p) : -1;
    };
    const title = (p: Product) => productTitle(p, 'mk');
    const cmp: Record<Sort, (a: Product, b: Product) => number> = {
      group: (a, b) =>
        (gIndex.get(groupOfCategory(a.category)?.key as GroupKey) ?? 99) - (gIndex.get(groupOfCategory(b.category)?.key as GroupKey) ?? 99) ||
        catIndex(a) - catIndex(b) || title(a).localeCompare(title(b), 'mk'),
      discount: (a, b) => cutIn(b) - cutIn(a) || unitsOf(b) * standingPrice(b) - unitsOf(a) * standingPrice(a),
      priceDesc: (a, b) => standingPrice(b) - standingPrice(a),
      priceAsc: (a, b) => standingPrice(a) - standingPrice(b),
      units: (a, b) => unitsOf(b) - unitsOf(a),
      newest: (a, b) => time(b.createdAt) - time(a.createdAt),
    };
    return shelf
      .filter((p) => status === 'all' || (status === 'in') === view.has(p.id))
      .filter((p) => group === 'all' || groupOfCategory(p.category)?.key === group)
      .filter((p) => cat === 'all' || canonicalCategory(p.category) === cat)
      .filter((p) => kind === 'all' || verdicts.get(p.id)?.kind === kind)
      .filter(matches)
      .sort(cmp[sort]);
  }, [shelf, view, status, group, cat, kind, query, sort, verdicts, groups]);

  // Counts for the chips: groups over the whole shelf, the rest within the group chosen.
  const inGroup = shelf.filter((p) => group === 'all' || groupOf(p) === group);
  const groupCounts = new Map<string, { n: number; inn: number }>();
  for (const p of shelf) {
    const k = groupOf(p) ?? 'other';
    const g = groupCounts.get(k) ?? { n: 0, inn: 0 };
    g.n++;
    if (items.has(p.id)) g.inn++;
    groupCounts.set(k, g);
  }
  const cats = group === 'all' ? [] : (groups.find((g) => g.key === group)?.categories ?? []).filter((raw) =>
    inGroup.some((p) => canonicalCategory(p.category) === raw));
  const kindCounts = new Map(KINDS.map((k) => [k, inGroup.filter((p) => (cat === 'all' || canonicalCategory(p.category) === cat) && verdicts.get(p.id)?.kind === k).length]));
  const inCount = shelf.filter((p) => items.has(p.id)).length;
  const filtered = group !== 'all' || kind !== 'all' || status !== 'all' || query.trim() !== '';

  const shownIn = rows.filter((p) => items.has(p.id));
  const shownOut = rows.filter((p) => !items.has(p.id));

  const addShown = () => {
    touched();
    const next = new Map(items);
    let skipped = 0;
    for (const p of shownOut) {
      const it = fresh(p);
      if (it.price >= it.before) { skipped++; continue; }
      next.set(p.id, it);
    }
    setItems(next);
    setNote(`Додадени ${shownOut.length - skipped}.${skipped ? ` ${skipped} не можат да бидат поевтини: подот (набавна + 15%) не дава.` : ''}`);
  };
  const removeShown = () => {
    touched();
    const next = new Map(items);
    for (const p of shownIn) next.delete(p.id);
    setItems(next);
    setNote(`Извадени ${shownIn.length}.`);
  };
  const cutShown = () => {
    touched();
    const next = new Map(items);
    let floored = 0;
    for (const p of shownIn) {
      const it = next.get(p.id)!;
      const { price, clamped } = campaignPriceFor(campaignReference(it, p), bulkPct, p.purchasePrice);
      if (clamped) floored++;
      next.set(p.id, { ...it, price });
    }
    setItems(next);
    setNote(`−${bulkPct}% на ${shownIn.length}.${floored ? ` ${floored} застанаа на подот.` : ''}`);
  };

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

  const stories = useCampaignStories(campaignArt(c, Math.floor(totals.maxPct / 5) * 5), c.id);
  const storyJob = (p: Product, n?: number): StoryJob => ({ card: campaignCard(p, items.get(p.id)!), name: storyFileName(c.id, p, n) });
  const storyJobs = shownIn
    .filter((p) => hasPhoto(p) && items.get(p.id)!.price < campaignReference(items.get(p.id)!, p))
    .map((p, i) => storyJob(p, i + 1));

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
              Никогаш под подот: набавна + 15%. Цените завршуваат на 0 или 50. „Предложи цени“ ја заменува целата листа.
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
        <div className="space-y-3 rounded-t-xl border-b border-slate-200 bg-white/95 p-4 backdrop-blur sm:sticky sm:z-20" style={{ top: headerH }}>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={query}
              onChange={(e) => { setQuery(e.target.value); refilter(); }}
              placeholder="Барај: шифра, наслов, категорија…"
              className="min-w-[12rem] flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="inline-flex overflow-hidden rounded-lg border border-slate-300 text-sm" role="group" aria-label="Кои производи">
              {([['all', `Сите ${shelf.length}`], ['in', `Во акција ${inCount}`], ['out', `Надвор ${shelf.length - inCount}`]] as [Status, string][]).map(([k, label]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={status === k}
                  onClick={() => { setStatus(k); refilter(); }}
                  className={`px-3 py-2 ${status === k ? 'bg-slate-900 text-white' : 'bg-white text-slate-700 hover:bg-slate-50'}`}
                >
                  {label}
                </button>
              ))}
            </div>
            <select
              value={sort}
              onChange={(e) => { setSort(e.target.value as Sort); refilter(); }}
              aria-label="Подреди"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {(Object.keys(SORT_LABEL) as Sort[]).map((k) => <option key={k} value={k}>{SORT_LABEL[k]}</option>)}
            </select>
          </div>

          <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group" aria-label="Категорија">
            <button type="button" aria-pressed={group === 'all'} onClick={() => { setGroup('all'); setCat('all'); refilter(); }} className={chip(group === 'all')}>
              Сите категории
            </button>
            {groups.filter((g) => groupCounts.get(g.key)).map((g) => {
              const n = groupCounts.get(g.key)!;
              return (
                <button key={g.key} type="button" aria-pressed={group === g.key} onClick={() => { setGroup(g.key); setCat('all'); refilter(); }} className={chip(group === g.key)}>
                  {groupName(g.key, 'mk')} <span className="opacity-60">{n.n}</span>
                  {n.inn > 0 && <span className="rounded-full bg-amber-300 px-1.5 text-[10px] font-bold text-slate-900" title="во акција">{n.inn}</span>}
                </button>
              );
            })}
          </div>

          {cats.length > 1 && (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Вид">
              <button type="button" aria-pressed={cat === 'all'} onClick={() => { setCat('all'); refilter(); }} className={chip(cat === 'all')}>Сите видови</button>
              {cats.map((raw) => (
                <button key={raw} type="button" aria-pressed={cat === raw} onClick={() => { setCat(raw); refilter(); }} className={chip(cat === raw)}>
                  {categoryName(raw, 'mk')} <span className="opacity-60">{inGroup.filter((p) => canonicalCategory(p.category) === raw).length}</span>
                </button>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Правило">
            <button type="button" aria-pressed={kind === 'all'} onClick={() => { setKind('all'); refilter(); }} className={chip(kind === 'all')}>Сите правила</button>
            {KINDS.filter((k) => kindCounts.get(k)).map((k) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => { setKind(k); refilter(); }} className={chip(kind === k)} title={KIND_HINT[k]}>
                {KIND_LABEL[k]} <span className="opacity-60">{kindCounts.get(k)}</span>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-sm">
            <span className="text-slate-500">Прикажани {rows.length}:</span>
            <button type="button" disabled={shownOut.length === 0} onClick={addShown} className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">
              + Додади ги ({shownOut.length})
            </button>
            <button type="button" disabled={shownIn.length === 0} onClick={removeShown} className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">
              − Извади ги ({shownIn.length})
            </button>
            <span className="inline-flex items-center gap-1">
              <span className="text-slate-500">Попуст за прикажаните во акција −</span>
              <input
                type="number" min={0} max={70} step={5} value={bulkPct}
                onChange={(e) => setBulkPct(Math.max(0, Math.min(70, Number(e.target.value) || 0)))}
                className="w-14 rounded border border-slate-300 px-2 py-1 text-right"
                aria-label="Попуст во проценти"
              />
              <span className="text-slate-500">%</span>
              <button type="button" disabled={shownIn.length === 0} onClick={cutShown} className="rounded-lg border border-slate-300 px-3 py-1.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40">
                Примени
              </button>
            </span>
            <BulkStoriesButton stories={stories} jobs={storyJobs} label="Стории" />
            {filtered && (
              <button
                type="button"
                onClick={() => { setGroup('all'); setCat('all'); setKind('all'); setStatus('all'); setQuery(''); refilter(); }}
                className="ml-auto inline-flex items-center gap-1 text-slate-500 hover:text-slate-800"
              >
                <X className="h-4 w-4" /> Исчисти филтри
              </button>
            )}
          </div>
          {note && <p className="text-xs text-slate-600">{note}</p>}
          {stories.error && <p className="text-xs text-red-700">{stories.error}</p>}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-[11px] uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-2 text-left">Модел</th>
                <th className="px-3 py-2 text-left">Правило</th>
                <th className="px-3 py-2 text-right">Парч.</th>
                <th className="px-3 py-2 text-right" title="Прецртаната цена: најниската во 30 дена пред акцијата">Цена пред</th>
                <th className="px-3 py-2 text-right">Попуст</th>
                <th className="px-3 py-2 text-right">Акциска</th>
                <th className="px-3 py-2 text-right">Маржа</th>
                <th className="px-3 py-2 text-center">Сторија</th>
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
                      <label className="flex cursor-pointer items-center gap-3">
                        <input
                          type="checkbox" checked={!!it} className="h-4 w-4 shrink-0"
                          aria-label={`Во акција: ${productTitle(p, 'mk')}`}
                          onChange={(e) => setItem(p, e.target.checked ? {} : null)}
                        />
                        <span className="relative h-16 w-12 shrink-0 overflow-hidden rounded bg-slate-100">
                          {hasPhoto(p) && <Image src={p.imageUrl.trim()} alt="" fill sizes="48px" className="object-cover" />}
                        </span>
                        <span className="min-w-0">
                          <span className="block max-w-[17rem] truncate font-medium text-slate-800">{productTitle(p, 'mk')}</span>
                          <span className="block text-[11px] text-slate-500">
                            <span className="font-mono">{p.name}</span> · {categoryName(p.category, 'mk')} · {liveSizes(p)}
                          </span>
                        </span>
                      </label>
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-600" title={v?.reason}>{v ? KIND_LABEL[v.kind] : ''}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{unitsOf(p)}</td>
                    <td className="px-3 py-2 text-right">
                      {it ? (
                        <input
                          type="number" min={1} value={it.before}
                          onChange={(e) => setItem(p, { before: Math.max(0, Math.round(Number(e.target.value) || 0)) })}
                          aria-label="Цена пред"
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
                            aria-label="Попуст"
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
                          aria-label="Акциска цена"
                          className={`w-20 rounded border px-2 py-1 text-right font-semibold tabular-nums ${below || notLower ? 'border-red-400 text-red-700' : 'border-slate-300'}`}
                        />
                      )}
                      {below && <div className="text-[10px] text-red-600">под подот {mkNumber(floor!)}</div>}
                      {notLower && <div className="text-[10px] text-red-600">не е пониска</div>}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums ${m !== null && m < 20 ? 'text-red-700' : 'text-slate-600'}`}>{m === null ? '' : `${m}%`}</td>
                    <td className="px-3 py-2 text-center">
                      {it && !notLower && hasPhoto(p) && (
                        <button
                          type="button"
                          disabled={!!stories.busy}
                          onClick={() => stories.one(storyJob(p))}
                          aria-label={`Сторија за Instagram: ${productTitle(p, 'mk')}`}
                          title="Сторија за Instagram"
                          className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 disabled:opacity-40"
                        >
                          {stories.busy === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageDown className="h-4 w-4" />}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-10 text-center text-slate-500">
                    {status === 'in' && items.size === 0 ? 'Ништо уште не е во акција: „Предложи цени“ или штиклирај од целата листа.' : 'Нема такви производи на сајтот.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <StoryPreview stories={stories} />

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
