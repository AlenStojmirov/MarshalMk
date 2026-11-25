'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import type { Product } from '@/types';
import { shopDate, shopDay, type CampaignFace, type CampaignPhase } from '@/lib/campaign';
import { getReferencePrice } from '@/lib/pricing';
import { productTitle } from '@/lib/product-display';
import { useCampaignClock } from '@/hooks/useCampaignClock';
import { useTranslation } from '@/lib/i18n';
import { CountdownBoxes } from './CampaignCountdown';

export interface CampaignPick {
  product: Product;
  /** Before the start: the cut it will get. During: read from the product's own sale. */
  upcomingPct?: number;
}

/** The campaign's dates as a line: "петок 27.11 – недела 29.11.2026". */
export function useCampaignDates(face: Pick<CampaignFace, 'startsAt' | 'endsAt'>) {
  const { t, language } = useTranslation();
  const day = (iso: string) => t(`campaign.days.${shopDay(iso).weekday}`);
  return {
    from: `${day(face.startsAt)} ${shopDate(language, face.startsAt)}`,
    to: `${day(face.endsAt)} ${shopDate(language, face.endsAt, true)}`,
    startDay: day(face.startsAt),
  };
}

function PickTile({ pick, startDay }: { pick: CampaignPick; startDay: string }) {
  const { t, language, price } = useTranslation();
  const p = pick.product;
  const live = !!p.sale?.campaign;
  const pct = live ? p.sale!.percentageOff : pick.upcomingPct ?? 0;
  return (
    <Link href={`/product/${p.id}`} className="group block shrink-0 w-40 sm:w-auto snap-start">
      <div className="relative aspect-[3/4] overflow-hidden bg-stone-800 ring-1 ring-white/10 group-hover:ring-amber-300 transition">
        <Image
          src={p.imageUrl}
          alt={productTitle(p, language)}
          fill
          sizes="(max-width: 640px) 160px, (max-width: 1024px) 25vw, 195px"
          className="object-cover transition-transform duration-500 group-hover:scale-105"
        />
        {pct > 0 && (
          <span className="absolute left-2 top-2 bg-amber-300 px-1.5 py-0.5 text-[12px] font-black text-stone-950">−{pct}%</span>
        )}
      </div>
      <p className="mt-2 truncate text-[12px] text-stone-300">{productTitle(p, language)}</p>
      {live ? (
        <p className="text-[13px]">
          <span className="font-black text-white">{price(p.sale!.salePrice)}</span>{' '}
          <span className="text-stone-500 line-through">{price(getReferencePrice(p))}</span>
        </p>
      ) : (
        <p className="text-[12px] font-bold text-amber-300">{t('campaign.fromDay', { pct, day: startDay })}</p>
      )}
    </Link>
  );
}

/**
 * The top of the home page while a campaign counts down or holds (D-051):
 * its name, the deepest cut, the countdown and the first pieces in it, drawn
 * on the server with the page. Gone the moment the campaign ends, whatever
 * the cached page says.
 */
export default function CampaignHero({ face, initialPhase, picks }: { face: CampaignFace; initialPhase: CampaignPhase; picks: CampaignPick[] }) {
  const { t, language } = useTranslation();
  const { now, phase } = useCampaignClock(face, initialPhase);
  const { from, to, startDay } = useCampaignDates(face);
  if (phase !== 'live' && phase !== 'teaser') return null;
  const live = phase === 'live';
  if (live && face.count === 0) return null;
  const headline = face.headline[language] || face.headline.mk;
  const shown = picks.filter((pk) => (live ? !!pk.product.sale?.campaign : (pk.upcomingPct ?? 0) > 0)).slice(0, 4);

  return (
    <section className="relative overflow-hidden bg-stone-950 text-white">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="campaign-glow absolute -left-32 -top-32 h-96 w-96 rounded-full bg-amber-300/15 blur-3xl" />
        <div className="campaign-glow absolute -bottom-40 right-0 h-[28rem] w-[28rem] rounded-full bg-amber-500/10 blur-3xl" />
        <div className="absolute inset-0 opacity-[0.06] [background-image:repeating-linear-gradient(135deg,#fff_0_2px,transparent_2px_22px)]" />
      </div>

      <div className="relative mx-auto grid max-w-7xl items-center gap-10 px-4 py-12 sm:px-6 md:py-16 lg:grid-cols-[1.2fr_1fr] lg:px-8">
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-amber-300/90">
            {t('campaign.page.kicker')} · {from} – {to}
          </p>
          <h2 className="campaign-shine-text mt-3 text-6xl font-black uppercase leading-[0.85] tracking-tight sm:text-7xl lg:text-8xl">
            {face.name}
          </h2>
          {live && face.maxPct > 0 && (
            <p className="campaign-stamp mt-6 inline-block -rotate-3 bg-amber-300 px-4 py-1.5 text-3xl font-black text-stone-950 sm:text-4xl">
              {t('campaign.upTo', { pct: face.maxPct })}
            </p>
          )}
          {headline && <p className="mt-6 max-w-md text-lg text-stone-300">{headline}</p>}
          <div className="mt-8">
            <CountdownBoxes to={live ? face.endsAt : face.startsAt} now={now} label={live ? t('campaign.endsIn') : t('campaign.startsIn')} />
          </div>
          <Link
            href="/black-friday"
            className="mt-8 inline-flex items-center gap-3 bg-amber-300 px-7 py-4 text-sm font-black uppercase tracking-[0.2em] text-stone-950 hover:bg-amber-200 hover:gap-4 transition-all"
          >
            {live ? t('campaign.hero.cta') : t('campaign.hero.preview')}
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </div>

        {shown.length > 0 && (
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:grid sm:grid-cols-4 sm:overflow-visible sm:px-0 lg:w-full lg:max-w-[400px] lg:grid-cols-2 lg:justify-self-end">
            {shown.map((pk) => (
              <PickTile key={pk.product.id} pick={pk} startDay={startDay} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
