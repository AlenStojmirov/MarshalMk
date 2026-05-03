'use client';

import { Truck, PartyPopper } from 'lucide-react';
import { SHIPPING_CONFIG } from '@/config/shipping';
import { useTranslation } from '@/lib/i18n';

interface FreeShippingProgressProps {
  subtotal: number;
  /** Visual size variant. `compact` is used in the mini cart. */
  variant?: 'compact' | 'default';
  className?: string;
}

export default function FreeShippingProgress({
  subtotal,
  variant = 'default',
  className = '',
}: FreeShippingProgressProps) {
  const { t } = useTranslation();
  const threshold = SHIPPING_CONFIG.freeShippingThreshold;
  const remaining = Math.max(0, threshold - subtotal);
  const unlocked = remaining === 0;
  const progress = Math.min(100, Math.max(0, (subtotal / threshold) * 100));

  const compact = variant === 'compact';

  return (
    <div
      className={`rounded-lg border ${
        unlocked
          ? 'bg-emerald-50 border-emerald-200'
          : 'bg-gray-50 border-gray-200'
      } ${compact ? 'px-3 py-2.5' : 'px-4 py-3'} ${className}`}
      role="status"
      aria-live="polite"
    >
      <div
        className={`flex items-center gap-2 ${
          compact ? 'text-[12px]' : 'text-sm'
        } font-medium ${unlocked ? 'text-emerald-700' : 'text-gray-700'}`}
      >
        {unlocked ? (
          <PartyPopper className={compact ? 'h-4 w-4 shrink-0' : 'h-4 w-4 shrink-0'} />
        ) : (
          <Truck className={compact ? 'h-4 w-4 shrink-0' : 'h-4 w-4 shrink-0'} />
        )}
        <span className="leading-snug">
          {unlocked ? (
            t('cart.freeShippingUnlocked')
          ) : (
            <>
              {t('cart.freeShippingRemaining', {
                amount: remaining.toFixed(0),
              })}
            </>
          )}
        </span>
      </div>

      <div
        className={`relative ${
          compact ? 'mt-2 h-1.5' : 'mt-2.5 h-2'
        } w-full bg-gray-200 rounded-full overflow-hidden`}
      >
        <div
          className={`h-full rounded-full transition-all duration-500 ease-out ${
            unlocked
              ? 'bg-gradient-to-r from-emerald-400 to-emerald-600'
              : 'bg-gradient-to-r from-gray-700 to-gray-900'
          }`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}
