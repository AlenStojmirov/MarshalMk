'use client';

/**
 * The wheel with everything around it (Task 13.10): who may spin and when,
 * the spin, the prize, and the chances in plain view. Used on /wheel, open
 * to everyone, and in the customer's dashboard.
 *
 * A guest sees the wheel and "sign up to spin" — collecting accounts is what
 * the wheel is for. The prize is decided and given by the server before the
 * wheel moves; the animation only shows it.
 */

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, Copy, PartyPopper, ShoppingBag } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { POLICIES } from '@/config/policies';
import { accountFetch } from '@/lib/account-client';
import { useTranslation } from '@/lib/i18n';
import type { SpinResult, WheelState } from '@/lib/wheel';
import WheelOfFortune, { turnTo } from './WheelOfFortune';

export default function WheelPanel() {
  const { t, number, price, date } = useTranslation();
  /** "1 day" / "7 days": the key's One or Other form; Macedonian has the one form here. */
  const counted = (key: string, n: number, params: Record<string, string | number> = {}) =>
    t(`${key}${n === 1 ? 'One' : 'Other'}`, { ...params, n: number(n) });
  const { user } = useAuth();
  const userId = user?.id;
  const router = useRouter();
  const { items, setCouponCode } = useCart();
  const [state, setState] = useState<WheelState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reads, setReads] = useState(0);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<SpinResult | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reduced] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

  useEffect(() => {
    let live = true;
    accountFetch<WheelState>('/api/wheel').then((r) => {
      if (!live) return;
      if (r.error) setError(r.error);
      else setState(r.data!);
    });
    return () => { live = false; };
  }, [userId, reads]);

  const stopped = () => {
    setSpinning(false);
    setShown(true);
    setReads((n) => n + 1);
  };

  const spin = async () => {
    setSpinning(true);
    setError(null);
    setShown(false);
    setCopied(false);
    const r = await accountFetch<SpinResult>('/api/wheel/spin', { method: 'POST', body: '{}' });
    if (r.error || !r.data) {
      setSpinning(false);
      setError(r.error ?? t('wheel.spinFailed'));
      setReads((n) => n + 1);
      return;
    }
    const won = r.data;
    setResult(won);
    setRotation((from) => turnTo(from, won.index, won.prizes.length, reduced));
    if (reduced) setTimeout(stopped, 300);
  };

  if (!state) {
    return error
      ? <p className="text-sm text-red-600">{error}</p>
      : <div className="py-16 flex justify-center"><div className="animate-spin h-8 w-8 border-4 border-stone-900 border-t-transparent rounded-full" /></div>;
  }
  if (!state.enabled) return <p className="text-sm text-stone-600">{t('wheel.inactive')}</p>;

  const drawn = result?.prizes ?? state.prizes;
  const apply = (code: string) => {
    setCouponCode(code);
    if (items.length > 0) router.push('/checkout');
    else router.push('/');
  };

  return (
    <div>
      <WheelOfFortune prizes={drawn} rotation={rotation} animate={!reduced} onStopped={stopped} />

      <div className="mt-6 space-y-3">
        {result && shown && (
          <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-center" role="status" aria-live="polite">
            <PartyPopper className="h-6 w-6 mx-auto text-amber-700" />
            <p className="mt-1 text-lg font-bold text-stone-900">{t('wheel.won', { prize: result.label })}</p>
            {result.couponCode ? (
              <>
                <p className="mt-2 font-mono text-xl font-bold tracking-wider text-stone-900">{result.couponCode}</p>
                <p className="text-xs text-stone-600 mt-1">
                  {state.couponMinBasket > 0
                    ? t('wheel.couponTermsMinBasket', { hours: counted('wheel.hours', state.couponHours), amount: price(state.couponMinBasket) })
                    : t('wheel.couponTerms', { hours: counted('wheel.hours', state.couponHours) })}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={async () => { try { await navigator.clipboard.writeText(result.couponCode!); setCopied(true); } catch { /* the code is on screen */ } }}
                    className="flex-1 rounded-lg border border-stone-300 bg-white py-2.5 text-sm font-medium inline-flex items-center justify-center gap-1.5"
                  >
                    {copied ? <><Check className="h-4 w-4 text-green-700" /> {t('common.copied')}</> : <><Copy className="h-4 w-4" /> {t('common.copy')}</>}
                  </button>
                  <button type="button" onClick={() => apply(result.couponCode!)} className="flex-1 rounded-lg bg-stone-900 text-white py-2.5 text-sm font-semibold inline-flex items-center justify-center gap-1.5">
                    <ShoppingBag className="h-4 w-4" /> {t('wheel.toCart')}
                  </button>
                </div>
              </>
            ) : (
              <p className="mt-1 text-sm text-stone-700">
                {counted('wheel.pointsWon', result.value, { days: counted('wheel.days', state.pointsDays) })}{' '}
                <Link href="/account?tab=points" className="underline underline-offset-2">{t('wheel.myPoints')}</Link>
              </p>
            )}
          </div>
        )}

        {!state.signedIn ? (
          <div className="rounded-2xl bg-white border border-stone-200 p-4 text-center">
            <p className="font-semibold text-stone-900">{t('wheel.signUpToSpin')}</p>
            <p className="text-sm text-stone-600 mt-1">{t('wheel.signUpPitch')}</p>
            <div className="mt-3 flex gap-2">
              <Link href="/account/register?from=wheel" className="flex-1 rounded-lg bg-stone-900 text-white py-2.5 text-sm font-semibold">{t('wheel.signUp')}</Link>
              <Link href="/account" className="flex-1 rounded-lg border border-stone-300 py-2.5 text-sm">{t('wheel.signIn')}</Link>
            </div>
          </div>
        ) : !state.member ? (
          <p className="rounded-2xl bg-white border border-stone-200 p-4 text-sm text-stone-700 text-center">
            {t('wheel.finishProfile')} <Link href="/account" className="underline underline-offset-2">{t('wheel.toAccount')}</Link>
          </p>
        ) : (
          <div className="text-center">
            <button
              type="button"
              onClick={spin}
              disabled={!state.canSpin || spinning}
              className="w-full rounded-xl bg-amber-600 hover:bg-amber-700 text-white py-3.5 text-base font-bold disabled:bg-stone-300 disabled:text-stone-600"
            >
              {spinning ? t('wheel.spinning') : state.canSpin ? t('wheel.spin') : t('wheel.alreadySpun')}
            </button>
            <p className="text-sm text-stone-600 mt-2">
              {state.canSpin
                ? state.bonusLeft > 0 ? counted('wheel.bonusSpins', state.bonusLeft) : t('wheel.everySpinWins')
                : state.nextAt ? t('wheel.nextSpin', { date: date(state.nextAt) }) : ''}
            </p>
            <p className="text-xs text-stone-500 mt-1">
              {t('wheel.spinEvery', { days: counted('wheel.days', state.intervalDays) })}
            </p>
          </div>
        )}
        {error && <p className="text-sm text-red-600 text-center">{error}</p>}

        <details className="rounded-xl bg-white border border-stone-200 p-4 text-sm">
          <summary className="font-semibold text-stone-900 cursor-pointer">{t('wheel.chances')}</summary>
          <ul className="mt-2 divide-y divide-stone-100">
            {state.prizes.map((p) => (
              <li key={p.id} className="py-1.5 flex justify-between">
                <span>{p.label}</span>
                <span className="tabular-nums text-stone-600">{number(p.chance, 1)}%</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-stone-500 mt-2">
            {t('wheel.limitNote')}{' '}
            <Link href={`${POLICIES.rules.path}#wheel`} className="underline underline-offset-2">{t('wheel.rules')}</Link>
          </p>
        </details>
      </div>
    </div>
  );
}
