/**
 * The campaigns as the shop's server reads them (D-051). Server only: the
 * settings row is the admin's (migration 020), read here with the service
 * role.
 *
 * Read at most once a minute: the layout asks on every page. A campaign saved
 * in the back office is on the site within that minute, and its prices start
 * and stop on the clock, whatever was read when (`applyCampaign` looks at the
 * time of each read). Never throws: a failed read is no campaign, and the shop
 * sells at its own prices.
 */

import { unstable_cache } from 'next/cache';
import { getSupabaseAdmin } from './supabase-admin';
import { fetchStoreSettings } from './store-settings';
import { rowToProduct, type ProductRow } from './db-mappers';
import { applyCampaign, campaignFace, campaignPhase, liveCampaign, shownCampaign, type Campaign, type CampaignFace, type CampaignPhase } from './campaign';
import type { Product } from '@/types';

const readCampaigns = unstable_cache(
  async (): Promise<Campaign[]> => {
    const r = await fetchStoreSettings(getSupabaseAdmin());
    if (r.error && !r.missingTable) console.error('Campaigns could not be read:', r.error);
    return r.settings.campaigns;
  },
  ['campaigns'],
  { revalidate: 60 },
);

export async function fetchCampaigns(): Promise<Campaign[]> {
  try {
    return await readCampaigns();
  } catch (err) {
    console.error('Campaigns could not be read:', err);
    return [];
  }
}

/** The campaign whose prices hold now, or null. */
export async function fetchLiveCampaign(now: number = Date.now()): Promise<Campaign | null> {
  return liveCampaign(await fetchCampaigns(), now);
}

/** Lays the campaign on now over each product, as the shop sells it this minute. */
export async function withLiveCampaign(products: Product[]): Promise<Product[]> {
  const now = Date.now();
  const live = await fetchLiveCampaign(now);
  return live ? products.map((p) => applyCampaign(p, live, now)) : products;
}

/**
 * The deepest cut and the count, over the products in the campaign that are
 * on the shelf: only the few columns it needs, and only those products.
 */
const readFace = unstable_cache(
  async (id: string): Promise<CampaignFace | null> => {
    const c = (await readCampaigns()).find((x) => x.id === id);
    if (!c) return null;
    const ids = c.items.map((i) => i.id);
    if (ids.length === 0) return campaignFace(c, []);
    const { data, error } = await getSupabaseAdmin()
      .from('products')
      .select('id, name, price, sale, sizes, is_visible, category, image_url, stock, featured')
      .in('id', ids);
    if (error) throw error;
    return campaignFace(c, ((data ?? []) as ProductRow[]).map(rowToProduct));
  },
  ['campaign-face'],
  { revalidate: 60 },
);

/** The face and its phase this minute, for the layout: the bar and the greeting. */
export async function fetchCampaignNow(): Promise<{ face: CampaignFace | null; phase: CampaignPhase }> {
  const now = Date.now();
  const face = await fetchCampaignFace(now);
  return { face, phase: face ? campaignPhase(face, now) : 'over' };
}

/**
 * What the bar, the greeting and the home page say about the campaign on now
 * or counting down: no prices. Null when there is none.
 */
export async function fetchCampaignFace(now: number = Date.now()): Promise<CampaignFace | null> {
  try {
    const c = shownCampaign(await fetchCampaigns(), now);
    return c ? await readFace(c.id) : null;
  } catch (err) {
    console.error('Campaign could not be read:', err);
    return null;
  }
}
