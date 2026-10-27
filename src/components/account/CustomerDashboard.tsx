'use client';

/**
 * The customer's own page (Task 13.9): points, coupons, the points history,
 * orders and the profile. Mobile first, Macedonian, every number from the
 * database — the customer's own rows (RLS) and their own orders (server).
 *
 * `data-tour` marks what the guided tour (13.13) points at.
 */

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, ChevronDown, CircleHelp, Clock, Copy, Gift, Package, ShoppingBag, Tag } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useCart } from '@/context/CartContext';
import { POLICIES, type PolicyKey } from '@/config/policies';
import type { AccountView, CustomerOrder, ProgrammeRules } from '@/lib/account';
import { accountFetch, resendConfirmation } from '@/lib/account-client';
import { HistoryEntry, PointsMovement, PointsSummary, fetchPointsMovements, pointsHistory, summarizePoints } from '@/lib/points';
import { Coupon, CouponRow, Redemption, describeCoupon, fetchRedemptions, rowToCoupon } from '@/lib/coupons';
import { CustomerCoupon, sortCustomerCoupons } from '@/lib/customer-coupons';
import { useTranslation } from '@/lib/i18n';
import { Notice } from './AccountFrame';
import ProfileForm from './ProfileForm';
import WheelPanel from '@/components/wheel/WheelPanel';
import type { WheelState } from '@/lib/wheel';
import Tour, { type TourStep } from '@/components/Tour';

/** The tabs; their keys are the `?tab=` values in the address, their names `account.tabs.<key>`. */
export const DASHBOARD_TABS = [
  { key: 'home' },
  { key: 'coupons' },
  { key: 'points' },
  { key: 'orders' },
  { key: 'wheel' },
  { key: 'profile' },
] as const;
export type DashboardTab = (typeof DASHBOARD_TABS)[number]['key'];

/** The page's words and numbers, in the visitor's language. */
function useWords() {
  const { t, language, number, date, price } = useTranslation();
  const n = (v: number) => number(v, 1);
  /** A count with its noun, `<key>One` or `<key>Other` ("1 point" / "2 points"); Macedonian has one form here. */
  const count = (key: string, c: number, params: Record<string, string | number> = {}) =>
    t(`${key}${c === 1 ? 'One' : 'Other'}`, { n: n(c), ...params });
  return { t, language, n, day: date, price, count };
}
type Words = ReturnType<typeof useWords>;

interface DashboardData {
  moves: PointsMovement[];
  coupons: Coupon[];
  uses: Redemption[];
  orders: CustomerOrder[];
  ordersError?: string;
}

/** Everything the page shows, read in one go: the customer's own rows and their own orders. */
async function readDashboard(userId: string): Promise<DashboardData> {
  const [moves, coupons, uses, orders] = await Promise.all([
    fetchPointsMovements(supabase, userId),
    supabase.from('coupons').select('*'),
    fetchRedemptions(supabase, 100),
    accountFetch<{ orders: CustomerOrder[] }>('/api/account/orders'),
  ]);
  return {
    moves: moves.data,
    coupons: ((coupons.data ?? []) as CouponRow[]).map(rowToCoupon),
    uses: uses.data,
    orders: orders.data?.orders ?? [],
    ordersError: orders.error,
  };
}

export default function CustomerDashboard({
  view, userId, tab: asked, onTab, confirmedNow, onSaved, onSignOut,
}: {
  view: AccountView;
  userId: string;
  tab: DashboardTab;
  onTab: (t: DashboardTab) => void;
  confirmedNow: boolean;
  onSaved: (v: AccountView) => void;
  onSignOut: () => void;
}) {
  const words = useWords();
  const { t } = words;
  // The wheel's tab exists only while the owner has the wheel on (13.10).
  const wheelOn = view.rules.wheelEnabled;
  const tab: DashboardTab = asked === 'wheel' && !wheelOn ? 'home' : asked;
  const [data, setData] = useState<DashboardData | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [resent, setResent] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    readDashboard(userId).then((d) => {
      if (!live) return;
      setData(d);
      setNow(new Date());
    });
    return () => { live = false; };
  }, [userId]);

  // The tour (13.13): once on the first visit, again from "Водич". It runs on
  // the home tab, where the things it points at are.
  const [tourAsked, setTourAsked] = useState(false);
  const [tourDone, setTourDone] = useState(false);
  const touring = !!data && tab === 'home' && (tourAsked || (!view.profile?.tourSeen && !tourDone));
  const closeTour = () => {
    setTourAsked(false);
    setTourDone(true);
    if (!view.profile?.tourSeen) accountFetch('/api/account/tour', { method: 'POST', body: '{}' });
  };
  const steps = tourSteps(view.rules, wheelOn, words);

  const summary = useMemo(() => summarizePoints(data?.moves ?? [], now, 30), [data, now]);
  const history = useMemo(() => pointsHistory(data?.moves ?? [], now), [data, now]);
  const coupons = useMemo(() => sortCustomerCoupons(data?.coupons ?? [], data?.uses ?? [], now), [data, now]);
  const profile = view.profile!;

  return (
    <main className="bg-stone-50 min-h-[70vh]">
      <div className="max-w-lg mx-auto px-4 py-6 sm:py-10">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-bold text-stone-900">{t('account.dashboard.hello', { name: profile.firstName })}</h1>
            <p className="text-sm text-stone-600 truncate">{view.email}</p>
          </div>
          <button
            type="button"
            onClick={() => { onTab('home'); setTourAsked(true); }}
            className="shrink-0 mt-1 inline-flex items-center gap-1 text-sm text-stone-600 border border-stone-300 rounded-full px-3 py-1"
          >
            <CircleHelp className="h-4 w-4" /> {t('account.dashboard.guide')}
          </button>
        </div>
        {touring && <Tour steps={steps} onClose={closeTour} />}

        <div className="space-y-3 mt-4">
          {confirmedNow && view.emailConfirmed && <Notice tone="green">{t('account.dashboard.confirmedWelcome')}</Notice>}
          {!view.emailConfirmed && (
            <Notice tone="amber">
              {t('account.dashboard.confirmEmail')}
              <button
                type="button"
                onClick={async () => setResent((await resendConfirmation(view.email)) ?? t('account.common.linkResent'))}
                className="block mt-1 font-medium underline underline-offset-2"
              >
                {t('account.common.resendLink')}
              </button>
              {resent && <span className="block mt-1">{resent}</span>}
            </Notice>
          )}
        </div>

        <nav className="mt-5 -mx-4 px-4 flex gap-1 overflow-x-auto border-b border-stone-200" data-tour="tabs">
          {DASHBOARD_TABS.filter((d) => d.key !== 'wheel' || wheelOn).map((d) => (
            <button
              key={d.key}
              type="button"
              onClick={() => onTab(d.key)}
              data-tour={d.key === 'orders' ? 'orders' : d.key === 'wheel' ? 'wheel-tab' : undefined}
              className={`shrink-0 px-3 py-2.5 text-sm font-medium -mb-px border-b-2 ${tab === d.key ? 'border-stone-900 text-stone-900' : 'border-transparent text-stone-500'}`}
            >
              {t(`account.tabs.${d.key}`)}
            </button>
          ))}
        </nav>

        <div className="mt-5">
          {tab === 'wheel' ? (
            <WheelPanel />
          ) : tab !== 'profile' && !data ? (
            <div className="py-16 flex justify-center">
              <div className="animate-spin h-8 w-8 border-4 border-stone-900 border-t-transparent rounded-full" />
            </div>
          ) : tab === 'home' ? (
            <Home summary={summary} coupons={coupons} rules={view.rules} onTab={onTab} wheelOn={wheelOn} />
          ) : tab === 'coupons' ? (
            <CouponsPanel coupons={coupons} />
          ) : tab === 'points' ? (
            <PointsPanel summary={summary} history={history} rules={view.rules} />
          ) : tab === 'orders' ? (
            <OrdersPanel orders={data!.orders} error={data!.ordersError} />
          ) : (
            <section className="bg-white rounded-xl border border-stone-200 p-4">
              <h2 className="font-semibold text-stone-900 mb-3">{t('account.dashboard.myDetails')}</h2>
              <ProfileForm initial={profile} requireConsent={false} onSaved={onSaved} />
              <nav className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                {(Object.keys(POLICIES) as PolicyKey[]).filter((k) => POLICIES[k].live).map((k) => (
                  <Link key={POLICIES[k].path} href={POLICIES[k].path} className="text-stone-600 underline underline-offset-2">{t(`policies.${k}.title`)}</Link>
                ))}
              </nav>
              <button type="button" onClick={onSignOut} className="mt-6 w-full rounded-lg border border-stone-300 py-2.5 text-sm text-stone-700 hover:bg-stone-50">
                {t('account.common.signOut')}
              </button>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// The tour's steps, in the shop's own numbers (13.13)
// ---------------------------------------------------------------------------

function tourSteps(rules: ProgrammeRules, wheelOn: boolean, { t, n, count }: Words): TourStep[] {
  const steps: Array<TourStep | false> = [
    { target: 'points', title: t('account.tour.points.title'), body: t('account.tour.points.body') },
    {
      target: 'pending', title: t('account.tour.pending.title'),
      body: t('account.tour.pending.body', {
        days: count('account.units.days', rules.pendingDays),
        months: count('account.units.months', rules.expiryMonths),
      }),
    },
    { target: 'coupons', title: t('account.tour.coupons.title'), body: t('account.tour.coupons.body') },
    wheelOn && { target: 'wheel', title: t('account.tour.wheel.title'), body: t('account.tour.wheel.body') },
    {
      target: 'how', title: t('account.tour.how.title'),
      body: t('account.tour.how.body', {
        earnPct: n(rules.earnRatePct),
        minPoints: count('account.units.points', rules.minPointsToRedeem),
        maxPct: n(rules.maxRedeemBasketPct),
      }),
    },
    { target: 'orders', title: t('account.tour.orders.title'), body: t('account.tour.orders.body') },
  ];
  return steps.filter((s): s is TourStep => !!s);
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

function Home({
  summary, coupons, rules, onTab, wheelOn,
}: { summary: PointsSummary; coupons: ReturnType<typeof sortCustomerCoupons>; rules: ProgrammeRules; onTab: (t: DashboardTab) => void; wheelOn: boolean }) {
  const { t, n, day, price, count } = useWords();
  const usable = coupons.soon.length + coupons.active.filter((c) => c.state === 'active').length;
  return (
    <div className="space-y-4">
      {wheelOn && <WheelCard onOpen={() => onTab('wheel')} />}
      <section className="rounded-2xl bg-stone-900 text-white p-5" data-tour="points">
        <p className="text-sm text-stone-300">{t('account.home.activePoints')}</p>
        <p className="text-4xl font-bold tabular-nums mt-1">{n(summary.active)}</p>
        <p className="text-sm text-stone-300 mt-1">{t('account.home.worth', { amount: price(summary.active) })}</p>
        <div className="mt-4 pt-4 border-t border-white/15 flex items-start gap-2 text-sm" data-tour="pending">
          <Clock className="h-4 w-4 mt-0.5 shrink-0 text-stone-400" />
          <p>
            <span className="font-semibold">{n(summary.pending)}</span> {t('account.home.pending')}
            <span className="block text-xs text-stone-400">
              {t('account.home.pendingHint', { days: count('account.units.days', rules.pendingDays) })}
            </span>
          </p>
        </div>
        {summary.expiringSoon > 0 && summary.nextExpiry && (
          <p className="mt-3 text-xs bg-amber-400/15 text-amber-200 rounded-lg px-3 py-2">
            {count('account.home.expiring', summary.nextExpiryPoints, { date: day(summary.nextExpiry) })}
          </p>
        )}
      </section>

      <button
        type="button"
        onClick={() => onTab('coupons')}
        data-tour="coupons"
        className="w-full text-left rounded-2xl bg-white border border-stone-200 p-4 flex items-center gap-3"
      >
        <Tag className="h-5 w-5 text-stone-700 shrink-0" />
        <span className="flex-1">
          <span className="block font-semibold text-stone-900">{count('account.home.couponsActive', usable)}</span>
          {coupons.soon.length > 0 ? (
            <span className="block text-sm text-amber-700">{count('account.home.couponsSoon', coupons.soon.length)}</span>
          ) : (
            <span className="block text-sm text-stone-500">{t('account.home.couponsHint')}</span>
          )}
        </span>
        <span className="text-stone-400">›</span>
      </button>

      <section className="rounded-2xl bg-white border border-stone-200 p-4" data-tour="how">
        <h2 className="font-semibold text-stone-900 flex items-center gap-2"><Gift className="h-4 w-4" /> {t('account.home.howTitle')}</h2>
        <ul className="mt-2 space-y-1.5 text-sm text-stone-700 list-disc pl-5">
          <li>{t('account.home.earnBefore')} <strong>{n(rules.earnRatePct)}%</strong> {t('account.home.earnAfter')}</li>
          <li>{t('account.home.reduced', { bandPct: n(rules.discountBandPct), reducedPct: n(rules.reducedRatePct) })}</li>
          <li>
            {t('account.home.activation', {
              days: count('account.units.days', rules.pendingDays),
              months: count('account.units.months', rules.expiryMonths),
            })}
          </li>
          <li>
            {t('account.home.spend', {
              minPoints: count('account.units.points', rules.minPointsToRedeem),
              minOrder: price(rules.minOrderForRedeem),
              maxPct: n(rules.maxRedeemBasketPct),
            })}
          </li>
        </ul>
        <Link href={POLICIES.rules.path} className="inline-block mt-2 text-sm text-stone-600 underline underline-offset-2">{t('account.home.allRules')}</Link>
      </section>
    </div>
  );
}

/** Whether the wheel can be spun now, or when next (13.10). */
function WheelCard({ onOpen }: { onOpen: () => void }) {
  const { t, day } = useWords();
  const [state, setState] = useState<WheelState | null>(null);
  useEffect(() => {
    let live = true;
    accountFetch<WheelState>('/api/wheel').then((r) => { if (live && r.data) setState(r.data); });
    return () => { live = false; };
  }, []);
  if (!state?.enabled) return null;
  return (
    <button
      type="button"
      onClick={onOpen}
      data-tour="wheel"
      className={`w-full text-left rounded-2xl p-4 flex items-center gap-3 border ${state.canSpin ? 'bg-amber-50 border-amber-300' : 'bg-white border-stone-200'}`}
    >
      <Gift className="h-5 w-5 text-amber-700 shrink-0" />
      <span className="flex-1">
        <span className="block font-semibold text-stone-900">{t('account.wheelCard.title')}</span>
        <span className="block text-sm text-stone-600">
          {state.canSpin ? t('account.wheelCard.canSpin') : state.nextAt ? t('account.wheelCard.nextAt', { date: day(state.nextAt) }) : t('account.wheelCard.everySpin')}
        </span>
      </span>
      <span className="text-stone-400">›</span>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Coupons
// ---------------------------------------------------------------------------

function scopeText(c: Coupon, { t }: Words): string {
  // A category without a name of its own shows its key, as before.
  const name = (k: string) => {
    const key = `categoryNames.${k}`;
    const named = t(key);
    return named === key ? k : named;
  };
  const parts: string[] = [];
  if (c.includeCategories.length) parts.push(t('account.coupons.onlyCategories', { list: c.includeCategories.map(name).join(', ') }));
  if (c.includeProducts.length) parts.push(t('account.coupons.onlyProducts'));
  if (c.excludeCategories.length) parts.push(t('account.coupons.exceptCategories', { list: c.excludeCategories.map(name).join(', ') }));
  return parts.join(' · ');
}

function CouponsPanel({ coupons }: { coupons: ReturnType<typeof sortCustomerCoupons> }) {
  const words = useWords();
  const { t, day, language } = words;
  const { items, setCouponCode } = useCart();
  const router = useRouter();
  const [copied, setCopied] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const copy = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      // No clipboard: the code is on screen to type.
    }
  };
  const apply = (code: string) => {
    setCouponCode(code);
    if (items.length > 0) router.push('/checkout');
    else setSaved(code);
  };

  const card = (c: CustomerCoupon, usable: boolean) => (
    <li key={c.key} className={`rounded-xl border p-4 ${c.state === 'soon' ? 'border-amber-300 bg-amber-50' : 'border-stone-200 bg-white'} ${usable ? '' : 'opacity-70'}`}>
      <div className="flex items-center gap-2">
        <span className="font-mono font-bold text-stone-900 tracking-wide">{c.code}</span>
        {usable && (
          <button type="button" onClick={() => copy(c.code)} className="ml-auto inline-flex items-center gap-1 text-xs text-stone-600" aria-label={t('account.coupons.copyAria', { code: c.code })}>
            {copied === c.code ? <><Check className="h-3.5 w-3.5 text-green-700" /> {t('account.coupons.copied')}</> : <><Copy className="h-3.5 w-3.5" /> {t('account.coupons.copy')}</>}
          </button>
        )}
      </div>
      {c.coupon && <p className="text-sm text-stone-800 mt-1">{describeCoupon(c.coupon, scopeText(c.coupon, words), language)}</p>}
      <p className={`text-xs mt-1 ${c.state === 'soon' ? 'text-amber-800 font-medium' : 'text-stone-500'}`}>
        {c.state === 'soon' && (c.daysLeft !== undefined && c.daysLeft <= 1 ? t('account.coupons.expiresToday') : t('account.coupons.expiresIn', { n: c.daysLeft ?? '' }))}
        {c.state === 'active' && (c.coupon?.endsAt ? t('account.coupons.validUntil', { date: day(c.coupon.endsAt) }) : t('account.coupons.noEnd'))}
        {c.state === 'upcoming' && t('account.coupons.validFrom', { date: day(c.coupon?.startsAt) })}
        {c.state === 'used' && (c.usedOn?.orderNumber
          ? t('account.coupons.usedOnOrder', { order: c.usedOn.orderNumber, date: day(c.usedOn.at) })
          : t('account.coupons.used', { date: day(c.usedOn?.at) }))}
        {c.state === 'expired' && t('account.coupons.expired', { date: day(c.coupon?.endsAt) })}
        {c.state === 'off' && t('account.coupons.off')}
      </p>
      {usable && c.state !== 'upcoming' && (
        <button type="button" onClick={() => apply(c.code)} className="mt-3 w-full rounded-lg bg-stone-900 text-white py-2.5 text-sm font-semibold inline-flex items-center justify-center gap-2">
          <ShoppingBag className="h-4 w-4" /> {t('account.coupons.apply')}
        </button>
      )}
    </li>
  );

  const none = coupons.soon.length + coupons.active.length === 0;
  return (
    <div className="space-y-5">
      {saved && (
        <Notice tone="green">
          {t('account.coupons.savedBefore')} <strong>{saved}</strong> {t('account.coupons.savedAfter')}{' '}
          <Link href="/" className="underline underline-offset-2">{t('account.common.toShop')}</Link>
        </Notice>
      )}
      {coupons.soon.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-amber-800 mb-2">{t('account.coupons.soonTitle')}</h2>
          <ul className="space-y-3">{coupons.soon.map((c) => card(c, true))}</ul>
        </section>
      )}
      <section>
        <h2 className="text-sm font-semibold text-stone-900 mb-2">{t('account.coupons.activeTitle')}</h2>
        {coupons.active.length > 0 ? (
          <ul className="space-y-3">{coupons.active.map((c) => card(c, true))}</ul>
        ) : (
          <p className="text-sm text-stone-500">{none ? t('account.coupons.none') : t('account.coupons.noOthers')}</p>
        )}
      </section>
      {coupons.history.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-stone-500 mb-2">{t('account.coupons.historyTitle')}</h2>
          <ul className="space-y-3">{coupons.history.map((c) => card(c, false))}</ul>
        </section>
      )}
      <p className="text-xs text-stone-500">{t('account.coupons.onePerOrder')}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Points
// ---------------------------------------------------------------------------

function stateText(e: HistoryEntry, { t, day }: Words): string {
  switch (e.state) {
    case 'awaiting': return t('account.points.state.awaiting');
    case 'waiting': return t('account.points.state.waiting', { date: day(e.availableAt) });
    case 'active': return t('account.points.state.active', { date: day(e.expiresAt) });
    case 'expired': return t('account.points.state.expired');
    case 'used': return t('account.points.state.used');
    default: return '';
  }
}

function PointsPanel({ summary, history, rules }: { summary: PointsSummary; history: HistoryEntry[]; rules: ProgrammeRules }) {
  const words = useWords();
  const { t, n, day, count } = words;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white border border-stone-200 p-3">
          <p className="text-xs text-stone-500">{t('account.points.active')}</p>
          <p className="text-2xl font-bold tabular-nums text-stone-900">{n(summary.active)}</p>
        </div>
        <div className="rounded-xl bg-white border border-stone-200 p-3">
          <p className="text-xs text-stone-500">{t('account.points.pending')}</p>
          <p className="text-2xl font-bold tabular-nums text-stone-900">{n(summary.pending)}</p>
        </div>
      </div>
      {summary.expiringSoon > 0 && summary.nextExpiry && (
        <Notice tone="amber">{count('account.points.expiring', summary.nextExpiryPoints, { date: day(summary.nextExpiry) })}</Notice>
      )}
      <section className="rounded-xl bg-white border border-stone-200">
        <h2 className="font-semibold text-stone-900 px-4 pt-4 pb-2">{t('account.points.historyTitle')}</h2>
        {history.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-stone-500">
            {t('account.points.empty', { pct: n(rules.earnRatePct) })}
          </p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {history.map((e) => (
              <li key={e.key} className="px-4 py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-stone-900">
                    {t(`account.history.${e.kind}`)}
                    {e.reversed && <span className="text-xs font-normal text-stone-500"> · {t('account.points.reversed')}</span>}
                  </p>
                  <p className="text-xs text-stone-500">
                    {day(e.at)}
                    {e.orderNumber && ` · ${e.orderNumber}`}
                    {stateText(e, words) && ` · ${stateText(e, words)}`}
                  </p>
                  {e.reason && <p className="text-xs text-stone-500 mt-0.5">{e.reason}</p>}
                </div>
                <span className={`text-sm font-semibold tabular-nums ${e.points > 0 ? 'text-green-700' : 'text-stone-500'}`}>
                  {e.points > 0 ? '+' : '−'}{n(Math.abs(e.points))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Orders
// ---------------------------------------------------------------------------

/** The statuses and outcomes with a name of their own (`account.orders.status.*`, `account.orders.outcome.*`). */
const STATUSES = new Set(['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled']);
const OUTCOMES = new Set(['refused', 'returned', 'not_collected']);

function OrdersPanel({ orders, error }: { orders: CustomerOrder[]; error?: string }) {
  const { t, day, price, count } = useWords();
  const [open, setOpen] = useState<string | null>(null);
  if (error) return <Notice tone="red">{error}</Notice>;
  if (orders.length === 0) {
    return (
      <div className="text-center py-10">
        <Package className="h-8 w-8 mx-auto text-stone-400" />
        <p className="text-sm text-stone-600 mt-2">{t('account.orders.empty')}</p>
        <Link href="/" className="inline-block mt-3 text-sm underline underline-offset-2">{t('account.common.toShop')}</Link>
      </div>
    );
  }
  return (
    <ul className="space-y-3">
      {orders.map((o) => {
        const label = (o.outcome && OUTCOMES.has(o.outcome) ? t(`account.orders.outcome.${o.outcome}`) : '')
          || (STATUSES.has(o.status) ? t(`account.orders.status.${o.status}`) : o.status);
        const done = o.status === 'delivered';
        const off = o.status === 'cancelled';
        const isOpen = open === o.orderNumber;
        return (
          <li key={o.orderNumber} className="rounded-xl bg-white border border-stone-200">
            <button type="button" onClick={() => setOpen(isOpen ? null : o.orderNumber)} className="w-full text-left p-4 flex items-center gap-3">
              <span className="flex-1 min-w-0">
                <span className="block font-mono text-sm font-semibold text-stone-900 truncate">{o.orderNumber}</span>
                <span className="block text-xs text-stone-500">{day(o.createdAt)} · {count('account.orders.items', o.items.reduce((a, i) => a + i.quantity, 0))} · {price(o.total)}</span>
              </span>
              <span className={`text-xs font-medium px-2 py-1 rounded-full ${done ? 'bg-green-50 text-green-800' : off ? 'bg-stone-100 text-stone-500' : 'bg-blue-50 text-blue-800'}`}>{label}</span>
              <ChevronDown className={`h-4 w-4 text-stone-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && (
              <div className="px-4 pb-4 text-sm">
                <ul className="divide-y divide-stone-100 border-t border-stone-100">
                  {o.items.map((i, idx) => (
                    // No price per line: above the threshold the stored prices carry the
                    // courier absorbed into them (D-006) and would not add up to what was paid.
                    <li key={idx} className="py-2 truncate">
                      {i.productName}{i.size ? ` · ${i.size}` : ''}{i.quantity > 1 ? ` × ${i.quantity}` : ''}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-stone-500">
                  {o.deliveryMethod === 'pickup' ? t('account.orders.pickup') : t('account.orders.courier')} · {t('account.orders.total', { amount: price(o.total) })}
                </p>
                {o.loyalty && (
                  <p className="mt-1 text-xs text-stone-600">
                    {[
                      o.loyalty.couponCode && t('account.orders.coupon', { code: o.loyalty.couponCode }),
                      o.loyalty.pointsUsed && t('account.orders.paidWith', { points: count('account.units.points', o.loyalty.pointsUsed) }),
                      o.loyalty.pointsEarned && !off && t('account.orders.earned', { points: count('account.units.points', o.loyalty.pointsEarned) }),
                    ].filter(Boolean).join(' · ')}
                  </p>
                )}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
