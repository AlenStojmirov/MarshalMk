'use client';

/**
 * The wheel with everything around it (Task 13.10): who may spin and when,
 * the spin, the prize, and the chances in plain view. Used on /trkalo, open
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
import { mkDate, mkDen, mkNumber } from '@/lib/mk-format';
import type { SpinResult, WheelState } from '@/lib/wheel';
import WheelOfFortune, { turnTo } from './WheelOfFortune';

export default function WheelPanel() {
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
      setError(r.error ?? 'Вртењето не успеа.');
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
  if (!state.enabled) return <p className="text-sm text-stone-600">Тркалото моментално не е активно.</p>;

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
            <p className="mt-1 text-lg font-bold text-stone-900">Освои: {result.label}</p>
            {result.couponCode ? (
              <>
                <p className="mt-2 font-mono text-xl font-bold tracking-wider text-stone-900">{result.couponCode}</p>
                <p className="text-xs text-stone-600 mt-1">
                  Важи {mkNumber(state.couponHours)} часа{state.couponMinBasket > 0 ? `, за кошничка од ${mkDen(state.couponMinBasket)}` : ''}. Не се комбинира со друг купон.
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={async () => { try { await navigator.clipboard.writeText(result.couponCode!); setCopied(true); } catch { /* the code is on screen */ } }}
                    className="flex-1 rounded-lg border border-stone-300 bg-white py-2.5 text-sm font-medium inline-flex items-center justify-center gap-1.5"
                  >
                    {copied ? <><Check className="h-4 w-4 text-green-700" /> Копирано</> : <><Copy className="h-4 w-4" /> Копирај</>}
                  </button>
                  <button type="button" onClick={() => apply(result.couponCode!)} className="flex-1 rounded-lg bg-stone-900 text-white py-2.5 text-sm font-semibold inline-flex items-center justify-center gap-1.5">
                    <ShoppingBag className="h-4 w-4" /> Во кошничка
                  </button>
                </div>
              </>
            ) : (
              <p className="mt-1 text-sm text-stone-700">
                +{mkNumber(result.value)} поени, важат {mkNumber(state.pointsDays)} дена.{' '}
                <Link href="/smetka?tab=poeni" className="underline underline-offset-2">Мои поени</Link>
              </p>
            )}
          </div>
        )}

        {!state.signedIn ? (
          <div className="rounded-2xl bg-white border border-stone-200 p-4 text-center">
            <p className="font-semibold text-stone-900">Регистрирај се за да завртиш</p>
            <p className="text-sm text-stone-600 mt-1">Секое вртење добива награда, а со профилот собираш и поени со секоја нарачка.</p>
            <div className="mt-3 flex gap-2">
              <Link href="/smetka/registracija?od=trkalo" className="flex-1 rounded-lg bg-stone-900 text-white py-2.5 text-sm font-semibold">Регистрирај се</Link>
              <Link href="/smetka" className="flex-1 rounded-lg border border-stone-300 py-2.5 text-sm">Најави се</Link>
            </div>
          </div>
        ) : !state.member ? (
          <p className="rounded-2xl bg-white border border-stone-200 p-4 text-sm text-stone-700 text-center">
            Потврди ја е-поштата и доврши го профилот за да вртиш. <Link href="/smetka" className="underline underline-offset-2">Кон профилот</Link>
          </p>
        ) : (
          <div className="text-center">
            <button
              type="button"
              onClick={spin}
              disabled={!state.canSpin || spinning}
              className="w-full rounded-xl bg-amber-600 hover:bg-amber-700 text-white py-3.5 text-base font-bold disabled:bg-stone-300 disabled:text-stone-600"
            >
              {spinning ? 'Се врти…' : state.canSpin ? 'Заврти' : 'Веќе заврте'}
            </button>
            <p className="text-sm text-stone-600 mt-2">
              {state.canSpin
                ? state.bonusLeft > 0 ? `Имаш ${mkNumber(state.bonusLeft)} бонус ${state.bonusLeft === 1 ? 'вртење' : 'вртења'} од нарачките.` : 'Секое вртење добива награда.'
                : state.nextAt ? `Следно вртење на ${mkDate(state.nextAt)}.` : ''}
            </p>
            <p className="text-xs text-stone-500 mt-1">
              Едно вртење на секои {mkNumber(state.intervalDays)} дена, и бонус вртење за секоја испорачана нарачка.
            </p>
          </div>
        )}
        {error && <p className="text-sm text-red-600 text-center">{error}</p>}

        <details className="rounded-xl bg-white border border-stone-200 p-4 text-sm">
          <summary className="font-semibold text-stone-900 cursor-pointer">Шанси за наградите</summary>
          <ul className="mt-2 divide-y divide-stone-100">
            {state.prizes.map((p) => (
              <li key={p.id} className="py-1.5 flex justify-between">
                <span>{p.label}</span>
                <span className="tabular-nums text-stone-600">{mkNumber(p.chance, 1)}%</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-stone-500 mt-2">
            Награда што го достигнала дневниот или месечниот лимит привремено не е на тркалото, а шансите на другите растат.{' '}
            <Link href={`${POLICIES.rules.path}#trkalo`} className="underline underline-offset-2">Правила</Link>
          </p>
        </details>
      </div>
    </div>
  );
}
