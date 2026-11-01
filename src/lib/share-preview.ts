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

import type { Product } from '@/types';
import { SHIPPING_CONFIG } from '@/config/shipping';
import { STORE_ADDRESS } from '@/config/store';
import { formatComposition } from './attributes';
import { den } from './marketing';
import { productTitle } from './product-display';
import { getEffectivePrice } from './pricing';

export const SHARE_LOCALE = 'mk_MK';
export const SHARE_SITE_NAME = 'Marshal';
export const SHARE_IMAGE = { url: '/og-image.jpg', width: 1200, height: 630, alt: 'Маршал · машка облека · Виница' };

/** Ends a sentence, unless it already ends on the full stop of "ден.". */
const sentence = (t: string) => (t.endsWith('.') ? t : t + '.');

const DELIVERY = `Плаќање при достава · достава низ цела Македонија, бесплатна над ${den(SHIPPING_CONFIG.freeShippingThreshold)}`;

export const HOME_SHARE = {
  title: 'Маршал · машка облека, Виница',
  description: ['Кошули, фармерки, јакни и плетиво', DELIVERY, `Дуќан: ${STORE_ADDRESS}`].map(sentence).join(' '),
};

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
