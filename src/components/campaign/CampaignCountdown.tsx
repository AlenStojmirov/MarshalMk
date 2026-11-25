'use client';

import { timeLeft } from '@/lib/campaign';
import { useTranslation } from '@/lib/i18n';

const two = (n: number) => String(n).padStart(2, '0');

/**
 * The time left to `to` (D-051). Until the clock has started — on the server
 * and in the first render — the digits are dashes of the same width, so the
 * page hydrates as it was sent and nothing moves when they fill in.
 */
export function CountdownInline({ to, now, className = '' }: { to: string; now: number | null; className?: string }) {
  const { t } = useTranslation();
  if (now === null) return <span className={`tabular-nums ${className}`}>--:--:--</span>;
  const l = timeLeft(to, now);
  return (
    <span className={`tabular-nums ${className}`}>
      {l.days > 0 && <>{t('campaign.countdownDays', { d: l.days })} </>}
      {two(l.hours)}:{two(l.minutes)}:{two(l.seconds)}
    </span>
  );
}

/** Four boxes — days, hours, minutes, seconds — for the hero and the greeting. */
export function CountdownBoxes({ to, now, label }: { to: string; now: number | null; label: string }) {
  const { t } = useTranslation();
  const l = now === null ? null : timeLeft(to, now);
  const units = ['days', 'hours', 'minutes', 'seconds'].map((u) => t('campaign.units.' + u));
  const values = l ? [l.days, l.hours, l.minutes, l.seconds] : [null, null, null, null];
  return (
    <div role="timer" aria-label={label}>
      <p className="text-[11px] uppercase tracking-[0.3em] text-stone-400 mb-2">{label}</p>
      <div className="flex gap-2 sm:gap-3">
        {values.map((v, i) => (
          <div key={units[i]} className="min-w-[3.6rem] sm:min-w-[4.5rem] bg-white/5 ring-1 ring-white/10 px-2 py-2 text-center">
            <div className="text-2xl sm:text-4xl font-black tabular-nums text-white leading-none">{v === null ? '--' : two(v)}</div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-stone-400 mt-1.5">{units[i]}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
