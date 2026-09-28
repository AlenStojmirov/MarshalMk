'use client';

/**
 * The content calendar (Task 10.4): next month by day, the next three by week.
 *
 * The owner (2026-09-27): the plan is written down, and it moves day by day as
 * the shop's days require. So a proposal fills the month from the season frame
 * and the live catalogue, the marketing employee accepts it, and from then on
 * every post can be moved, changed, marked or dropped. Moves are counted by the
 * database (migration 012), so the month can say how well the plan held.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle, Check, ChevronLeft, ChevronRight, ExternalLink, Loader2, PenLine, Plus, Sparkles, Trash2, X,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { ProductAttributes } from '@/types';
import type { MarketingPlan, PostCandidate } from '@/lib/marketing';
import { POST_KIND_LABEL, den } from '@/lib/marketing';
import type { CopyKind } from '@/lib/post-copy';
import {
  CHANNEL_LABEL, MONTH_NAME, STATUS_LABEL, WEEKDAY_SHORT, addDays, dayOf, frame, itemWarnings, monthDays,
  planStats, proposeMonth, weekStart, weekTheme, weekdayOf,
  type PlanChannel, type PlanDraft, type PlanItem, type PlanStatus,
} from '@/lib/marketing-calendar';
import { deletePlan, fetchPlan, insertPlan, touchesResults, updatePlan, type PlanPatch } from '@/lib/marketing-plan-db';
import { comboWriter, productKinds, productWriter, trustWriter, type Writing } from '@/components/admin/marketing-writers';
import { campaignOf, trackedLink } from '@/lib/attribution';
import { HYPOTHESES, hypothesisOf } from '@/lib/marketing-tests';
import { fetchCampaignOrders, type CampaignOrders } from '@/lib/marketing-results';

const KIND_LABEL: Record<CopyKind, string> = { ...POST_KIND_LABEL, trust: 'Доверба' };
const KINDS: CopyKind[] = ['carousel', 'reel', 'story', 'combo', 'clearance', 'trust'];
const STATUSES: PlanStatus[] = ['planned', 'ready', 'posted', 'skipped'];

const KIND_TONE: Record<CopyKind, string> = {
  carousel: 'bg-blue-50 text-blue-800 border-blue-200',
  reel: 'bg-violet-50 text-violet-800 border-violet-200',
  story: 'bg-amber-50 text-amber-800 border-amber-200',
  combo: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  clearance: 'bg-rose-50 text-rose-800 border-rose-200',
  trust: 'bg-slate-100 text-slate-700 border-slate-200',
};

/** Advice for someone new to it, on the screen where the plan is made. */
const RULES = [
  'Постојаноста е поважна од количината: 4 објави неделно секоја недела се подобри од 10 во една недела и ништо во следната.',
  'Карусел = 3–5 слики што се листаат. Најдобар за производ: напред, назад, детал, на човек, цена.',
  'Reel = кратко видео, 7–15 секунди. Тоа е единствениот начин да те видат луѓе што сè уште не те следат.',
  'Сторис исчезнува за 24 часа. Добра е за „последно парче“, анкети и „денес во дуќан“.',
  'Објавувај навечер (19–21 ч.) и викенд, кога луѓето листаат. По еден месец Insights ќе покаже подобро време.',
  'Цената секогаш се гледа. „Цена во инбокс“ ги тера луѓето да продолжат понатаму.',
  'Одговарај на пораки и коментари истиот ден: кај плаќање при достава, брзиот одговор е половина од продажбата.',
];

/** The month to open on: this one, or the next when this one is nearly over. */
function initialMonth(): { y: number; m: number } {
  const now = new Date();
  const left = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate();
  const d = left < 7 ? new Date(now.getFullYear(), now.getMonth() + 1, 1) : now;
  return { y: d.getFullYear(), m: d.getMonth() };
}

interface Props {
  plan: MarketingPlan;
  attrs: Map<string, ProductAttributes>;
  loading: boolean;
  onWrite: (w: Writing) => void;
}

export default function MarketingCalendar({ plan, attrs, loading, onWrite }: Props) {
  const [{ y, m }, setCursor] = useState(initialMonth);
  const [items, setItems] = useState<PlanItem[]>([]);
  const [state, setState] = useState<{ loading: boolean; missingTable: boolean; error?: string }>({ loading: true, missingTable: false });
  const [drafts, setDrafts] = useState<Array<PlanDraft & { on: boolean }> | null>(null);
  const [editing, setEditing] = useState<PlanItem | PlanDraft | null>(null);
  const [showFrame, setShowFrame] = useState(false);
  const [campaignOrders, setCampaignOrders] = useState<CampaignOrders>({});

  const today = dayOf(new Date());
  const days = useMemo(() => monthDays(y, m), [y, m]);
  const from = days[0];
  const to = days[days.length - 1];

  const reload = useCallback(async () => {
    const r = await fetchPlan(supabase, from, to);
    setItems(r.data);
    setState({ loading: false, missingTable: r.missingTable, error: r.missingTable ? undefined : r.error });
  }, [from, to]);

  useEffect(() => {
    let live = true;
    fetchPlan(supabase, from, to).then((r) => {
      if (!live) return;
      setItems(r.data);
      setState({ loading: false, missingTable: r.missingTable, error: r.missingTable ? undefined : r.error });
    });
    return () => {
      live = false;
    };
  }, [from, to]);

  // Online orders that came by each post's tracked link (10.6), counted on the server.
  useEffect(() => {
    let live = true;
    fetchCampaignOrders(from).then((r) => live && setCampaignOrders(r));
    return () => {
      live = false;
    };
  }, [from]);

  const byId = useMemo(() => new Map(plan.candidates.map((c) => [c.product.id, c])), [plan]);
  const byDay = useMemo(() => {
    const map = new Map<string, PlanItem[]>();
    for (const i of items) map.set(i.day, [...(map.get(i.day) ?? []), i]);
    return map;
  }, [items]);
  const stats = planStats(items);

  // Weeks of the grid, Monday first, padded with the neighbouring months' days.
  const weeks = useMemo(() => {
    const out: string[][] = [];
    for (let w = weekStart(from); w <= to; w = addDays(w, 7)) {
      out.push(Array.from({ length: 7 }, (_, i) => addDays(w, i)));
    }
    return out;
  }, [from, to]);

  const move = (delta: number) => {
    const d = new Date(y, m + delta, 1);
    setCursor({ y: d.getFullYear(), m: d.getMonth() });
    setState((s) => ({ ...s, loading: true }));
  };

  const propose = () => {
    const list = proposeMonth(days, plan, items, today).map((d) => ({ ...d, on: true }));
    setDrafts(list);
  };

  const acceptDrafts = async () => {
    if (!drafts) return;
    const err = await insertPlan(supabase, drafts.filter((d) => d.on).map((d) => ({ day: d.day, kind: d.kind, productIds: d.productIds, title: d.title })));
    if (err) return alert(err);
    setDrafts(null);
    reload();
  };

  /** Opens the post panel for a calendar post, saving its text back. */
  const writeItem = (item: PlanItem) => {
    const cands = item.productIds.map((id) => byId.get(id));
    let w: Writing | null = null;
    if (item.kind === 'trust') w = trustWriter(plan.month);
    else if (item.kind === 'combo') {
      const [top, bottom] = cands;
      if (top && bottom) w = comboWriter({ top, bottom, total: top.price + bottom.price }, attrs, plan.month);
    } else if (cands[0]) {
      w = productWriter(cands[0], attrs, plan.month, productKinds([item.kind, 'carousel', 'reel', 'story']));
    }
    if (!w) return alert('Производот повеќе не е на сајтот. Избери друг производ за оваа објава.');
    onWrite({
      ...w,
      initialText: item.body || undefined,
      onSave: async (text) => {
        const err = await updatePlan(supabase, item.id, {
          body: text,
          status: item.status === 'planned' ? 'ready' : item.status,
        });
        if (!err) reload();
        return err;
      },
    });
  };

  if (state.missingTable) {
    return (
      <p className="p-4 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-800">
        Календарот чека миграција 012 (<code>supabase/migrations/012_marketing_plan.sql</code>). Сè друго на страната работи.
      </p>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button onClick={() => move(-1)} className="p-2 rounded-lg border border-slate-300 hover:bg-slate-50" aria-label="Претходен месец">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h2 className="text-lg font-semibold text-slate-900 w-40 text-center">{MONTH_NAME[m]} {y}</h2>
        <button onClick={() => move(1)} className="p-2 rounded-lg border border-slate-300 hover:bg-slate-50" aria-label="Следен месец">
          <ChevronRight className="h-4 w-4" />
        </button>
        <button
          onClick={propose}
          disabled={loading || state.loading || to < today}
          className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-pink-600 text-white hover:bg-pink-700 disabled:opacity-50"
          title="Предлог од сезонската рамка и производите на сајтот. Постоечките објави остануваат."
        >
          <Sparkles className="h-4 w-4" /> Предлог за месецот
        </button>
      </div>

      {state.error && <p className="mb-3 text-sm text-rose-700">{state.error}</p>}

      <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3 text-xs text-slate-600">
        <span>Објави: <strong>{stats.total}</strong></span>
        <span>Подготвени: <strong>{stats.ready}</strong></span>
        <span className="text-emerald-700">Објавени: <strong>{stats.posted}</strong></span>
        <span>Прескокнати: <strong>{stats.skipped}</strong></span>
        <span className="text-amber-700" title="Колку објави се поместени од денот за кој биле планирани">
          Поместени: <strong>{stats.moved}</strong>
        </span>
      </div>

      {/* Grid on wider screens */}
      <div className="hidden sm:block bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="grid grid-cols-7 bg-slate-50 border-b border-slate-200">
          {WEEKDAY_SHORT.map((d) => (
            <div key={d} className="px-2 py-1.5 text-[11px] font-medium text-slate-500">{d}</div>
          ))}
        </div>
        {weeks.map((week) => {
          const theme = weekTheme(week[0]);
          return (
            <div key={week[0]} className="border-b border-slate-100 last:border-0">
              <p className={`px-2 py-1 text-[11px] ${theme.event ? 'bg-pink-50 text-pink-800' : 'bg-slate-50/60 text-slate-500'}`} title={theme.note}>
                <strong>{theme.title}</strong> · {theme.note}
              </p>
              <div className="grid grid-cols-7">
                {week.map((day) => {
                  const inMonth = day >= from && day <= to;
                  const list = byDay.get(day) ?? [];
                  return (
                    <div key={day} className={`min-h-28 p-1.5 border-r border-slate-100 last:border-0 ${inMonth ? '' : 'bg-slate-50/70'}`}>
                      <div className="flex items-center mb-1">
                        <span className={`text-xs tabular-nums ${day === today ? 'px-1.5 rounded-full bg-pink-600 text-white font-semibold' : inMonth ? 'text-slate-700' : 'text-slate-300'}`}>
                          {Number(day.slice(8))}
                        </span>
                        {inMonth && (
                          <button
                            onClick={() => setEditing({ day, kind: 'carousel', productIds: [], title: '' })}
                            className="ml-auto text-slate-300 hover:text-pink-600"
                            aria-label="Додај објава"
                          >
                            <Plus className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="space-y-1">
                        {list.map((i) => <Chip key={i.id} item={i} warn={itemWarnings(i, byId).length > 0} onClick={() => setEditing(i)} />)}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* A list on phones */}
      <div className="sm:hidden space-y-2">
        {days.map((day) => {
          const list = byDay.get(day) ?? [];
          const isMonday = weekdayOf(day) === 0 || day === from;
          const theme = isMonday ? weekTheme(weekStart(day)) : null;
          return (
            <div key={day}>
              {theme && (
                <p className={`mt-2 px-2 py-1 rounded text-[11px] ${theme.event ? 'bg-pink-50 text-pink-800' : 'bg-slate-100 text-slate-600'}`}>
                  <strong>{theme.title}</strong> · {theme.note}
                </p>
              )}
              <div className="flex items-start gap-2 py-1">
                <span className={`w-12 shrink-0 text-xs tabular-nums ${day === today ? 'text-pink-600 font-semibold' : 'text-slate-500'}`}>
                  {WEEKDAY_SHORT[weekdayOf(day)]} {Number(day.slice(8))}
                </span>
                <div className="flex-1 space-y-1">
                  {list.map((i) => <Chip key={i.id} item={i} warn={itemWarnings(i, byId).length > 0} onClick={() => setEditing(i)} />)}
                </div>
                <button
                  onClick={() => setEditing({ day, kind: 'carousel', productIds: [], title: '' })}
                  className="text-slate-300 hover:text-pink-600"
                  aria-label="Додај објава"
                >
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-6">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center mb-2">
            <h3 className="font-semibold text-slate-900 flex-1">Рамка за три месеци</h3>
            <button onClick={() => setShowFrame((v) => !v)} className="text-xs text-blue-600 hover:text-blue-700">
              {showFrame ? 'Скриј' : 'Прикажи'}
            </button>
          </div>
          <p className="text-xs text-slate-500 mb-2">Тема по недела, од сезонскиот календар и датумите во годината. Предлогот за месецот ја следи.</p>
          {showFrame && (
            <ul className="space-y-1.5">
              {frame(today).map((w) => (
                <li key={w.weekStart} className="text-xs">
                  <span className="text-slate-400 tabular-nums">{Number(w.weekStart.slice(8))}.{Number(w.weekStart.slice(5, 7))}.</span>{' '}
                  <strong className={w.event ? 'text-pink-700' : 'text-slate-800'}>{w.title}</strong>
                  <span className="text-slate-500"> · {w.note}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <h3 className="font-semibold text-slate-900 mb-2">Правила за почеток</h3>
          <ul className="space-y-1.5 text-xs text-slate-600 list-disc list-inside">
            {RULES.map((r) => <li key={r}>{r}</li>)}
          </ul>
        </div>
      </div>

      {drafts && (
        <Modal title={`Предлог за ${MONTH_NAME[m].toLowerCase()}`} onClose={() => setDrafts(null)}>
          {drafts.length === 0 ? (
            <p className="text-sm text-slate-600">Нема што да се предложи: секој ден во ритамот веќе има објава, или месецот помина.</p>
          ) : (
            <>
              <p className="text-sm text-slate-600 mb-3">
                {drafts.filter((d) => d.on).length} од {drafts.length} објави. Отштиклирај што не сакаш. Сè може да се помести и смени потоа.
              </p>
              <ul className="divide-y divide-slate-100 max-h-[55vh] overflow-y-auto mb-3">
                {drafts.map((d, i) => (
                  <li key={`${d.day}-${d.kind}-${i}`}>
                    <label className="flex items-center gap-2 py-1.5 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={d.on}
                        onChange={() => setDrafts(drafts.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))}
                      />
                      <span className="w-16 shrink-0 text-xs text-slate-500 tabular-nums">
                        {WEEKDAY_SHORT[weekdayOf(d.day)]} {Number(d.day.slice(8))}.
                      </span>
                      <span className={`shrink-0 px-1.5 py-0.5 rounded border text-[11px] ${KIND_TONE[d.kind]}`}>{KIND_LABEL[d.kind]}</span>
                      <span className="truncate text-slate-700">{d.title}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <button
                onClick={acceptDrafts}
                disabled={!drafts.some((d) => d.on)}
                className="px-4 py-2 bg-pink-600 text-white rounded-lg text-sm font-medium hover:bg-pink-700 disabled:opacity-50"
              >
                Додади ги во календарот
              </button>
            </>
          )}
        </Modal>
      )}

      {editing && (
        <ItemEditor
          item={editing}
          candidates={plan.candidates}
          byId={byId}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            reload();
          }}
          onWrite={(i) => writeItem(i)}
          orders={isSaved(editing) ? campaignOrders[campaignOf(editing.id)] : undefined}
        />
      )}
    </div>
  );
}

/**
 * The post's own link (Task 10.6): an order placed after following it carries
 * the post, so 10.7 can say which post sold. Instagram does not open links in a
 * caption — it goes into the bio or a story link sticker; Facebook opens it in
 * the post.
 */
function TrackedLinks({ id, path }: { id: string; path: string }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (network: 'instagram' | 'facebook') => {
    try {
      await navigator.clipboard.writeText(trackedLink(path, network, id));
      setCopied(network);
      setTimeout(() => setCopied(null), 2000);
    } catch {
      alert(trackedLink(path, network, id));
    }
  };
  return (
    <div className="p-2 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
      <p className="mb-1.5">
        <strong>Следлив линк</strong>: нарачка по овој линк ќе покаже дека дошла од оваа објава. Во Instagram оди во
        биото или во стикер „линк“ на сторис; во Facebook во самата објава.
      </p>
      <div className="flex gap-2">
        {(['instagram', 'facebook'] as const).map((n) => (
          <button key={n} onClick={() => copy(n)} className="px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50">
            {copied === n ? 'Копирано ✓' : n === 'instagram' ? 'Копирај за Instagram' : 'Копирај за Facebook'}
          </button>
        ))}
      </div>
    </div>
  );
}

function Chip({ item, warn, onClick }: { item: PlanItem; warn: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-1.5 py-1 rounded border text-[11px] leading-tight flex items-center gap-1 ${KIND_TONE[item.kind]} ${
        item.status === 'skipped' ? 'opacity-50 line-through' : ''
      }`}
      title={`${KIND_LABEL[item.kind]} · ${STATUS_LABEL[item.status]}${item.movedCount ? ` · поместено ${item.movedCount}×` : ''}`}
    >
      {item.status === 'posted' ? (
        <Check className="h-3 w-3 shrink-0 text-emerald-600" />
      ) : item.status === 'ready' ? (
        <span className="h-2 w-2 shrink-0 rounded-full bg-blue-600" />
      ) : warn ? (
        <AlertTriangle className="h-3 w-3 shrink-0 text-amber-600" />
      ) : null}
      <span className="truncate">
        <span className="font-medium">{KIND_LABEL[item.kind]}</span> · {item.title || '—'}
      </span>
    </button>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
      <div
        className="bg-white w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-2xl sm:rounded-2xl shadow-xl p-4 sm:p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2 mb-3">
          <h2 className="font-semibold text-slate-900 flex-1">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Затвори">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const isSaved = (i: PlanItem | PlanDraft): i is PlanItem => 'id' in i;

const toCount = (v: string): number | null => (v.trim() === '' ? null : Math.max(0, Math.round(Number(v)) || 0));
const fromCount = (v: number | null | undefined) => (v === null || v === undefined ? '' : String(v));

function ItemEditor({
  item, candidates, byId, onClose, onSaved, onWrite, orders,
}: {
  item: PlanItem | PlanDraft;
  candidates: PostCandidate[];
  byId: Map<string, PostCandidate>;
  onClose: () => void;
  onSaved: () => void;
  onWrite: (i: PlanItem) => void;
  orders?: { orders: number; units: number; value?: number };
}) {
  const saved = isSaved(item) ? item : null;
  const [day, setDay] = useState(item.day);
  const [kind, setKind] = useState<CopyKind>(item.kind);
  const [productIds, setProductIds] = useState<string[]>(item.productIds);
  const [status, setStatus] = useState<PlanStatus>(saved?.status ?? 'planned');
  const [channel, setChannel] = useState<PlanChannel>(saved?.channel ?? 'both');
  const [note, setNote] = useState(saved?.note ?? '');
  const [postUrl, setPostUrl] = useState(saved?.postUrl ?? '');
  const [hypothesis, setHypothesis] = useState(saved?.hypothesis ?? '');
  const [variant, setVariant] = useState<'' | 'A' | 'B'>(saved?.variant ?? '');
  const [reach, setReach] = useState(fromCount(saved?.reach));
  const [saves, setSaves] = useState(fromCount(saved?.saves));
  const [messages, setMessages] = useState(fromCount(saved?.messages));
  const [storeVisits, setStoreVisits] = useState(fromCount(saved?.storeVisits));
  const [busy, setBusy] = useState(false);

  const sorted = useMemo(() => [...candidates].sort((a, b) => a.label.localeCompare(b.label, 'mk')), [candidates]);
  const slots = kind === 'trust' ? 0 : kind === 'combo' ? 2 : 1;
  const ids = Array.from({ length: slots }, (_, i) => productIds[i] ?? '');
  const title =
    kind === 'trust'
      ? 'Доверба: како се нарачува'
      : ids.map((id) => byId.get(id)?.label ?? (id ? id : '')).filter(Boolean).join(' + ');
  const current: PlanItem = {
    id: saved?.id ?? '', day, kind, productIds: ids.filter(Boolean), title, body: saved?.body ?? '',
    status, channel, note, postUrl, originalDay: saved?.originalDay ?? day, movedCount: saved?.movedCount ?? 0,
    hypothesis, variant: hypothesis ? variant : '',
    reach: toCount(reach), saves: toCount(saves), messages: toCount(messages), storeVisits: toCount(storeVisits),
  };
  // Only what changed is sent, so a calendar without migration 013 still saves days and statuses.
  const resultPatch: PlanPatch = {};
  if (saved) {
    if (current.hypothesis !== saved.hypothesis) resultPatch.hypothesis = current.hypothesis;
    if (current.variant !== saved.variant) resultPatch.variant = current.variant;
    if (current.reach !== saved.reach) resultPatch.reach = current.reach;
    if (current.saves !== saved.saves) resultPatch.saves = current.saves;
    if (current.messages !== saved.messages) resultPatch.messages = current.messages;
    if (current.storeVisits !== saved.storeVisits) resultPatch.storeVisits = current.storeVisits;
  }
  const warnings = itemWarnings(current, byId);
  const changed = !saved || touchesResults(resultPatch) || JSON.stringify([day, kind, current.productIds, status, channel, note, postUrl]) !==
    JSON.stringify([saved.day, saved.kind, saved.productIds, saved.status, saved.channel, saved.note, saved.postUrl]);

  const save = async () => {
    if (slots > 0 && current.productIds.length < slots) return alert(kind === 'combo' ? 'Избери два производа.' : 'Избери производ.');
    setBusy(true);
    const patch: PlanPatch = { day, kind, productIds: current.productIds, title, status, channel, note, postUrl, ...resultPatch };
    const err = saved ? await updatePlan(supabase, saved.id, patch) : await insertPlan(supabase, [{ day, kind, productIds: current.productIds, title }]);
    setBusy(false);
    if (err) {
      return alert(/hypothesis|variant|reach|saves|messages|store_visits|results_at/.test(err)
        ? 'Тестот и резултатите чекаат миграција 013. Денот, статусот и останатото може да се зачуваат без нив.'
        : err);
    }
    onSaved();
  };

  const remove = async () => {
    if (!saved || !confirm('Да се избрише оваа објава од календарот?')) return;
    const err = await deletePlan(supabase, saved.id);
    if (err) return alert(err);
    onSaved();
  };

  return (
    <Modal title={saved ? 'Објава во календарот' : 'Нова објава'} onClose={onClose}>
      <div className="space-y-3 text-sm">
        <div className="flex items-center gap-2">
          <button onClick={() => setDay(addDays(day, -1))} className="p-1.5 rounded border border-slate-300 hover:bg-slate-50" aria-label="Ден порано">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} className="px-2 py-1.5 border border-slate-300 rounded-lg" />
          <button onClick={() => setDay(addDays(day, 1))} className="p-1.5 rounded border border-slate-300 hover:bg-slate-50" aria-label="Ден подоцна">
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="text-xs text-slate-500">{WEEKDAY_SHORT[weekdayOf(day)]}</span>
          {saved && saved.movedCount > 0 && (
            <span className="ml-auto text-[11px] text-amber-700">поместено {saved.movedCount}× (прво: {saved.originalDay.slice(8)}.{saved.originalDay.slice(5, 7)}.)</span>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {KINDS.map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`px-2.5 py-1 rounded-lg border text-xs ${kind === k ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}
            >
              {KIND_LABEL[k]}
            </button>
          ))}
        </div>

        {ids.map((id, i) => (
          <select
            key={i}
            value={id}
            onChange={(e) => {
              const next = [...ids];
              next[i] = e.target.value;
              setProductIds(next);
            }}
            className="w-full px-2 py-1.5 border border-slate-300 rounded-lg bg-white"
          >
            <option value="">{kind === 'combo' ? (i === 0 ? '— горен дел —' : '— долен дел —') : '— избери производ —'}</option>
            {id && !byId.has(id) && <option value={id}>{id} (не е на сајтот)</option>}
            {sorted.map((c) => (
              <option key={c.product.id} value={c.product.id}>
                {c.label} · {den(c.price)}{c.discount.allowed ? ' · расчистување' : ''}
              </option>
            ))}
          </select>
        ))}

        {warnings.length > 0 && (
          <ul className="p-2 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 space-y-0.5">
            {warnings.map((w) => <li key={w} className="flex gap-1"><AlertTriangle className="h-3.5 w-3.5 shrink-0" /> {w}</li>)}
          </ul>
        )}

        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={`px-2.5 py-1 rounded-lg border text-xs ${status === s ? 'bg-pink-600 text-white border-pink-600' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'}`}
            >
              {STATUS_LABEL[s]}
            </button>
          ))}
          <select value={channel} onChange={(e) => setChannel(e.target.value as PlanChannel)} className="ml-auto px-2 py-1 border border-slate-300 rounded-lg bg-white text-xs">
            {(Object.keys(CHANNEL_LABEL) as PlanChannel[]).map((c) => <option key={c} value={c}>{CHANNEL_LABEL[c]}</option>)}
          </select>
        </div>

        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Белешка (на пример: сними во дуќанот, со модел)"
          rows={2}
          className="w-full px-2 py-1.5 border border-slate-300 rounded-lg"
        />
        <div className="flex items-center gap-2">
          <input
            value={postUrl}
            onChange={(e) => setPostUrl(e.target.value)}
            placeholder="Линк до објавата, кога ќе ја објавиш"
            className="flex-1 px-2 py-1.5 border border-slate-300 rounded-lg"
          />
          {postUrl && /^https?:\/\//.test(postUrl) && (
            <a href={postUrl} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-blue-600" aria-label="Отвори ја објавата">
              <ExternalLink className="h-4 w-4" />
            </a>
          )}
        </div>
        {saved?.body && <p className="text-xs text-slate-500">Текстот е зачуван ({saved.body.length} знаци).</p>}
        {saved && <TrackedLinks id={saved.id} path={saved.productIds[0] ? `/product/${saved.productIds[0]}` : '/'} />}

        {saved && (
          <div className="p-2 rounded-lg bg-violet-50 border border-violet-200 text-xs text-violet-900 space-y-2">
            <p><strong>Тест</strong>: на кое прашање одговара оваа објава? (незадолжително)</p>
            <select
              value={hypothesis}
              onChange={(e) => setHypothesis(e.target.value)}
              className="w-full px-2 py-1.5 border border-violet-300 rounded-lg bg-white text-slate-800"
            >
              <option value="">— без тест —</option>
              {HYPOTHESES.map((h) => <option key={h.key} value={h.key}>{h.question}</option>)}
            </select>
            {hypothesisOf(hypothesis) && (
              <>
                <div className="flex gap-1.5">
                  {(['A', 'B'] as const).map((v) => (
                    <button
                      key={v}
                      onClick={() => setVariant(v)}
                      className={`flex-1 px-2 py-1 rounded-lg border ${variant === v ? 'bg-violet-700 text-white border-violet-700' : 'bg-white border-violet-300 hover:bg-violet-100'}`}
                    >
                      {v}: {v === 'A' ? hypothesisOf(hypothesis)!.a : hypothesisOf(hypothesis)!.b}
                    </button>
                  ))}
                </div>
                <p className="text-violet-700">{hypothesisOf(hypothesis)!.hint}</p>
              </>
            )}
          </div>
        )}

        {saved && status === 'posted' && (
          <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 space-y-2">
            <p>
              <strong>Резултати</strong> од Insights на објавата, по 2–3 дена. Празно значи „не е внесено“, не нула.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {([
                ['Дофат', reach, setReach],
                ['Зачувувања', saves, setSaves],
                ['Пораки', messages, setMessages],
                ['Дошле во дуќан', storeVisits, setStoreVisits],
              ] as const).map(([label, value, set]) => (
                <label key={label} className="block">
                  <span className="block mb-0.5">{label}</span>
                  <input
                    type="number" min="0" inputMode="numeric" value={value}
                    onChange={(e) => set(e.target.value)}
                    className="w-full px-2 py-1 border border-emerald-300 rounded-lg bg-white text-slate-800 tabular-nums"
                  />
                </label>
              ))}
            </div>
            <p>
              Online нарачки по следливиот линк: <strong>{orders?.orders ?? 0}</strong>
              {orders ? ` (${orders.units} парч.${orders.value !== undefined ? `, ${den(orders.value)}` : ''})` : ''}. Се бројат сами.
            </p>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            onClick={save}
            disabled={busy || !changed}
            className="flex items-center gap-1.5 px-4 py-2 bg-pink-600 text-white rounded-lg font-medium hover:bg-pink-700 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Зачувај
          </button>
          {saved && (
            <button
              onClick={() => onWrite({ ...saved })}
              disabled={changed}
              title={changed ? 'Прво зачувај ги промените' : undefined}
              className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 disabled:opacity-50"
            >
              <PenLine className="h-4 w-4" /> Текст и слики
            </button>
          )}
          {saved && (
            <button onClick={remove} className="ml-auto flex items-center gap-1 text-rose-600 hover:text-rose-700 text-xs">
              <Trash2 className="h-3.5 w-3.5" /> Избриши
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
