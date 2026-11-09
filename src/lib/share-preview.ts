/**
 * What a shared marshal.mk link shows (Task 10.8, EPIC 10).
 *
 * Every post, story and message about the shop carries a link, and Facebook,
 * Instagram and Viber turn it into a card: an image, a title, a line of text.
 * Measured 2026-09-27: the home page's image was a 404 (`/og-image.jpg` did not
 * exist), and a product read "Polos - #BR028 — Men's Polos" with "100% Памук"
 * or nothing under it, in English, for a Macedonian shop.
 *
 * Since Task 9.7 the card carries the product's written title ("Тенка поло
 * блуза, слим крој, црна"), and the product page uses the same description
 * for search.
 *
 * Numbers come from src/config, never typed in, so the card cannot promise a
 * delivery price the checkout does not charge. The price is the one the site
 * shows; a discount is not the message (D-022).
 */

import type { Metadata } from 'next';
import type { Product } from '@/types';
import { SHIPPING_CONFIG } from '@/config/shipping';
import { STORE_ADDRESS } from '@/config/store';
import { orList, type CategoryGroup } from '@/config/categories';
import { formatComposition } from './attributes';
import { den } from './marketing';
import { productTitle } from './product-display';
import { getEffectivePrice } from './pricing';

export const SHARE_LOCALE = 'mk_MK';
export const SHARE_SITE_NAME = 'Marshal';
export const SHARE_IMAGE = { url: '/og-image.jpg', width: 1200, height: 630, alt: 'Маршал · машка облека · Виница' };

/** Ends a sentence, unless it already ends on the full stop of "ден." or is a question. */
const sentence = (t: string) => (/[.?!]$/.test(t) ? t : t + '.');

const DELIVERY = `Плаќање при достава · достава низ цела Македонија, бесплатна над ${den(SHIPPING_CONFIG.freeShippingThreshold)}`;

/**
 * The home page's share card. It names the town, unlike the search title
 * below: the owner keeps Vinica here (2026-11-09, D-044).
 */
export const HOME_SHARE = {
  title: 'Маршал · машка облека, Виница',
  description: ['Кошули, фармерки, јакни и плетиво', DELIVERY, `Дуќан: ${STORE_ADDRESS}`].map(sentence).join(' '),
};

/**
 * The home page in search results (Task 16.1, owner 2026-11-07). The title
 * carries no town, since the shop may grow beyond Vinica, and the Latin
 * spelling people type into Google ("maska obleka", D-045); the description
 * names the shop's address as a fact.
 */
export const HOME_SEARCH = {
  title: 'Marshal · машка облека онлајн · maska obleka',
  description: ['Машка облека: кошули, фармерки, јакни и плетиво', DELIVERY, `Продавница: ${STORE_ADDRESS}`]
    .map(sentence)
    .join(' '),
};

/**
 * A category page's search snippet and card (Task 2.4): what the group holds,
 * in the customer's words, and how it reaches them. No count: it would need
 * a read of its own, and it is stale by the time anyone reads it.
 */
/**
 * A page's own share card (Task 16.3): its title, its text, its address and
 * the shop's image. Next takes `openGraph` from the nearest page or layout
 * that sets one, whole, so a page without it showed the home page's card:
 * the rules pages, shared, read "Маршал · машка облека, Виница".
 */
export function pageShare(title: string, description: string, path: string): Pick<Metadata, 'openGraph' | 'twitter'> {
  return {
    openGraph: {
      type: 'website',
      locale: SHARE_LOCALE,
      siteName: SHARE_SITE_NAME,
      title,
      description,
      url: path,
      images: [SHARE_IMAGE],
    },
    twitter: { card: 'summary_large_image', title, description, images: [SHARE_IMAGE.url] },
  };
}

/** /new and /sale for search, Macedonian (D-039, Task 16.3). Only /new carries a
 * Latin form: people search "nova kolekcija"; for a sale nothing in Latin was
 * searched (Google autocomplete, 2026-11-07). */
export const NEW_SEARCH = {
  title: 'Нови производи · машка облека · nova kolekcija',
  shareTitle: 'Нови производи · машка облека',
  description: ['Најновото во Маршал: машки јакни, плетиво, кошули и фармерки, од последното што стигнало', DELIVERY]
    .map(sentence)
    .join(' '),
};
export const SALE_SEARCH = {
  title: 'Машка облека на попуст',
  description: ['Машка облека на попуст во Маршал, со старата и новата цена на секој производ', DELIVERY]
    .map(sentence)
    .join(' '),
};

/** /categories: the groups on the shelf by name, "јакни и капути · плетиво · …"
 * (dots, not "и": the names have their own, "маици и поло"). */
export function categoriesSearch(groupNames: string[]): { title: string; description: string } {
  const list = groupNames.map((n) => n.toLowerCase()).join(' · ');
  return {
    title: 'Машка облека по категории',
    description: [list ? `Сите категории во Маршал: ${list}` : 'Сите категории во Маршал', DELIVERY].map(sentence).join(' '),
  };
}

/** "Машко плетиво во Маршал, Виница: блузи, џемпери, ролки и кардигани" */
function categoryLead(title: string, holds: string[]): string {
  const kinds = holds.map((h) => h.toLowerCase());
  const list = kinds.length > 1 ? `: ${kinds.slice(0, -1).join(', ')} и ${kinds[kinds.length - 1]}` : '';
  return `${title} во Маршал, Виница${list}`;
}

export function categoryShare(title: string, holds: string[]): { title: string; description: string } {
  return {
    title,
    description: [categoryLead(title, holds), DELIVERY].map(sentence).join(' '),
  };
}

/**
 * A group's title and snippet for search (D-045, Task 16.4): the Latin
 * spelling people type next to the Cyrillic, "Машки јакни и капути · maski
 * jakni". The share card keeps `categoryShare`, written for people.
 */
export function categorySearch(group: CategoryGroup, holds: string[]): { title: string; description: string } {
  return {
    title: `${group.seoTitle} · ${group.searchTerms[0]}`,
    description: [categoryLead(group.seoTitle, holds), `Барате ${orList(group.searchTerms)}?`, DELIVERY]
      .map(sentence)
      .join(' '),
  };
}

/** "98% Памук" out of an old free-text description, when that is all it says. */
function compositionLine(description?: string): string | null {
  const d = (description ?? '').trim();
  if (!d || d.length > 80 || !/\d+\s*%/.test(d)) return null;
  return d.replace(/\s*-\s*/g, ' ').replace(/\s+/g, ' ');
}

export function productShare(p: Product): { title: string; description: string; alt: string } {
  const title = productTitle(p);
  const price = getEffectivePrice(p);
  const sizes = (p.sizes ?? []).filter((s) => Number(s.quantity) >= 1).map((s) => s.size);
  const composition = p.attributes?.composition.length ? formatComposition(p.attributes.composition) : null;
  const parts = [
    composition ?? compositionLine(p.description),
    sizes.length ? `Големини: ${sizes.join(' · ')}` : null,
    DELIVERY,
  ].filter(Boolean);
  return {
    title: `${title} — ${den(price)}`,
    description: (parts as string[]).map(sentence).join(' '),
    alt: title,
  };
}
