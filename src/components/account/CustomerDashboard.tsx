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
import { Check, ChevronDown, Clock, Copy, Gift, Package, ShoppingBag, Tag } from 'lucide-react';
import mk from '@/lib/i18n/translations/mk.json';
import { supabase } from '@/lib/supabase';
import { useCart } from '@/context/CartContext';
import { POLICIES } from '@/config/policies';
import type { AccountView, CustomerOrder, ProgrammeRules } from '@/lib/account';
import { accountFetch, resendConfirmation } from '@/lib/account-client';
import { HISTORY_LABEL, HistoryEntry, PointsMovement, PointsSummary, fetchPointsMovements, pointsHistory, summarizePoints } from '@/lib/points';
import { Coupon, CouponRow, Redemption, describeCoupon, fetchRedemptions, rowToCoupon } from '@/lib/coupons';
import { CustomerCoupon, sortCustomerCoupons } from '@/lib/customer-coupons';
import { mkDate, mkNumber } from '@/lib/mk-format';
import { Notice } from './AccountFrame';
import ProfileForm from './ProfileForm';

export const DASHBOARD_TABS = [
  { key: 'pochetna', label: 'Почетна' },
  { key: 'kuponi', label: 'Купони' },
  { key: 'poeni', label: 'Поени' },
  { key: 'naracki', label: 'Нарачки' },
  { key: 'profil', label: 'Профил' },
] as const;
export type DashboardTab = (typeof DASHBOARD_TABS)[number]['key'];

const n = (v: number) => mkNumber(v, 1);
const day = mkDate;
const CATEGORY_NAMES = (mk as { categoryNames: Record<string, string> }).categoryNames;

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
  view, userId, tab, onTab, confirmedNow, onSaved, onSignOut,
}: {
  view: AccountView;
  userId: string;
  tab: DashboardTab;
  onTab: (t: DashboardTab) => void;
  confirmedNow: boolean;
  onSaved: (v: AccountView) => void;
  onSignOut: () => void;
}) {
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

  const summary = useMemo(() => summarizePoints(data?.moves ?? [], now, 30), [data, now]);
  const history = useMemo(() => pointsHistory(data?.moves ?? [], now), [data, now]);
  const coupons = useMemo(() => sortCustomerCoupons(data?.coupons ?? [], data?.uses ?? [], now), [data, now]);
  const profile = view.profile!;

  return (
    <main className="bg-stone-50 min-h-[70vh]">
      <div className="max-w-lg mx-auto px-4 py-6 sm:py-10">
        <h1 className="text-2xl font-bold text-stone-900">Здраво, {profile.firstName}</h1>
        <p className="text-sm text-stone-600">{view.email}</p>

        <div className="space-y-3 mt-4">
          {confirmedNow && view.emailConfirmed && <Notice tone="green">Е-поштата е потврдена. Добредојде!</Notice>}
          {!view.emailConfirmed && (
            <Notice tone="amber">
              Потврди ја е-поштата: кликни на линкот што ти го пративме. Дотогаш нема поени ни купони.
              <button
                type="button"
                onClick={async () => setResent((await resendConfirmation(view.email)) ?? 'Линкот е пратен повторно.')}
                className="block mt-1 font-medium underline underline-offset-2"
              >
                Прати го линкот повторно
              </button>
              {resent && <span className="block mt-1">{resent}</span>}
            </Notice>
          )}
        </div>

        <nav className="mt-5 -mx-4 px-4 flex gap-1 overflow-x-auto border-b border-stone-200" data-tour="tabs">
          {DASHBOARD_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => onTab(t.key)}
              data-tour={t.key === 'naracki' ? 'orders' : undefined}
              className={`shrink-0 px-3 py-2.5 text-sm font-medium -mb-px border-b-2 ${tab === t.key ? 'border-stone-900 text-stone-900' : 'border-transparent text-stone-500'}`}
            >
              {t.label}
            </button>
          ))}
        </nav>

        <div className="mt-5">
          {tab !== 'profil' && !data ? (
            <div className="py-16 flex justify-center">
              <div className="animate-spin h-8 w-8 border-4 border-stone-900 border-t-transparent rounded-full" />
            </div>
          ) : tab === 'pochetna' ? (
            <Home summary={summary} coupons={coupons} rules={view.rules} onTab={onTab} />
          ) : tab === 'kuponi' ? (
            <CouponsPanel coupons={coupons} />
          ) : tab === 'poeni' ? (
            <PointsPanel summary={summary} history={history} rules={view.rules} />
          ) : tab === 'naracki' ? (
            <OrdersPanel orders={data!.orders} error={data!.ordersError} />
          ) : (
            <section className="bg-white rounded-xl border border-stone-200 p-4">
              <h2 className="font-semibold text-stone-900 mb-3">Мои податоци</h2>
              <ProfileForm initial={profile} requireConsent={false} onSaved={onSaved} />
              <nav className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm">
                {Object.values(POLICIES).filter((p) => p.live).map((p) => (
                  <Link key={p.path} href={p.path} className="text-stone-600 underline underline-offset-2">{p.title}</Link>
                ))}
              </nav>
              <button type="button" onClick={onSignOut} className="mt-6 w-full rounded-lg border border-stone-300 py-2.5 text-sm text-stone-700 hover:bg-stone-50">
                Одјави се
              </button>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}

// ---------------------------------------------------------------------------
// Home
// ---------------------------------------------------------------------------

function Home({
  summary, coupons, rules, onTab,
}: { summary: PointsSummary; coupons: ReturnType<typeof sortCustomerCoupons>; rules: ProgrammeRules; onTab: (t: DashboardTab) => void }) {
  const usable = coupons.soon.length + coupons.active.filter((c) => c.state === 'active').length;
  return (
    <div className="space-y-4">
      <section className="rounded-2xl bg-stone-900 text-white p-5" data-tour="points">
        <p className="text-sm text-stone-300">Активни поени</p>
        <p className="text-4xl font-bold tabular-nums mt-1">{n(summary.active)}</p>
        <p className="text-sm text-stone-300 mt-1">= {n(summary.active)} ден. попуст на следната нарачка</p>
        <div className="mt-4 pt-4 border-t border-white/15 flex items-start gap-2 text-sm" data-tour="pending">
          <Clock className="h-4 w-4 mt-0.5 shrink-0 text-stone-400" />
          <p>
            <span className="font-semibold">{n(summary.pending)}</span> на чекање
            <span className="block text-xs text-stone-400">
              Стануваат активни {rules.pendingDays} дена откако нарачката е испорачана и платена.
            </span>
          </p>
        </div>
        {summary.expiringSoon > 0 && summary.nextExpiry && (
          <p className="mt-3 text-xs bg-amber-400/15 text-amber-200 rounded-lg px-3 py-2">
            {n(summary.nextExpiryPoints)} поени истекуваат на {day(summary.nextExpiry)}. Искористи ги пред тоа.
          </p>
        )}
      </section>

      <button
        type="button"
        onClick={() => onTab('kuponi')}
        data-tour="coupons"
        className="w-full text-left rounded-2xl bg-white border border-stone-200 p-4 flex items-center gap-3"
      >
        <Tag className="h-5 w-5 text-stone-700 shrink-0" />
        <span className="flex-1">
          <span className="block font-semibold text-stone-900">{usable === 1 ? '1 активен купон' : `${n(usable)} активни купони`}</span>
          {coupons.soon.length > 0 ? (
            <span className="block text-sm text-amber-700">{coupons.soon.length === 1 ? '1 истекува наскоро' : `${coupons.soon.length} истекуваат наскоро`}</span>
          ) : (
            <span className="block text-sm text-stone-500">Копирај го кодот или примени го во кошничка</span>
          )}
        </span>
        <span className="text-stone-400">›</span>
      </button>

      <section className="rounded-2xl bg-white border border-stone-200 p-4" data-tour="how">
        <h2 className="font-semibold text-stone-900 flex items-center gap-2"><Gift className="h-4 w-4" /> Како функционираат поените</h2>
        <ul className="mt-2 space-y-1.5 text-sm text-stone-700 list-disc pl-5">
          <li>За секоја нарачка добиваш <strong>{n(rules.earnRatePct)}%</strong> од тоа што го плаќаш, во поени. 1 поен = 1 денар.</li>
          <li>Производите на попуст до {n(rules.discountBandPct)}% носат {n(rules.reducedRatePct)}%, а над тоа не носат поени.</li>
          <li>Поените се активни {n(rules.pendingDays)} дена по испораката и важат {n(rules.expiryMonths)} месеци.</li>
          <li>Трошиш од {n(rules.minPointsToRedeem)} поени, на нарачка од {n(rules.minOrderForRedeem)} ден., до {n(rules.maxRedeemBasketPct)}% од кошничката.</li>
        </ul>
        <Link href={POLICIES.rules.path} className="inline-block mt-2 text-sm text-stone-600 underline underline-offset-2">Сите правила</Link>
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Coupons
// ---------------------------------------------------------------------------

function scopeText(c: Coupon): string {
  const parts: string[] = [];
  if (c.includeCategories.length) parts.push('само ' + c.includeCategories.map((k) => CATEGORY_NAMES[k] ?? k).join(', '));
  if (c.includeProducts.length) parts.push('само за одредени производи');
  if (c.excludeCategories.length) parts.push('без ' + c.excludeCategories.map((k) => CATEGORY_NAMES[k] ?? k).join(', '));
  return parts.join(' · ');
}

function CouponsPanel({ coupons }: { coupons: ReturnType<typeof sortCustomerCoupons> }) {
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
          <button type="button" onClick={() => copy(c.code)} className="ml-auto inline-flex items-center gap-1 text-xs text-stone-600" aria-label={`Копирај го ${c.code}`}>
            {copied === c.code ? <><Check className="h-3.5 w-3.5 text-green-700" /> копирано</> : <><Copy className="h-3.5 w-3.5" /> Копирај</>}
          </button>
        )}
      </div>
      {c.coupon && <p className="text-sm text-stone-800 mt-1">{describeCoupon(c.coupon, scopeText(c.coupon))}</p>}
      <p className={`text-xs mt-1 ${c.state === 'soon' ? 'text-amber-800 font-medium' : 'text-stone-500'}`}>
        {c.state === 'soon' && (c.daysLeft !== undefined && c.daysLeft <= 1 ? 'Истекува денес' : `Истекува за ${c.daysLeft} дена`)}
        {c.state === 'active' && (c.coupon?.endsAt ? `Важи до ${day(c.coupon.endsAt)}` : 'Без рок')}
        {c.state === 'upcoming' && `Важи од ${day(c.coupon?.startsAt)}`}
        {c.state === 'used' && `Искористен${c.usedOn?.orderNumber ? ` на нарачка ${c.usedOn.orderNumber}` : ''}, ${day(c.usedOn?.at)}`}
        {c.state === 'expired' && `Истечен на ${day(c.coupon?.endsAt)}`}
        {c.state === 'off' && 'Повеќе не важи'}
      </p>
      {usable && c.state !== 'upcoming' && (
        <button type="button" onClick={() => apply(c.code)} className="mt-3 w-full rounded-lg bg-stone-900 text-white py-2.5 text-sm font-semibold inline-flex items-center justify-center gap-2">
          <ShoppingBag className="h-4 w-4" /> Примени во кошничка
        </button>
      )}
    </li>
  );

  const none = coupons.soon.length + coupons.active.length === 0;
  return (
    <div className="space-y-5">
      {saved && (
        <Notice tone="green">
          Купонот <strong>{saved}</strong> е зачуван во кошничката и ќе се пресмета кога ќе нарачаш.{' '}
          <Link href="/" className="underline underline-offset-2">Кон продавницата</Link>
        </Notice>
      )}
      {coupons.soon.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-amber-800 mb-2">Истекуваат наскоро</h2>
          <ul className="space-y-3">{coupons.soon.map((c) => card(c, true))}</ul>
        </section>
      )}
      <section>
        <h2 className="text-sm font-semibold text-stone-900 mb-2">Активни</h2>
        {coupons.active.length > 0 ? (
          <ul className="space-y-3">{coupons.active.map((c) => card(c, true))}</ul>
        ) : (
          <p className="text-sm text-stone-500">{none ? 'Моментално немаш купони. Ќе ти пишеме кога ќе добиеш.' : 'Нема други.'}</p>
        )}
      </section>
      {coupons.history.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold text-stone-500 mb-2">Искористени и истечени</h2>
          <ul className="space-y-3">{coupons.history.map((c) => card(c, false))}</ul>
        </section>
      )}
      <p className="text-xs text-stone-500">На една нарачка важи еден купон.</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Points
// ---------------------------------------------------------------------------

function stateText(e: HistoryEntry): string {
  switch (e.state) {
    case 'awaiting': return 'чека испорака';
    case 'waiting': return `активни од ${day(e.availableAt)}`;
    case 'active': return `важат до ${day(e.expiresAt)}`;
    case 'expired': return 'истечени';
    case 'used': return 'искористени';
    default: return '';
  }
}

function PointsPanel({ summary, history, rules }: { summary: PointsSummary; history: HistoryEntry[]; rules: ProgrammeRules }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl bg-white border border-stone-200 p-3">
          <p className="text-xs text-stone-500">Активни</p>
          <p className="text-2xl font-bold tabular-nums text-stone-900">{n(summary.active)}</p>
        </div>
        <div className="rounded-xl bg-white border border-stone-200 p-3">
          <p className="text-xs text-stone-500">На чекање</p>
          <p className="text-2xl font-bold tabular-nums text-stone-900">{n(summary.pending)}</p>
        </div>
      </div>
      {summary.expiringSoon > 0 && summary.nextExpiry && (
        <Notice tone="amber">{n(summary.nextExpiryPoints)} поени истекуваат на {day(summary.nextExpiry)}.</Notice>
      )}
      <section className="rounded-xl bg-white border border-stone-200">
        <h2 className="font-semibold text-stone-900 px-4 pt-4 pb-2">Историја</h2>
        {history.length === 0 ? (
          <p className="px-4 pb-4 text-sm text-stone-500">
            Уште немаш поени. Со секоја нарачка добиваш {n(rules.earnRatePct)}% од платеното.
          </p>
        ) : (
          <ul className="divide-y divide-stone-100">
            {history.map((e) => (
              <li key={e.key} className="px-4 py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-stone-900">
                    {HISTORY_LABEL[e.kind]}
                    {e.reversed && <span className="text-xs font-normal text-stone-500"> · вратени</span>}
                  </p>
                  <p className="text-xs text-stone-500">
                    {day(e.at)}
                    {e.orderNumber && ` · ${e.orderNumber}`}
                    {stateText(e) && ` · ${stateText(e)}`}
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

const STATUS_LABEL: Record<string, string> = {
  pending: 'Примена', confirmed: 'Потврдена', processing: 'Се подготвува', shipped: 'Испратена', delivered: 'Испорачана', cancelled: 'Откажана',
};
const OUTCOME_LABEL: Record<string, string> = { refused: 'Одбиена', returned: 'Вратена', not_collected: 'Неподигната' };

function OrdersPanel({ orders, error }: { orders: CustomerOrder[]; error?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  if (error) return <Notice tone="red">{error}</Notice>;
  if (orders.length === 0) {
    return (
      <div className="text-center py-10">
        <Package className="h-8 w-8 mx-auto text-stone-400" />
        <p className="text-sm text-stone-600 mt-2">Уште немаш нарачки со овој профил.</p>
        <Link href="/" className="inline-block mt-3 text-sm underline underline-offset-2">Кон продавницата</Link>
      </div>
    );
  }
  return (
    <ul className="space-y-3">
      {orders.map((o) => {
        const label = (o.outcome && OUTCOME_LABEL[o.outcome]) || STATUS_LABEL[o.status] || o.status;
        const done = o.status === 'delivered';
        const off = o.status === 'cancelled';
        const isOpen = open === o.orderNumber;
        return (
          <li key={o.orderNumber} className="rounded-xl bg-white border border-stone-200">
            <button type="button" onClick={() => setOpen(isOpen ? null : o.orderNumber)} className="w-full text-left p-4 flex items-center gap-3">
              <span className="flex-1 min-w-0">
                <span className="block font-mono text-sm font-semibold text-stone-900 truncate">{o.orderNumber}</span>
                <span className="block text-xs text-stone-500">{day(o.createdAt)} · {o.items.reduce((a, i) => a + i.quantity, 0)} парч. · {n(o.total)} ден.</span>
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
                  {o.deliveryMethod === 'pickup' ? 'Подигање во продавница' : 'Достава по курир'} · вкупно {n(o.total)} ден.
                </p>
                {o.loyalty && (
                  <p className="mt-1 text-xs text-stone-600">
                    {[
                      o.loyalty.couponCode && `купон ${o.loyalty.couponCode}`,
                      o.loyalty.pointsUsed && `платено со ${n(o.loyalty.pointsUsed)} поени`,
                      o.loyalty.pointsEarned && !off && `${n(o.loyalty.pointsEarned)} поени за оваа нарачка`,
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
