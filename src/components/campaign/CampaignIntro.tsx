'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { shopDate, shopDay, type CampaignFace, type CampaignPhase } from '@/lib/campaign';
import { useCampaignClock } from '@/hooks/useCampaignClock';
import { useTranslation } from '@/lib/i18n';
import { CountdownBoxes } from './CampaignCountdown';

/** Pages where a greeting would be in the way: the campaign's own, the purchase, the account. */
const QUIET = ['/black-friday', '/cart', '/checkout', '/account', '/admin', '/track-order', '/wheel'];
/** After the page has drawn and settled, so it never competes with what the visitor came for. */
const DELAY_MS = 1200;

/** Where the falling "%" start, how big, how late: fixed, so every render agrees. */
const TAGS = [
  { x: 6, s: 28, d: 0 }, { x: 18, s: 18, d: 1.6 }, { x: 31, s: 34, d: 0.8 }, { x: 44, s: 20, d: 2.4 },
  { x: 57, s: 30, d: 0.3 }, { x: 69, s: 16, d: 1.2 }, { x: 81, s: 26, d: 2.0 }, { x: 92, s: 22, d: 0.6 },
];

function seenKey(face: CampaignFace, phase: CampaignPhase) {
  return `campaign-intro:${face.id}:${phase}`;
}

function wasSeen(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return true; // no storage (private mode): better never than on every page
  }
}

function markSeen(key: string) {
  try {
    localStorage.setItem(key, '1');
  } catch {
    /* nothing to remember it in */
  }
}

/**
 * The greeting a visitor gets once per campaign phase (D-051): when it counts
 * down, and again when it starts. A dialog over the page, a second after the
 * page has opened, closed with the button, Esc or a click outside. Never on
 * the campaign's page, the cart, the checkout or the account. With reduced
 * motion the animations are off (globals.css).
 */
export default function CampaignIntro({ face, initialPhase }: { face: CampaignFace | null; initialPhase: CampaignPhase }) {
  const pathname = usePathname();
  const { t, language } = useTranslation();
  const { now, phase } = useCampaignClock(face, initialPhase);
  const [open, setOpen] = useState(false);
  const cta = useRef<HTMLAnchorElement>(null);
  const live = phase === 'live';
  const eligible =
    !!face && face.intro && (phase === 'teaser' || (live && face.count > 0)) &&
    !QUIET.some((p) => pathname === p || pathname?.startsWith(p + '/'));

  useEffect(() => {
    if (!eligible || !face) return;
    const key = seenKey(face, phase);
    if (wasSeen(key)) return;
    const id = setTimeout(() => {
      markSeen(key);
      setOpen(true);
    }, DELAY_MS);
    return () => clearTimeout(id);
  }, [eligible, face, phase]);

  useEffect(() => {
    if (!open) return;
    const before = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    cta.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, [open]);

  if (!open || !face || !eligible) return null;

  const close = () => setOpen(false);
  const day = t(`campaign.days.${shopDay(face.startsAt).weekday}`);
  const from = `${t(`campaign.days.${shopDay(face.startsAt).weekday}`)} ${shopDate(language, face.startsAt)}`;
  const to = `${t(`campaign.days.${shopDay(face.endsAt).weekday}`)} ${shopDate(language, face.endsAt, true)}`;
  const headline = face.headline[language] || face.headline.mk;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t('campaign.intro.aria', { name: face.name })}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
    >
      <div className="campaign-fade absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={close} aria-hidden />

      <div className="campaign-pop relative w-full max-w-md overflow-hidden bg-stone-950 text-white shadow-2xl ring-1 ring-amber-300/30">
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          {TAGS.map((tag, i) => (
            <span
              key={i}
              className="campaign-fall absolute -top-10 font-black text-amber-300/40"
              style={{ left: `${tag.x}%`, fontSize: tag.s, animationDelay: `${tag.d}s` }}
            >
              %
            </span>
          ))}
          <div className="absolute -top-24 left-1/2 h-56 w-56 -translate-x-1/2 rounded-full bg-amber-300/20 blur-3xl" />
        </div>

        <button
          type="button"
          onClick={close}
          aria-label={t('campaign.intro.close')}
          className="absolute right-2 top-2 z-10 p-2 text-stone-400 hover:text-white transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="relative px-6 pb-6 pt-10 text-center">
          <p className="text-[11px] uppercase tracking-[0.3em] text-amber-300/90">{from} – {to}</p>
          <h2 className="mt-3 text-5xl sm:text-6xl font-black uppercase leading-[0.9] tracking-tight">
            {Array.from(face.name).map((ch, i) => (
              <span key={i} className="campaign-letter inline-block" style={{ animationDelay: `${120 + i * 55}ms` }}>
                {ch === ' ' ? ' ' : ch}
              </span>
            ))}
          </h2>
          {live && face.maxPct > 0 && (
            <p className="campaign-stamp mt-5 inline-block -rotate-3 bg-amber-300 px-3 py-1 text-3xl font-black text-stone-950">
              {t('campaign.upTo', { pct: face.maxPct })}
            </p>
          )}
          <p className="mt-5 text-lg font-bold">
            {live ? t('campaign.intro.liveTitle') : t('campaign.intro.teaserTitle', { day })}
          </p>
          {headline && <p className="mt-1 text-sm text-stone-400">{headline}</p>}

          <div className="mt-6 flex justify-center">
            <CountdownBoxes to={live ? face.endsAt : face.startsAt} now={now} label={live ? t('campaign.endsIn') : t('campaign.startsIn')} />
          </div>

          <Link
            ref={cta}
            href="/black-friday"
            onClick={close}
            className="mt-7 block w-full bg-amber-300 py-3.5 text-sm font-black uppercase tracking-[0.2em] text-stone-950 hover:bg-amber-200 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {live ? t('campaign.shop') : t('campaign.hero.preview')}
          </Link>
          <button type="button" onClick={close} className="mt-3 text-xs uppercase tracking-[0.2em] text-stone-500 hover:text-stone-300">
            {t('campaign.intro.later')}
          </button>
          {live && face.count > 0 && (
            <p className="mt-4 text-[11px] text-stone-500">{t('campaign.intro.products', { count: face.count })}</p>
          )}
        </div>
      </div>
    </div>
  );
}
