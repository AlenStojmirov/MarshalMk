'use client';

/**
 * Coupons and points at checkout (Task 13.7). Every number in it comes from
 * the server's quote; this only asks.
 *
 * A member applies a coupon, picks how many points to use on a slider and
 * sees what the order earns. A guest is told what an account would have
 * earned on this very basket — the cheapest invitation to sign up there is.
 */

import { useState } from 'react';
import Link from 'next/link';
import { Gift, Tag, X } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import type { PublicBasketQuote } from '@/lib/loyalty';

/** What /api/cart/quote answers. */
export interface QuoteResponse {
  quote: PublicBasketQuote;
  unavailable: string[];
  member: boolean;
  signedIn: boolean;
  coupon: { code: string; applied: boolean; message?: string; description?: string } | null;
  points: { balance: number; maxUsable: number; used: number; message: string | null };
  earn: number;
}

/** The slider's one-time hint (13.13): a per-device nicety, so the browser is enough. */
const HINT_KEY = 'marshal-hint-points-slider';
function hintPending(): boolean {
  try {
    return typeof window !== 'undefined' && !window.localStorage.getItem(HINT_KEY);
  } catch {
    return false;
  }
}

export default function LoyaltyBox({
  data, couponCode, onCoupon, pointsWanted, onPoints,
}: {
  data: QuoteResponse | null;
  couponCode: string;
  onCoupon: (code: string) => void;
  pointsWanted: number;
  onPoints: (points: number) => void;
}) {
  const { t, number: n, price } = useTranslation();
  const [typed, setTyped] = useState('');
  // The points field while it is being typed in; null shows the chosen number.
  const [pointsDraft, setPointsDraft] = useState<string | null>(null);
  const [hint, setHint] = useState(hintPending);
  const dismissHint = () => {
    setHint(false);
    try { window.localStorage.setItem(HINT_KEY, '1'); } catch { /* the hint shows again next time */ }
  };

  if (!data) return null;

  if (!data.member) {
    return (
      <div className="mb-5 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm">
        <p className="flex items-center gap-2 font-medium text-gray-900"><Gift className="h-4 w-4" /> {t('loyalty.title')}</p>
        {data.earn > 0 && <p className="mt-1 text-gray-700">{t('loyalty.guestEarn', { points: n(data.earn) })}</p>}
        {data.signedIn ? (
          <p className="mt-1 text-gray-600">
            {t('loyalty.finishProfile')}{' '}
            <Link href="/account" className="underline underline-offset-2">{t('loyalty.toAccount')}</Link>
          </p>
        ) : (
          <p className="mt-1 text-gray-600">
            {t('loyalty.forMembers')}{' '}
            <Link href="/account" className="underline underline-offset-2">{t('loyalty.signIn')}</Link>
            {' · '}
            <Link href="/account/register" className="underline underline-offset-2">{t('loyalty.register')}</Link>
          </p>
        )}
      </div>
    );
  }

  const coupon = data.coupon;
  const { balance, maxUsable, message } = data.points;
  const sliderMax = Math.max(0, maxUsable);

  // A slider rarely lands on an exact number (13.15), so the number can be typed.
  // Out of range it becomes the nearest allowed value; empty is 0. The server
  // checks the limits again (quoteServer), so this is only a convenience.
  const typePoints = (raw: string) => {
    const digits = raw.replace(/\D/g, '');
    const value = digits === '' ? 0 : Math.min(Number(digits), sliderMax);
    setPointsDraft(digits === '' ? '' : String(value));
    onPoints(value);
    if (hint) dismissHint();
  };

  return (
    <div className="mb-5 rounded-lg border border-gray-200 px-4 py-3 text-sm space-y-3">
      <p className="flex items-center gap-2 font-medium text-gray-900"><Gift className="h-4 w-4" /> {t('loyalty.title')}</p>

      {/* Coupon */}
      {couponCode ? (
        <div>
          <div className={`flex items-center gap-2 rounded-md px-2.5 py-1.5 ${coupon?.applied ? 'bg-emerald-50 text-emerald-800' : 'bg-red-50 text-red-700'}`}>
            <Tag className="h-3.5 w-3.5 shrink-0" />
            <span className="font-mono font-semibold">{couponCode}</span>
            {coupon?.applied && coupon.description && <span className="text-xs truncate">{coupon.description}</span>}
            <button type="button" onClick={() => onCoupon('')} className="ml-auto p-0.5" aria-label={t('loyalty.remove')}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {coupon && !coupon.applied && coupon.message && <p className="mt-1 text-xs text-red-600">{coupon.message}</p>}
        </div>
      ) : (
        <div className="flex gap-2">
          <input
            value={typed}
            onChange={(e) => setTyped(e.target.value.toUpperCase())}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (typed.trim()) onCoupon(typed.trim()); } }}
            placeholder={t('loyalty.couponPlaceholder')}
            aria-label={t('loyalty.couponLabel')}
            autoCapitalize="characters"
            className="flex-1 min-w-0 rounded-md border border-gray-300 px-3 py-2 text-base sm:text-sm font-mono"
          />
          <button
            type="button"
            onClick={() => typed.trim() && onCoupon(typed.trim())}
            className="px-3 py-2 rounded-md bg-gray-900 text-white text-sm font-medium hover:bg-black"
          >
            {t('loyalty.apply')}
          </button>
        </div>
      )}

      {/* Points */}
      {balance > 0 && (
        <div>
          {sliderMax > 0 ? (
            <>
              <p className="text-gray-700">{t('loyalty.youHave', { points: n(balance), max: price(sliderMax) })}</p>
              {hint && (
                <div className="mt-2 rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-900 flex items-start gap-2" role="note">
                  <span className="flex-1">{t('loyalty.sliderHint')}</span>
                  <button type="button" onClick={dismissHint} className="font-semibold underline underline-offset-2">{t('loyalty.gotIt')}</button>
                </div>
              )}
              <input
                type="range"
                min={0}
                max={sliderMax}
                step={1}
                value={Math.min(pointsWanted, sliderMax)}
                onChange={(e) => { setPointsDraft(null); onPoints(Number(e.target.value)); if (hint) dismissHint(); }}
                className="w-full mt-2 accent-gray-900"
                aria-label={t('loyalty.pointsLine')}
              />
              <div className="flex items-center justify-between gap-2 text-xs text-gray-500">
                <span>0</span>
                <label className="flex items-center gap-1.5 text-gray-700">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={pointsDraft ?? String(Math.min(pointsWanted, sliderMax))}
                    onChange={(e) => typePoints(e.target.value)}
                    onFocus={(e) => e.target.select()}
                    onBlur={() => setPointsDraft(null)}
                    aria-label={t('loyalty.pointsInput')}
                    className="w-20 rounded-md border border-gray-300 px-2 py-1 text-center text-base sm:text-sm font-medium text-gray-900 tabular-nums"
                  />
                  {t('loyalty.pointsUnit')}
                </label>
                <span>{n(sliderMax)}</span>
              </div>
            </>
          ) : (
            message && <p className="text-xs text-gray-600">{message}</p>
          )}
        </div>
      )}

      {data.earn > 0 && <p className="text-emerald-700">{t('loyalty.willEarn', { points: n(data.earn) })}</p>}
    </div>
  );
}
