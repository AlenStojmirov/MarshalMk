/**
 * Where an order came from (Task 10.6, EPIC 10, D-025).
 *
 * Measured 2026-09-28: 209 shop sales in 90 days against 1 online. Instagram
 * and Facebook most likely bring people into the shop and into the inbox, but
 * nothing records it — without that, a "test" is an impression. Two signals:
 *
 *   * the link — every calendar post gets its own (utm_source, utm_campaign =
 *     the post); the site remembers the first page a visitor landed on from
 *     one, for ATTRIBUTION_DAYS, and the order carries it;
 *   * the question — "Од каде дознавте за нас?" at checkout, optional.
 *
 * Both ride in the order's `customer` jsonb as `source`, like the delivery
 * method (D-011): no migration, and a checkout that must never fail on a
 * missing column.
 *
 * Shared by the browser (capture, checkout) and the server (the order route,
 * which trusts nothing and cleans it with `cleanSource`).
 */

export const HEARD_FROM = ['instagram', 'facebook', 'friend', 'passedBy', 'google', 'other'] as const;
export type HeardFrom = (typeof HEARD_FROM)[number];

export const HEARD_LABEL: Record<HeardFrom, { mk: string; en: string }> = {
  instagram: { mk: 'Instagram', en: 'Instagram' },
  facebook: { mk: 'Facebook', en: 'Facebook' },
  friend: { mk: 'Препорака од пријател', en: 'A friend' },
  passedBy: { mk: 'Поминав покрај дуќанот', en: 'Walked past the shop' },
  google: { mk: 'Google', en: 'Google' },
  other: { mk: 'Друго', en: 'Other' },
};

export interface OrderSource {
  /** The answer at checkout. */
  heard?: HeardFrom;
  utmSource?: string;
  utmMedium?: string;
  /** For links from the calendar: `p-` and the first eight characters of the post id. */
  utmCampaign?: string;
  /** The first page opened from the link, path only. */
  landing?: string;
  /** When the link was followed, ISO. */
  at?: string;
}

/** A link followed longer ago than this no longer explains an order. */
export const ATTRIBUTION_DAYS = 30;
export const ATTRIBUTION_KEY = 'marshal:attribution';

const TOKEN = /^[a-z0-9._-]{1,64}$/;
const cleanToken = (v: unknown) => {
  if (typeof v !== 'string') return undefined;
  const t = v.trim().toLowerCase();
  return TOKEN.test(t) ? t : undefined;
};

/**
 * What the server keeps of a source sent by the browser: known answers only,
 * short lowercase tokens, a path — anything else is dropped, never refused. An
 * order must not fail because of how someone found the shop.
 */
export function cleanSource(raw: unknown): OrderSource | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const out: OrderSource = {};
  if (typeof r.heard === 'string' && (HEARD_FROM as readonly string[]).includes(r.heard)) out.heard = r.heard as HeardFrom;
  const s = cleanToken(r.utmSource);
  const m = cleanToken(r.utmMedium);
  const c = cleanToken(r.utmCampaign);
  if (s) out.utmSource = s;
  if (m) out.utmMedium = m;
  if (c) out.utmCampaign = c;
  if (typeof r.landing === 'string' && /^\/[\w\-./%]{0,199}$/.test(r.landing)) out.landing = r.landing;
  if (typeof r.at === 'string' && !Number.isNaN(Date.parse(r.at))) out.at = new Date(r.at).toISOString();
  return Object.keys(out).length ? out : undefined;
}

/** The link part of a source, read from a landing URL. Null without utm_source. */
export function sourceFromUrl(search: string, pathname: string, now = new Date()): OrderSource | null {
  const q = new URLSearchParams(search);
  const utmSource = cleanToken(q.get('utm_source'));
  if (!utmSource) return null;
  return cleanSource({
    utmSource,
    utmMedium: q.get('utm_medium'),
    utmCampaign: q.get('utm_campaign'),
    landing: pathname,
    at: now.toISOString(),
  }) ?? null;
}

export function isFresh(s: OrderSource | null | undefined, now = Date.now()): boolean {
  if (!s?.at) return false;
  return now - Date.parse(s.at) <= ATTRIBUTION_DAYS * 86_400_000;
}

export const SITE_URL = 'https://marshal.mk';

/** The campaign token for a calendar post. */
export const campaignOf = (planId: string) => `p-${planId.replace(/-/g, '').slice(0, 8)}`;

/**
 * A post's own link. Instagram does not make links in a caption clickable, so
 * this goes into the bio or a story link sticker; on Facebook it works in the
 * post itself.
 */
export function trackedLink(path: string, network: 'instagram' | 'facebook', planId: string): string {
  const q = new URLSearchParams({ utm_source: network, utm_medium: 'social', utm_campaign: campaignOf(planId) });
  return `${SITE_URL}${path}?${q.toString()}`;
}

/** "Instagram · p-1a2b3c4d" for the orders screen. */
export function describeSource(s: OrderSource | undefined): string | null {
  if (!s) return null;
  const parts: string[] = [];
  if (s.utmSource) parts.push(`линк: ${s.utmSource}${s.utmCampaign ? ` · ${s.utmCampaign}` : ''}`);
  if (s.heard) parts.push(`одговор: ${HEARD_LABEL[s.heard].mk}`);
  return parts.length ? parts.join(' · ') : null;
}
