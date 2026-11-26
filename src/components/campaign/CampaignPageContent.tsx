'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import type { Product } from '@/types';
import type { CampaignFace, CampaignPhase } from '@/lib/campaign';
import { groupOfCategory, groupsInSeasonOrder, type GroupKey } from '@/config/categories';
import { getEffectivePrice } from '@/lib/pricing';
import { useCampaignClock } from '@/hooks/useCampaignClock';
import { useTranslation } from '@/lib/i18n';
import ProductCard from '@/components/ProductCard';
import { CountdownBoxes } from './CampaignCountdown';
import CampaignName from './CampaignName';
import { useCampaignDates } from './CampaignHero';

export interface CampaignPageItem {
  product: Product;
  /** Before the start: the cut it will get. */
  upcomingPct?: number;
}

/** `season`: this season's groups first (jackets in November, not shorts), deepest cut first within each. */
type Sort = 'season' | 'discount' | 'price';

const FIRST_ROW_ON_PHONE = 2;
const ON_SCREEN = 4;

function pctOf(item: CampaignPageItem): number {
  return item.product.sale?.campaign ? item.product.sale.percentageOff : item.upcomingPct ?? 0;
}

function Closed({ title, text }: { title: string; text?: string }) {
  const { t } = useTranslation();
  return (
    <div className="bg-stone-950 text-white">
      <div className="mx-auto max-w-3xl px-4 py-24 text-center">
        <h1 className="text-4xl sm:text-5xl font-black uppercase tracking-tight">{title}</h1>
        {text && <p className="mt-4 text-stone-300">{text}</p>}
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/sale" className="bg-amber-300 px-6 py-3 text-sm font-black uppercase tracking-[0.2em] text-stone-950 hover:bg-amber-200">
            {t('campaign.page.toSale')}
          </Link>
          <Link href="/new" className="px-6 py-3 text-sm font-bold uppercase tracking-[0.2em] ring-1 ring-white/30 hover:ring-white">
            {t('campaign.page.toNew')}
          </Link>
        </div>
      </div>
    </div>
  );
}

/**
 * The campaign's page, /black-friday (D-051): every piece in it on the shelf,
 * by group, deepest cut first. Before the start it shows what goes in and by
 * how much; after the end, that it is over and where the sale goes on.
 */
export default function CampaignPageContent({
  face,
  initialPhase,
  items,
}: {
  face: CampaignFace | null;
  initialPhase: CampaignPhase | 'none';
  items: CampaignPageItem[];
}) {
  const { t, language } = useTranslation();
  const { now, phase } = useCampaignClock(face, initialPhase === 'none' ? 'over' : initialPhase);
  const dates = useCampaignDates(face ?? { startsAt: new Date(0).toISOString(), endsAt: new Date(0).toISOString() });
  const [group, setGroup] = useState<GroupKey | 'all'>('all');
  const [sort, setSort] = useState<Sort>('season');

  const groups = useMemo(() => {
    const counts = new Map<GroupKey, number>();
    for (const it of items) {
      const g = groupOfCategory(it.product.category)?.key;
      if (g) counts.set(g, (counts.get(g) ?? 0) + 1);
    }
    const order = groupsInSeasonOrder().map((g) => g.key);
    return [...counts.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));
  }, [items]);

  const shown = useMemo(() => {
    const list = group === 'all' ? items : items.filter((it) => groupOfCategory(it.product.category)?.key === group);
    const order = new Map(groupsInSeasonOrder().map((g, i) => [g.key, i]));
    const rank = (it: CampaignPageItem) => order.get(groupOfCategory(it.product.category)?.key as GroupKey) ?? 99;
    return [...list].sort((a, b) =>
      sort === 'price'
        ? getEffectivePrice(a.product) - getEffectivePrice(b.product)
        : sort === 'season'
          ? rank(a) - rank(b) || pctOf(b) - pctOf(a)
          : pctOf(b) - pctOf(a),
    );
  }, [items, group, sort]);

  if (!face || initialPhase === 'none') return <Closed title={t('campaign.page.noneTitle')} />;
  if (phase === 'over' || phase === 'upcoming') {
    return <Closed title={t('campaign.page.overTitle', { name: face.name })} text={t('campaign.page.overText')} />;
  }

  const live = phase === 'live';
  const headline = face.headline[language] || face.headline.mk;
  const chip = (active: boolean) =>
    active
      ? 'shrink-0 bg-stone-950 px-4 py-2 text-[12px] font-bold uppercase tracking-[0.12em] text-amber-300'
      : 'shrink-0 bg-white px-4 py-2 text-[12px] font-bold uppercase tracking-[0.12em] text-stone-700 ring-1 ring-stone-200 hover:ring-stone-950';

  return (
    <div className="bg-stone-50">
      <section className="relative overflow-hidden bg-stone-950 text-white">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="campaign-glow absolute -right-24 -top-24 h-80 w-80 rounded-full bg-amber-300/15 blur-3xl" />
          <div className="absolute inset-0 opacity-[0.06] [background-image:repeating-linear-gradient(135deg,#fff_0_2px,transparent_2px_22px)]" />
        </div>
        <div className="relative mx-auto flex max-w-7xl flex-col gap-8 px-4 py-10 sm:px-6 md:flex-row md:items-end md:justify-between md:py-14 lg:px-8">
          <div className="min-w-0 md:flex-1">
            <p className="text-[11px] uppercase tracking-[0.3em] text-amber-300/90">
              {t('campaign.dates', { from: dates.from, to: dates.to })}
            </p>
            <CampaignName
              name={face.name}
              as="h1"
              className="campaign-shine-text mt-3 font-black uppercase leading-[0.85] tracking-tight [--name-max:3rem] sm:[--name-max:4.5rem]"
            />
            {live && face.maxPct > 0 && (
              <p className="campaign-stamp mt-5 inline-block -rotate-3 bg-amber-300 px-3 py-1 text-2xl font-black text-stone-950 sm:text-3xl">
                {t('campaign.upTo', { pct: face.maxPct })}
              </p>
            )}
            {headline && <p className="mt-5 max-w-xl text-stone-300">{headline}</p>}
          </div>
          <CountdownBoxes to={live ? face.endsAt : face.startsAt} now={now} label={live ? t('campaign.endsIn') : t('campaign.startsIn')} />
        </div>
      </section>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {!live && <p className="mb-6 max-w-3xl text-sm text-stone-600">{t('campaign.page.teaserNote')}</p>}

        {items.length === 0 ? (
          <p className="py-16 text-center text-sm uppercase tracking-wider text-stone-400">{t('campaign.page.empty')}</p>
        ) : (
          <>
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0" role="group">
                <button type="button" className={chip(group === 'all')} aria-pressed={group === 'all'} onClick={() => setGroup('all')}>
                  {t('campaign.page.all')} · {items.length}
                </button>
                {groups.map(([g, n]) => (
                  <button key={g} type="button" className={chip(group === g)} aria-pressed={group === g} onClick={() => setGroup(g)}>
                    {t('categoryGroups.' + g)} · {n}
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 text-[12px] uppercase tracking-[0.12em] text-stone-500">
                <span className="sr-only sm:not-sr-only">{t('campaign.page.count', { count: shown.length })}</span>
                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value as Sort)}
                  className="bg-white px-3 py-2 text-[12px] font-bold uppercase tracking-[0.1em] text-stone-800 ring-1 ring-stone-200"
                >
                  <option value="season">{t('campaign.page.sortSeason')}</option>
                  <option value="discount">{t('campaign.page.sortDiscount')}</option>
                  <option value="price">{t('campaign.page.sortPriceAsc')}</option>
                </select>
              </label>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 md:gap-x-6 md:gap-y-10 xl:grid-cols-4">
              {shown.map((it, i) => (
                <ProductCard
                  key={it.product.id}
                  product={it.product}
                  load={i < FIRST_ROW_ON_PHONE ? 'high' : i < ON_SCREEN ? 'eager' : undefined}
                  upcoming={!live && it.upcomingPct ? { pct: it.upcomingPct, label: t('campaign.fromDay', { pct: it.upcomingPct, day: dates.startDay }) } : undefined}
                />
              ))}
            </div>
          </>
        )}

        <div className="mt-14 space-y-1 border-t border-stone-200 pt-6 text-[12px] text-stone-500">
          <p>{t('campaign.dates', { from: dates.from, to: dates.to })}</p>
          <p>{t('campaign.page.reference')}</p>
          <p>{t('campaign.page.cod')}</p>
        </div>
      </div>
    </div>
  );
}
