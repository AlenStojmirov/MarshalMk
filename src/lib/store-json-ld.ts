/**
 * Who the shop is, for search engines (Task 16.1).
 *
 * Until 16.1 the site told Google only of an `Organization`, in English and
 * with no address, so the shop in Vinica did not exist as a place in the
 * site's own data. Now every page carries the organization, and the home page
 * adds the website (the name Google shows above a result) and the shop itself
 * as a `ClothingStore`: address, map pin, opening hours, prices. The three are
 * joined by `@id`, so they read as one business.
 *
 * Every fact comes from src/config/store.ts, never typed in here; the text is
 * Macedonian like all page metadata (D-039). Goes into its <script> only
 * through `jsonLd()`.
 */

import {
  STORE_BRAND,
  STORE_CITY,
  STORE_DAYS,
  STORE_EMAIL,
  STORE_FACEBOOK_URL,
  STORE_GEO,
  STORE_INSTAGRAM_URL,
  STORE_MAPS_URL,
  STORE_NAME,
  STORE_POSTAL_CODE,
  STORE_STREET,
  storeHoursPeriods,
} from '@/config/store';
import type { Product } from '@/types';
import { getEffectivePrice } from './pricing';
import { den } from './marketing';

const BASE = 'https://marshal.mk';
const ORGANIZATION_ID = `${BASE}/#organization`;
// The dark mark: Google shows a logo on white, where the white one disappears.
const LOGO = `${BASE}/logo_black.png`;
const SAME_AS = [STORE_INSTAGRAM_URL, STORE_FACEBOOK_URL];

export function organizationJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    '@id': ORGANIZATION_ID,
    name: STORE_BRAND,
    alternateName: STORE_NAME,
    url: BASE,
    logo: LOGO,
    email: STORE_EMAIL,
    description: 'Машка облека: кошули, фармерки, јакни и плетиво, онлајн со плаќање при достава и во продавницата.',
    sameAs: SAME_AS,
  };
}

export function websiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    '@id': `${BASE}/#website`,
    name: STORE_BRAND,
    alternateName: [STORE_NAME, 'marshal.mk'],
    url: BASE,
    inLanguage: 'mk',
    publisher: { '@id': ORGANIZATION_ID },
  };
}

/**
 * The shop in Vinica. `shelf` is what is on sale online now, for the price
 * range; without it the range is left out rather than guessed.
 */
export function storeJsonLd(shelf: Product[] = [], date: Date = new Date()) {
  const prices = shelf.map(getEffectivePrice).filter((p) => p > 0);
  const priceRange = prices.length ? `${den(Math.min(...prices))} – ${den(Math.max(...prices))}` : undefined;
  return {
    '@context': 'https://schema.org',
    '@type': 'ClothingStore',
    '@id': `${BASE}/#store`,
    name: STORE_BRAND,
    // The Maps profile's name until the owner renames it (2026-11-07).
    alternateName: [STORE_NAME, 'Butik Marshal'],
    description: `Продавница за машка облека во ${STORE_CITY}: кошули, фармерки, јакни и плетиво.`,
    url: BASE,
    image: `${BASE}/og-image.jpg`,
    logo: LOGO,
    email: STORE_EMAIL,
    address: {
      '@type': 'PostalAddress',
      streetAddress: STORE_STREET,
      addressLocality: STORE_CITY,
      postalCode: STORE_POSTAL_CODE,
      addressCountry: 'MK',
    },
    geo: { '@type': 'GeoCoordinates', ...STORE_GEO },
    hasMap: STORE_MAPS_URL,
    openingHoursSpecification: storeHoursPeriods(date).map((p) => ({
      '@type': 'OpeningHoursSpecification',
      dayOfWeek: [...STORE_DAYS],
      opens: p.opens,
      closes: p.closes,
      validFrom: p.from,
      validThrough: p.through,
    })),
    ...(priceRange ? { priceRange } : {}),
    currenciesAccepted: 'MKD',
    paymentAccepted: 'Готовина',
    sameAs: SAME_AS,
    parentOrganization: { '@id': ORGANIZATION_ID },
  };
}
