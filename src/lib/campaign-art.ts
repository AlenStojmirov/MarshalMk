/**
 * What the campaign's pictures for Instagram are drawn from (D-051): the
 * dates in words, the link, and one card per item, from the item as it
 * stands — saved, or still being edited on the campaign screen. Browser
 * only, like post-images.ts.
 */

import type { Product } from '@/types';
import { campaignReference, shopDate, shopDay, type Campaign, type CampaignItem } from './campaign';
import { productTitle } from './product-display';
import type { CampaignArt, CampaignCardProduct } from './post-images';

/** Where every picture sends people. */
export const CAMPAIGN_LINK = 'marshal.mk/black-friday';

const DAYS = ['недела', 'понеделник', 'вторник', 'среда', 'четврток', 'петок', 'сабота'];

/** "петок 27.11", or "недела 29.11.2026" with the year. */
export const mkDay = (iso: string, withYear = false) => `${DAYS[shopDay(iso).weekday]} ${shopDate('mk', iso, withYear)}`;

export const hasPhoto = (p: Product) => /^(https?:\/\/|\/)/.test(p.imageUrl?.trim() ?? '');

/** The words every campaign picture carries: the name, the deepest cut, "Акција" and the dates. */
export function campaignArt(c: Pick<Campaign, 'name' | 'startsAt' | 'endsAt'>, maxPct: number): CampaignArt {
  return {
    name: c.name,
    upTo: maxPct > 0 ? `до −${maxPct}%` : '',
    dates: `Акција: ${mkDay(c.startsAt)} – ${mkDay(c.endsAt, true)}`,
    link: CAMPAIGN_LINK,
  };
}

/** One item as a picture shows it: the campaign price, struck through the price the site strikes. */
export function campaignCard(p: Product, it: CampaignItem): CampaignCardProduct & { id: string } {
  const before = campaignReference(it, p);
  return {
    id: p.id,
    title: productTitle(p, 'mk'),
    photo: p.imageUrl?.trim() || null,
    price: it.price,
    before,
    pct: before > 0 ? Math.round((1 - it.price / before) * 100) : 0,
  };
}

/** A file name a phone and a .zip both keep: the campaign, the place in the list, the product's code. */
export function storyFileName(campaignId: string, p: Product, n?: number): string {
  const code = (p.name || p.id).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || p.id;
  return `${campaignId}-storija-${n ? `${String(n).padStart(2, '0')}-` : ''}${code}.jpg`;
}
