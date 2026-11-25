'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight } from 'lucide-react';
import { shopDay, type CampaignFace, type CampaignPhase } from '@/lib/campaign';
import { useCampaignClock } from '@/hooks/useCampaignClock';
import { useTranslation } from '@/lib/i18n';
import { CountdownInline } from './CampaignCountdown';

/**
 * The black bar above the header while a campaign counts down or holds
 * (D-051), on every page of the shop but the back office. All of it is one
 * link to the campaign's page. Drawn on the server with the page, at a fixed
 * height, so nothing below it moves when the countdown fills in.
 */
export default function CampaignBar({ face, initialPhase }: { face: CampaignFace | null; initialPhase: CampaignPhase }) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const { now, phase } = useCampaignClock(face, initialPhase);

  if (!face || pathname?.startsWith('/admin')) return null;
  if (phase !== 'live' && phase !== 'teaser') return null;
  if (phase === 'live' && face.count === 0) return null;

  const live = phase === 'live';
  const day = t(`campaign.days.${shopDay(face.startsAt).weekday}`);

  return (
    <Link
      href="/black-friday"
      aria-label={t('campaign.bar.aria', { name: face.name })}
      className="campaign-bar group relative block h-10 overflow-hidden bg-stone-950 text-white"
    >
      <div className="relative z-10 mx-auto flex h-full max-w-7xl items-center justify-center gap-2 sm:gap-4 px-3 text-[12px] sm:text-[13px] whitespace-nowrap">
        <span className="campaign-shine-text font-black uppercase tracking-[0.18em]">{face.name}</span>
        {live && face.maxPct > 0 && (
          <span className="bg-amber-300 px-1.5 py-0.5 font-black text-stone-950">{t('campaign.upTo', { pct: face.maxPct })}</span>
        )}
        {!live && <span className="sm:hidden text-stone-300">{t('campaign.bar.teaserShort', { day })}</span>}
        <span className="hidden sm:inline text-stone-300">
          {live ? t('campaign.bar.live', { name: face.name }) : t('campaign.bar.teaser', { name: face.name, day })}
        </span>
        <span className="text-stone-400 hidden md:inline">·</span>
        <span className="flex items-center gap-1.5 text-stone-300">
          <span className="hidden md:inline">{live ? t('campaign.endsIn') : t('campaign.startsIn')}</span>
          <CountdownInline to={live ? face.endsAt : face.startsAt} now={now} className="font-bold text-white" />
        </span>
        <span className="flex items-center gap-1 font-bold text-amber-300 group-hover:gap-2 transition-all">
          <span className="hidden sm:inline">{t('campaign.bar.link')}</span>
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </span>
      </div>
    </Link>
  );
}
