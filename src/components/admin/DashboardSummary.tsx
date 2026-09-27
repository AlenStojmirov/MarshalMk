'use client';

/**
 * The cockpit: how the month is going, and what needs attention.
 *
 * There are now eight admin screens and none of them answered "how are we
 * doing today" without opening several. This sits above the catalogue so it is
 * the first thing seen rather than somewhere to navigate to.
 *
 * Alerts are ranked by money at stake rather than by urgency or date, which is
 * what keeps the list honest: a thing worth 19.000 den. a month belongs above a
 * thing worth 900, whatever order they happened in. Each one names its figure
 * and links to the screen where it can actually be acted on — an alert with
 * nowhere to go is noise. The list is capped at eight (Task 4.4): past that
 * nobody reads to the bottom, and a ranked list whose tail is ignored is worse
 * than a short one, because it hides the cut instead of making it.
 *
 * No VAT arithmetic: the shop is not registered (D-003), so margin is margin.
 */

import { useEffect, useMemo, useState } from 'react';
import { canonicalSize } from '@/lib/sizes';
import Link from 'next/link';
import { Order, Product } from '@/types';
import { getOrders } from '@/lib/orders';
import { getEffectivePrice, isOnSale } from '@/lib/pricing';
import { Expense, expensesForPeriod, getExpenses, periodLabel } from '@/lib/expenses';
import { monthOf, phaseForSeason, seasonOf, suggestedMarkdown } from '@/lib/seasons';
import { planReorder } from '@/lib/reorder';
import {
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Camera,
  PackagePlus,
  PackageX,
  Ruler,
  Tag,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';

const DAY = 86_400_000;
const fmt = (n: number) => Math.round(n).toLocaleString('mk-MK');

const NON_MERCHANDISE = new Set(['vaucer']);
const CORE_SIZES = ['M', 'L', 'XL'];
const LETTER_SIZES = ['S', 'M', 'L', 'XL', 'XXL', 'XXXL'];

/** Stock ceiling as a multiple of monthly cost of goods (docs/TURNAROUND.md). */
const MAX_MONTHS_OF_STOCK = 2.5;

/**
 * How many alerts get shown (Task 4.4).
 *
 * Eight, because past that nobody reads to the bottom and the ranking stops
 * meaning anything. The cut is stated on screen rather than silent — a list
 * that quietly drops its tail is how a real problem becomes invisible.
 */
const MAX_ALERTS = 8;

interface Alert {
  key: string;
  /** Denars a month, or a one-off amount. Used only for ordering. */
  weight: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: 'red' | 'amber' | 'blue';
  title: string;
  detail: string;
  /** Where to act. Omitted when the alert is informational only. */
  href?: string;
  /** Acts on this page instead of navigating — the catalogue is right below. */
  focus?: 'leak';
  action?: string;
}

const periodOf = (d: Date) =>
  d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');

export default function DashboardSummary({
  products,
  onShowLeak,
}: {
  products: Product[];
  /** Focuses the catalogue below on the discounts that are leaking. */
  onShowLeak?: () => void;
}) {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [now] = useState(() => Date.now());

  useEffect(() => {
    // Expenses are optional: the table may not exist yet, and the month simply
    // shows gross until costs are entered.
    getExpenses().then(setExpenses).catch(() => setExpenses([]));
    // Orders only split the month by channel; without them it is all one figure.
    getOrders().then(setOrders).catch(() => setOrders([]));
  }, []);

  const model = useMemo(() => {
    const merch = products.filter((p) => !NON_MERCHANDISE.has(p.category));
    const month12 = monthOf(now);
    const unitsOf = (p: Product) =>
      (p.sizes ?? []).reduce((a, s) => a + Math.max(0, Number(s.quantity) || 0), 0);

    const today = new Date(now);
    const thisPeriod = periodOf(today);
    const lastPeriod = periodOf(new Date(today.getFullYear(), today.getMonth() - 1, 1));
    const todayKey = today.toISOString().slice(0, 10);

    let todayUnits = 0;
    let todayRevenue = 0;
    // Revenue per day for the last week, for the sparkline.
    const daily = new Map<string, number>();
    const month = { units: 0, revenue: 0, cogs: 0, costed: 0 };
    const prev = { units: 0, revenue: 0, cogs: 0, costed: 0 };

    let stockCost = 0;
    let unpublishedCount = 0;
    let unpublishedRetail = 0;
    let deadCount = 0;
    let deadCost = 0;
    let leak90 = 0;
    let leakCount = 0;
    let brokenCore = 0;
    let liveLetterModels = 0;
    let annualCogs = 0;
    let annualCosted = 0;
    let annualUnits = 0;

    for (const p of merch) {
      const units = unitsOf(p);
      const cost = p.purchasePrice;
      const effective = getEffectivePrice(p);
      const live = p.isVisible !== false && units > 0;

      if (units > 0 && cost !== undefined) stockCost += units * cost;

      if (p.isVisible === false && units > 0) {
        unpublishedCount += 1;
        unpublishedRetail += units * effective;
      }

      // Broken core size run on something customers can actually buy.
      if (live) {
        const inStock = new Set(
          (p.sizes ?? [])
            .filter((s) => Number(s.quantity) >= 1)
            .map((s) => canonicalSize(s.size))
        );
        if (LETTER_SIZES.some((l) => inStock.has(l))) {
          liveLetterModels += 1;
          if (!CORE_SIZES.every((c) => inStock.has(c))) brokenCore += 1;
        }
      }

      let sold90 = 0;
      let sold365 = 0;

      for (const s of p.sold ?? []) {
        const price = Number(s.price) || 0;
        if (price <= 0) continue; // giveaways are not revenue
        const raw = String(s.soldDate);
        const t = Date.parse(raw);
        if (!Number.isFinite(t)) continue;

        const day = raw.slice(0, 10);
        const key = raw.slice(0, 7);

        if (day === todayKey) { todayUnits += 1; todayRevenue += price; }
        if (t >= now - 7 * DAY) daily.set(day, (daily.get(day) ?? 0) + price);

        const bucket = key === thisPeriod ? month : key === lastPeriod ? prev : null;
        if (bucket) {
          bucket.units += 1;
          bucket.revenue += price;
          if (cost !== undefined) { bucket.cogs += cost; bucket.costed += 1; }
        }

        if (t >= now - 365 * DAY) {
          sold365 += 1;
          annualUnits += 1;
          if (cost !== undefined) { annualCogs += cost; annualCosted += 1; }
        }
        if (t >= now - 90 * DAY) sold90 += 1;
      }

      // Discount on stock that sells anyway is pure margin given away.
      if (isOnSale(p) && sold90 > 0) {
        leakCount += 1;
        leak90 += (p.price - effective) * sold90;
      }

      // Old, and nothing sold in a year.
      if (units > 0 && p.firstReceivedAt) {
        const age = Math.floor((now - p.firstReceivedAt.getTime()) / DAY);
        if (age > 180 && sold365 === 0) {
          deadCount += 1;
          if (cost !== undefined) deadCost += units * cost;
        }
      }
    }

    const scale = (b: typeof month) => (b.units > 0 && b.costed > 0 ? b.units / b.costed : 1);
    const monthCogs = month.cogs * scale(month);
    const prevCogs = prev.cogs * scale(prev);
    const monthGross = month.revenue - monthCogs;
    const prevGross = prev.revenue - prevCogs;

    const e = expensesForPeriod(expenses, thisPeriod);
    const monthlyCogs = annualUnits > 0 ? (annualCogs * (annualUnits / Math.max(1, annualCosted))) / 12 : 0;
    const maxStock = monthlyCogs * MAX_MONTHS_OF_STOCK;

    const alerts: Alert[] = [];

    if (leakCount > 0) {
      alerts.push({
        key: 'leak',
        weight: leak90 / 3,
        icon: Tag,
        tone: 'red',
        title: `${leakCount} производи на попуст што и така се продаваат`,
        detail: `Дадена маржа: ${fmt(leak90 / 3)} ден. месечно. Тоа е попуст на стока што не му треба.`,
        focus: 'leak',
        action: 'Филтрирај го каталогот',
      });
    }

    if (stockCost > maxStock && maxStock > 0) {
      alerts.push({
        key: 'ceiling',
        weight: (stockCost - maxStock) / 12,
        icon: AlertTriangle,
        tone: 'red',
        title: `Залихата е ${(stockCost / maxStock).toFixed(1)}× над здравиот максимум`,
        detail: `${fmt(stockCost)} ден. наспроти ${fmt(maxStock)}. Буџетот за набавка е нула додека не се врати.`,
        href: '/admin/capital',
        action: 'Отвори капитал',
      });
    }

    if (deadCount > 0) {
      alerts.push({
        key: 'dead',
        weight: deadCost / 12,
        icon: PackageX,
        tone: 'amber',
        title: `${deadCount} модели без продажба цела година`,
        detail: `${fmt(deadCost)} ден. застанати пари. Раниот попуст враќа повеќе кеш од длабокиот подоцна.`,
        href: '/admin/aging',
        action: 'Отвори стареење',
      });
    }

    if (unpublishedCount > 0) {
      alerts.push({
        key: 'unpublished',
        weight: unpublishedRetail / 24,
        icon: Camera,
        tone: 'blue',
        title: `${unpublishedCount} модели со залиха не се на storefront`,
        detail: `${fmt(unpublishedRetail)} ден. продажна вредност што online не постои.`,
        href: '/admin/publishing',
        action: 'Отвори редица',
      });
    }

    if (brokenCore > 0 && liveLetterModels > 0) {
      alerts.push({
        key: 'sizes',
        weight: 0,
        icon: Ruler,
        tone: 'amber',
        title: `${brokenCore} од ${liveLetterModels} живи модели без цела M/L/XL серија`,
        detail: 'M+L+XL е 71% од продажбата. Купувач што не ја наоѓа големината е продажба што никаде не се брои.',
        href: '/admin/sizes',
        action: 'Отвори триажа',
      });
    }

    // Season: stock whose window is closing or shut. This is the only figure
    // here with a deadline attached — the others cost carrying, this one stops
    // being sellable at all. Weighted on the carrying cost of that capital so
    // it ranks against the rest on the same basis.
    let seasonCost = 0;
    let seasonModels = 0;
    let deepestCut = 0;
    for (const p of merch) {
      const units = unitsOf(p);
      if (units === 0) continue;
      const prof = seasonOf(p.category);
      if (!prof) continue;
      const phase = phaseForSeason(prof.season, month12);
      const cut = suggestedMarkdown(phase, month12);
      if (cut === 0) continue;
      seasonCost += units * (p.purchasePrice ?? 0);
      seasonModels += 1;
      deepestCut = Math.max(deepestCut, cut);
    }

    if (seasonModels > 0) {
      alerts.push({
        key: 'season',
        weight: seasonCost / 12,
        icon: CalendarDays,
        tone: 'amber',
        title: `${seasonModels} модели во сезона што се затвора`,
        detail: `${fmt(seasonCost)} ден. набавна. Календарот вели до −${deepestCut}% сега — подоцна и подлабоко враќа помалку.`,
        href: '/admin/season',
        action: 'Отвори календар',
      });
    }

    // Restock: the one alert that points at money coming in rather than money
    // stuck. Weighted on the gross profit the plan would earn, spread over the
    // cover it buys, so it is comparable with the monthly figures above.
    const plan = planReorder(merch, { now, month: month12 });
    if (plan.lines.length > 0) {
      const gross = plan.revenue - plan.cost;
      alerts.push({
        key: 'restock',
        weight: gross / 6,
        icon: PackagePlus,
        tone: 'blue',
        title: `${plan.lines.length} модели со докажана побарувачка чекаат дополнување`,
        detail: `${fmt(plan.cost)} ден. набавна → ${fmt(gross)} ден. бруто. Единствената набавка што A4 ја дозволува.`,
        href: '/admin/reorder',
        action: 'Отвори план',
      });
    }

    alerts.sort((a, b) => b.weight - a.weight);

    // The last seven days, oldest first, zero for a day with no sales.
    const week = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now - (6 - i) * DAY);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      return { key, revenue: daily.get(key) ?? 0 };
    });

    // Online revenue this month. Online orders write sold[] too (D-009), so the
    // month total already contains them — the shop's share is what is left.
    // Only orders that were paid or are still under way count; a refused,
    // returned or uncollected one has already been taken out of sold[].
    const online = orders
      .filter((o) => periodOf(o.createdAt) === thisPeriod && o.status !== 'cancelled')
      .reduce((a, o) => a + o.subtotal, 0);

    return {
      todayUnits, todayRevenue,
      week,
      online,
      thisPeriod, lastPeriod,
      month: { ...month, cogs: monthCogs, gross: monthGross },
      prev: { ...prev, cogs: prevCogs, gross: prevGross },
      expenses: e.total,
      expensesKnown: e.items.length > 0,
      net: monthGross - e.total,
      alerts: alerts.slice(0, MAX_ALERTS),
      alertsHidden: Math.max(0, alerts.length - MAX_ALERTS),
    };
  }, [products, expenses, orders, now]);

  const delta = (cur: number, before: number) =>
    before > 0 ? ((cur - before) / before) * 100 : null;
  const revDelta = delta(model.month.revenue, model.prev.revenue);

  const toneClass = {
    red: 'border-red-200 bg-red-50',
    amber: 'border-amber-200 bg-amber-50',
    blue: 'border-blue-200 bg-blue-50',
  };
  const iconClass = { red: 'text-red-600', amber: 'text-amber-600', blue: 'text-blue-600' };

  return (
    <div className="mb-6 sm:mb-8 space-y-4">
      {/* this month */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-sm">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="font-bold text-slate-800">{periodLabel(model.thisPeriod)}</h2>
          <span className="text-xs text-slate-400 tabular-nums flex items-center gap-2">
            <Sparkline days={model.week} />
            денес: {model.todayUnits} парч. · {fmt(model.todayRevenue)} ден.
          </span>
        </div>
        {model.month.revenue > 0 && (
          <p className="text-[11px] text-slate-500 mb-3 tabular-nums">
            Дуќан <strong className="text-slate-700">{fmt(Math.max(0, model.month.revenue - model.online))}</strong>
            {' · '}Online <strong className="text-slate-700">{fmt(model.online)}</strong>
            {' '}({((model.online / model.month.revenue) * 100).toFixed(0)}%)
          </p>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Tile
            k="Приход"
            v={fmt(model.month.revenue)}
            sub={`${model.month.units} парчиња`}
            delta={revDelta}
          />
          <Tile
            k="Бруто профит"
            v={fmt(model.month.gross)}
            sub={
              model.month.revenue > 0
                ? `маржа ${((model.month.gross / model.month.revenue) * 100).toFixed(0)}%`
                : '—'
            }
          />
          <Tile
            k="Трошоци"
            v={model.expensesKnown ? fmt(model.expenses) : '—'}
            sub={model.expensesKnown ? 'внесени' : 'не се внесени'}
            muted={!model.expensesKnown}
          />
          {model.expensesKnown ? (
            <Tile
              k="Нето резултат"
              v={(model.net >= 0 ? '+' : '−') + fmt(Math.abs(model.net))}
              sub={model.net >= 0 ? 'позитивен' : 'загуба'}
              tone={model.net >= 0 ? 'good' : 'bad'}
            />
          ) : (
            <Link
              href="/admin/finance"
              className="rounded-lg border border-dashed border-slate-300 px-3 py-2 hover:border-blue-400 transition-colors flex flex-col justify-center"
            >
              <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                Нето резултат
              </p>
              <p className="text-sm text-blue-600 font-medium">Внеси трошоци →</p>
            </Link>
          )}
        </div>

        {model.prev.revenue > 0 && (
          <p className="text-[11px] text-slate-400 mt-3 tabular-nums">
            {periodLabel(model.lastPeriod)}: приход {fmt(model.prev.revenue)} · бруто{' '}
            {fmt(model.prev.gross)} · {model.prev.units} парчиња
          </p>
        )}
      </div>

      {/* attention */}
      {model.alerts.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-2">
            <h2 className="font-bold text-slate-800 text-sm">Бара внимание</h2>
            <span className="text-[11px] text-slate-400">
              подредено по пари во игра
              {model.alertsHidden > 0 && ` · уште ${model.alertsHidden} под првите ${MAX_ALERTS}`}
            </span>
          </div>
          <div className="space-y-2">
            {model.alerts.map((a) => {
              const Icon = a.icon;
              const body = (
                <>
                  <Icon className={`h-4 w-4 shrink-0 mt-0.5 ${iconClass[a.tone]}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800">{a.title}</p>
                    <p className="text-xs text-slate-600 mt-0.5">{a.detail}</p>
                  </div>
                  {a.action && (
                    <span className="shrink-0 flex items-center gap-1 text-xs font-medium text-slate-500 mt-0.5">
                      {a.action}
                      <ArrowRight className="h-3.5 w-3.5" />
                    </span>
                  )}
                </>
              );
              const shell = `flex items-start gap-3 rounded-xl border px-4 py-3 text-left w-full ${toneClass[a.tone]}`;

              // Acts here, goes elsewhere, or just informs — an alert never
              // pretends to be clickable when there is nowhere to send you.
              if (a.focus === 'leak' && onShowLeak) {
                return (
                  <button key={a.key} onClick={onShowLeak} className={`${shell} transition-colors hover:brightness-[0.98]`}>
                    {body}
                  </button>
                );
              }
              if (a.href) {
                return (
                  <Link key={a.key} href={a.href} className={`${shell} transition-colors hover:brightness-[0.98]`}>
                    {body}
                  </Link>
                );
              }
              return <div key={a.key} className={shell}>{body}</div>;
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Seven days of revenue as seven bars. Small on purpose: it answers "is this
 * week normal" at a glance and nothing more — the numbers are in /admin/finance.
 */
function Sparkline({ days }: { days: Array<{ key: string; revenue: number }> }) {
  const max = Math.max(1, ...days.map((d) => d.revenue));
  return (
    <svg width={7 * 6} height={16} aria-label="Приход последни 7 дена" className="shrink-0">
      {days.map((d, i) => {
        const h = Math.max(1, Math.round((d.revenue / max) * 16));
        return (
          <rect key={d.key} x={i * 6} y={16 - h} width={4} height={h} rx={1}
            className={i === days.length - 1 ? 'fill-blue-500' : 'fill-slate-300'}>
            <title>{`${d.key}: ${Math.round(d.revenue).toLocaleString('mk-MK')} ден.`}</title>
          </rect>
        );
      })}
    </svg>
  );
}

function Tile({
  k, v, sub, delta, tone, muted,
}: {
  k: string;
  v: string;
  sub?: string;
  delta?: number | null;
  tone?: 'good' | 'bad';
  muted?: boolean;
}) {
  const colour =
    tone === 'good' ? 'text-green-700' : tone === 'bad' ? 'text-red-700'
      : muted ? 'text-slate-300' : 'text-slate-800';
  return (
    <div className="rounded-lg bg-slate-50 px-3 py-2">
      <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{k}</p>
      <p className={`text-xl font-bold tabular-nums ${colour}`}>{v}</p>
      <p className="text-[11px] text-slate-400 flex items-center gap-1">
        {sub}
        {delta !== null && delta !== undefined && Number.isFinite(delta) && (
          <span className={delta >= 0 ? 'text-green-600' : 'text-red-600'}>
            {delta >= 0 ? <TrendingUp className="inline h-3 w-3" /> : <TrendingDown className="inline h-3 w-3" />}
            {Math.abs(delta).toFixed(0)}%
          </span>
        )}
      </p>
    </div>
  );
}
