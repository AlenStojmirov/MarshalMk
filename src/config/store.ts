import type { Language } from '@/lib/i18n/messages';

/**
 * The physical shop.
 *
 * One place for it, because it is now shown in several: the footer, the
 * checkout (where a customer choosing store pickup is told where to go), and
 * the delivery, exchange and privacy pages (Task 13.5). An address that drifts
 * between them is worse than a typo — someone walks to the wrong one.
 */
export const STORE_NAME = 'Маршал';
export const STORE_ADDRESS = 'ул. Маршал Тито 60, Виница';
export const STORE_MAPS_URL = 'https://maps.app.goo.gl/nUj5SHXpr9AKKpTK8';
export const STORE_EMAIL = 'marshalvinica@gmail.com';
export const STORE_INSTAGRAM_URL = 'https://www.instagram.com/marshalonlinemk';
export const STORE_FACEBOOK_URL = 'https://www.facebook.com/profile.php?id=61581250984500';
export const STORE_MESSENGER_URL = 'https://m.me/marshalonlinemk';

/**
 * The name and address in the page's language. The constants above stay
 * Macedonian for what is always Macedonian: the e-mails, the posts, the previews.
 */
export const storeName = (lang: Language = 'mk'): string => (lang === 'en' ? 'Marshal' : STORE_NAME);
export const storeAddress = (lang: Language = 'mk'): string =>
  lang === 'en' ? 'Marshal Tito St. 60, Vinica' : STORE_ADDRESS;

/**
 * Exchanges (owner, 2026-09-27 and 2026-10-18; D-032). An exchange has to be
 * reported within this many hours of receiving the order, inside a window of
 * this many days; once approved the customer sends the item by courier, the
 * shop exchanges it and sends it back, and both shipments are the customer's
 * cost. There is no refund in money, only an exchange.
 */
export const EXCHANGE_REPORT_HOURS = 24;
export const EXCHANGE_WINDOW_DAYS = 14;
