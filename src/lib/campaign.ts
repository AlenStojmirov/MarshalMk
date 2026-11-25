/**
 * Campaigns: a few days in which chosen products sell below their price —
 * Black Friday first (D-051). Pure: no database, no browser.
 *
 * A campaign lives in `store_settings.campaigns` (one row of jsonb, admin
 * only, no migration) with its dates, its words and, for each product in it,
 * the campaign price and the price it had when the campaign was set. Nothing
 * is written to `products`: the server lays the campaign price over a product
 * as it reads it (`applyCampaign`), only between the start and the end, so the
 * prices start and stop on the clock, and nothing has to be put back after.
 * The product's own `sale` stays as it was, and is what it sells at again the
 * moment the campaign ends.
 *
 * The price struck through is the campaign's reference — the lowest the
 * product had before it (the price when the campaign was set, or lower if it
 * fell since), never the regular price of a piece that was already on sale:
 * the rules on price reductions compare with the lowest price of the 30 days
 * before (Закон за заштита на потрошувачите, as summarised by CMS, 2023).
 */

import type { Product } from '@/types';

export interface CampaignCopy {
  mk: string;
  en: string;
}

export interface CampaignItem {
  /** products.id */
  id: string;
  /** What it sells at during the campaign, in den. */
  price: number;
  /** What it sold at when the campaign was set: the reference struck through. */
  before: number;
}

export interface Campaign {
  /** Stable, e.g. `black-friday-2026`. */
  id: string;
  /** The same in both languages: "Black Friday". */
  name: string;
  /** ISO instants. Prices hold from `startsAt` until `endsAt`. */
  startsAt: string;
  endsAt: string;
  /** From here the bar counts down to the start; null: no countdown before. */
  teaserFrom: string | null;
  /** The one line under the name: "Јакни, кошули и плетиво". */
  headline: CampaignCopy;
  /** The animation that greets a visitor once. */
  intro: boolean;
  items: CampaignItem[];
}

export type CampaignPhase = 'upcoming' | 'teaser' | 'live' | 'over';

/** What the phase is worked out from: a campaign, or its face. */
export type CampaignDates = Pick<Campaign, 'startsAt' | 'endsAt' | 'teaserFrom'>;

/** The rules allow an action sale ("акциска продажба") of at most 30 days. */
export const MAX_CAMPAIGN_DAYS = 30;
/** Kept in the settings; older ones are dropped when a new one is saved. */
export const MAX_CAMPAIGNS = 12;
/** Days of countdown before the start, for a new campaign. */
export const DEFAULT_TEASER_DAYS = 2;

const DAY = 86_400_000;

const time = (iso: string | null | undefined) => (iso ? Date.parse(iso) : NaN);

export function campaignPhase(c: CampaignDates, now: number = Date.now()): CampaignPhase {
  if (now >= time(c.endsAt)) return 'over';
  if (now >= time(c.startsAt)) return 'live';
  const teaser = time(c.teaserFrom);
  if (Number.isFinite(teaser) && now >= teaser) return 'teaser';
  return 'upcoming';
}

/**
 * The campaign a visitor is shown: the one on now, else the one counting down
 * to the soonest start. Null when there is neither.
 */
export function shownCampaign(campaigns: Campaign[], now: number = Date.now()): Campaign | null {
  const by = (phase: CampaignPhase) =>
    campaigns.filter((c) => campaignPhase(c, now) === phase).sort((a, b) => time(a.startsAt) - time(b.startsAt));
  return by('live')[0] ?? by('teaser')[0] ?? null;
}

/** The campaign on now, if any: the one whose prices hold. */
export function liveCampaign(campaigns: Campaign[], now: number = Date.now()): Campaign | null {
  const c = shownCampaign(campaigns, now);
  return c && campaignPhase(c, now) === 'live' ? c : null;
}

/** The price a product sells at outside any campaign. */
export function standingPrice(p: Product): number {
  return p.sale?.isActive && typeof p.sale.salePrice === 'number' && p.sale.salePrice > 0 ? p.sale.salePrice : p.price;
}

export interface CampaignPrice {
  price: number;
  /** Struck through: the lowest of the price when set and the price now. */
  reference: number;
  /** Off the reference, rounded. */
  pct: number;
}

/**
 * What the campaign does to one product, or null when it does nothing: not in
 * it, or its own price is already as low. Never raises a price.
 */
export function campaignPriceOf(p: Product, c: Campaign): CampaignPrice | null {
  const item = c.items.find((i) => i.id === p.id);
  if (!item) return null;
  const price = Math.round(item.price);
  const now = standingPrice(p);
  const reference = Math.min(item.before > 0 ? item.before : now, now);
  if (!(price > 0) || price >= reference) return null;
  return { price, reference, pct: Math.round((1 - price / reference) * 100) };
}

/**
 * The product as the shop sells it now: during the campaign, at its campaign
 * price, marked with the campaign so the card says so. Server reads only
 * (products-server, basket-server); the back office never sees this, so no
 * form can write a campaign price back as the product's own.
 */
export function applyCampaign(p: Product, c: Campaign | null, now: number = Date.now()): Product {
  if (!c || campaignPhase(c, now) !== 'live') return p;
  const cp = campaignPriceOf(p, c);
  if (!cp) return p;
  return {
    ...p,
    sale: { isActive: true, salePrice: cp.price, percentageOff: cp.pct, referencePrice: cp.reference, campaign: { id: c.id, name: c.name, endsAt: c.endsAt } },
  };
}

// ---------------------------------------------------------------------------
// What the browser is told before the prices hold: no prices, only the face.
// ---------------------------------------------------------------------------

export interface CampaignFace {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
  teaserFrom: string | null;
  headline: CampaignCopy;
  intro: boolean;
  /** The deepest cut on the shelf, for "до −N%"; 0 when nothing is left. */
  maxPct: number;
  /** Products on the shelf at a campaign price. */
  count: number;
}

/** Products on the shelf that the campaign lowers, with what it does to each. */
export function campaignShelf(c: Campaign, products: Product[]): { product: Product; cp: CampaignPrice }[] {
  const out: { product: Product; cp: CampaignPrice }[] = [];
  for (const product of products) {
    if (product.isVisible === false || !product.sizes?.some((s) => s.quantity >= 1)) continue;
    const cp = campaignPriceOf(product, c);
    if (cp) out.push({ product, cp });
  }
  return out;
}

/** "до −N%" is said in fives, rounded down: never more than a piece on the shelf gets. */
const HEADLINE_STEP = 5;

export function campaignFace(c: Campaign, products: Product[]): CampaignFace {
  const shelf = campaignShelf(c, products);
  const deepest = shelf.reduce((m, s) => Math.max(m, s.cp.pct), 0);
  return {
    id: c.id,
    name: c.name,
    startsAt: c.startsAt,
    endsAt: c.endsAt,
    teaserFrom: c.teaserFrom,
    headline: c.headline,
    intro: c.intro,
    maxPct: Math.floor(deepest / HEADLINE_STEP) * HEADLINE_STEP,
    count: shelf.length,
  };
}

// ---------------------------------------------------------------------------
// Reading and checking what is stored.
// ---------------------------------------------------------------------------

const str = (v: unknown, max = 200) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const iso = (v: unknown): string | null => {
  const t = typeof v === 'string' ? Date.parse(v) : NaN;
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

function parseItem(raw: unknown): CampaignItem | null {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  const id = str(o?.id, 100);
  const price = Math.round(Number(o?.price));
  const before = Math.round(Number(o?.before));
  if (!id || !(price > 0)) return null;
  return { id, price, before: before > 0 ? before : 0 };
}

/** A stored campaign, or null when it lacks what it cannot work without. */
export function parseCampaign(raw: unknown): Campaign | null {
  const o = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : null;
  if (!o) return null;
  const id = str(o.id, 80);
  const startsAt = iso(o.startsAt);
  const endsAt = iso(o.endsAt);
  if (!id || !startsAt || !endsAt || Date.parse(endsAt) <= Date.parse(startsAt)) return null;
  const h = o.headline && typeof o.headline === 'object' ? (o.headline as Record<string, unknown>) : {};
  const seen = new Set<string>();
  const items = (Array.isArray(o.items) ? o.items : [])
    .map(parseItem)
    .filter((i): i is CampaignItem => !!i && !seen.has(i.id) && !!seen.add(i.id));
  return {
    id,
    name: str(o.name, 60) || 'Black Friday',
    startsAt,
    endsAt,
    teaserFrom: iso(o.teaserFrom),
    headline: { mk: str(h.mk), en: str(h.en) },
    intro: o.intro !== false,
    items,
  };
}

export function parseCampaigns(raw: unknown): Campaign[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  return raw
    .map(parseCampaign)
    .filter((c): c is Campaign => !!c && !seen.has(c.id) && !!seen.add(c.id))
    .sort((a, b) => time(b.startsAt) - time(a.startsAt))
    .slice(0, MAX_CAMPAIGNS);
}

/** What is wrong with a campaign before it may be saved, in Macedonian; empty when nothing. */
export function campaignProblems(c: Campaign): string[] {
  const out: string[] = [];
  if (!/^[a-z0-9-]{3,80}$/.test(c.id)) out.push('Ознаката смее да има само мали латинични букви, бројки и цртичка.');
  const start = time(c.startsAt);
  const end = time(c.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) out.push('Почетокот и крајот се задолжителни.');
  else if (end <= start) out.push('Крајот мора да е по почетокот.');
  else if (end - start > MAX_CAMPAIGN_DAYS * DAY) out.push(`Акцијата смее да трае најмногу ${MAX_CAMPAIGN_DAYS} дена.`);
  const teaser = time(c.teaserFrom);
  if (Number.isFinite(teaser) && teaser > start) out.push('Одбројувањето мора да почне пред акцијата.');
  if (!c.name.trim()) out.push('Името е задолжително.');
  if (c.items.some((i) => !(i.price > 0))) out.push('Секоја цена во акцијата мора да е над нула.');
  return out;
}

// ---------------------------------------------------------------------------
// Dates in the shop's own time, wherever the page is drawn: Vercel's server is
// on UTC, and Friday 00:00 in Vinica is Thursday 23:00 there.
// ---------------------------------------------------------------------------

export const SHOP_TIME_ZONE = 'Europe/Skopje';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export interface ShopDay {
  y: number;
  m: number;
  d: number;
  /** 0 Sunday … 6 Saturday */
  weekday: number;
}

export function shopDay(at: string | number | Date): ShopDay {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SHOP_TIME_ZONE, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short',
  }).formatToParts(new Date(at));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return { y: Number(get('year')), m: Number(get('month')), d: Number(get('day')), weekday: Math.max(0, WEEKDAYS.indexOf(get('weekday'))) };
}

const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "27.11" / "27 Nov", with the year when asked: "29.11.2026" / "29 Nov 2026". */
export function shopDate(lang: 'mk' | 'en', at: string | number | Date, withYear = false): string {
  const { y, m, d } = shopDay(at);
  if (lang === 'en') return `${d} ${EN_MONTHS[m - 1]}${withYear ? ` ${y}` : ''}`;
  return `${d}.${m}${withYear ? `.${y}` : ''}`;
}

/** The time left to an instant, for a countdown; all zero once it has passed. */
export function timeLeft(to: string, now: number): { days: number; hours: number; minutes: number; seconds: number; ms: number } {
  const ms = Math.max(0, time(to) - now);
  const s = Math.floor(ms / 1000);
  return { days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60, ms };
}
