import type { Metadata } from 'next';
import CampaignPageContent, { type CampaignPageItem } from '@/components/campaign/CampaignPageContent';
import { fetchAllVisibleProducts } from '@/lib/products-server';
import { fetchCampaignFace, fetchCampaigns } from '@/lib/campaign-server';
import {
  campaignFace, campaignPhase, campaignShelf, shopDate, shopDay, shownCampaign,
  type Campaign, type CampaignFace, type CampaignPhase,
} from '@/lib/campaign';
import { campaignOf } from '@/lib/pricing';
import { pageShare } from '@/lib/share-preview';
import { translate } from '@/lib/i18n/messages';

/**
 * Redrawn at most once a minute, like the home page; the prices start and stop
 * on the clock in each read (D-051), and the page turns itself over at the
 * start and the end in the visitor's browser.
 */
export const revalidate = 60;

const PATH = '/black-friday';

interface Found {
  campaign: Campaign;
  phase: CampaignPhase;
  face: CampaignFace;
}

/** The campaign on now or counting down, else the last one that ended (to say it is over). */
async function pageCampaign(): Promise<Found | null> {
  const now = Date.now();
  const campaigns = await fetchCampaigns();
  const shown = shownCampaign(campaigns, now);
  if (shown) {
    const face = (await fetchCampaignFace(now)) ?? campaignFace(shown, []);
    return { campaign: shown, phase: campaignPhase(shown, now), face };
  }
  const last = campaigns
    .filter((c) => campaignPhase(c, now) === 'over')
    .sort((a, b) => Date.parse(b.endsAt) - Date.parse(a.endsAt))[0];
  return last ? { campaign: last, phase: 'over', face: campaignFace(last, []) } : null;
}

/** "петок 27.11" — Macedonian, like all page metadata (D-039). */
function mkDay(iso: string, withYear = false): string {
  return `${translate('mk', `campaign.days.${shopDay(iso).weekday}`)} ${shopDate('mk', iso, withYear)}`;
}

/**
 * Indexed only while it counts down or holds; its own canonical and share
 * card (16.3). The deepest cut is in the title only while it is true.
 */
export async function generateMetadata(): Promise<Metadata> {
  const found = await pageCampaign();
  if (!found || (found.phase !== 'live' && found.phase !== 'teaser')) {
    return {
      title: found ? `${found.campaign.name} заврши` : 'Black Friday',
      robots: { index: false, follow: true },
      alternates: { canonical: PATH },
    };
  }
  const { campaign, face, phase } = found;
  const title = `${campaign.name} · машка облека${phase === 'live' && face.maxPct > 0 ? ` до −${face.maxPct}%` : ''}`;
  const description = [
    `Акциска продажба од ${mkDay(campaign.startsAt)} до ${mkDay(campaign.endsAt, true)}`,
    campaign.headline.mk,
    'Плаќање при достава или подигање во продавница',
  ]
    .filter(Boolean)
    .map((s) => (s.endsWith('.') ? s : `${s}.`))
    .join(' ');
  return {
    title,
    description,
    alternates: { canonical: PATH },
    ...pageShare(title, description, PATH),
  };
}

export default async function BlackFridayPage() {
  const found = await pageCampaign();
  if (!found) return <CampaignPageContent face={null} initialPhase="none" items={[]} />;

  const { campaign, phase, face } = found;
  let items: CampaignPageItem[] = [];
  if (phase === 'live' || phase === 'teaser') {
    const products = await fetchAllVisibleProducts(); // at the campaign's prices while it holds
    items =
      phase === 'live'
        ? products.filter((p) => campaignOf(p)?.id === campaign.id).map((product) => ({ product }))
        : campaignShelf(campaign, products).map((s) => ({ product: s.product, upcomingPct: s.cp.pct }));
  }

  return <CampaignPageContent face={face} initialPhase={phase} items={items} />;
}
