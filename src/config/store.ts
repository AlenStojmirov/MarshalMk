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
export const STORE_STREET = 'ул. Маршал Тито 60';
export const STORE_CITY = 'Виница';
export const STORE_POSTAL_CODE = '2310';
export const STORE_ADDRESS = `${STORE_STREET}, ${STORE_CITY}`;
export const STORE_MAPS_URL = 'https://maps.app.goo.gl/nUj5SHXpr9AKKpTK8';
/** The pin the Maps link above opens (Google Maps, 2026-11-02). */
export const STORE_GEO = { latitude: 41.8840954, longitude: 22.5068242 };

/**
 * The name for search engines and Google Maps (owner, 2026-11-07): "Marshal",
 * the one name on the site's titles, its structured data and the Maps profile,
 * which was "Butik Marshal" until then. The Macedonian text a customer reads
 * keeps STORE_NAME, the same name in Cyrillic.
 */
export const STORE_BRAND = 'Marshal';

/**
 * Opening hours (owner, 2026-11-07): Monday to Saturday, Sunday closed; 12–20
 * from 1 April, 11–19 from 1 October. Google reads them from the home page's
 * structured data (Task 16.1) and from the Maps profile; change both together.
 */
export const STORE_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
export const STORE_HOURS = {
  summer: { opens: '12:00', closes: '20:00' }, // 1 April – 30 September
  winter: { opens: '11:00', closes: '19:00' }, // 1 October – 31 March
} as const;

export interface StoreHoursPeriod {
  from: string; // YYYY-MM-DD, first day
  through: string; // YYYY-MM-DD, last day
  opens: string;
  closes: string;
}

/** The hours that apply on `date` and the next ones, each with its dates. */
export function storeHoursPeriods(date: Date = new Date()): StoreHoursPeriod[] {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  const summer = (y: number) => ({ from: `${y}-04-01`, through: `${y}-09-30`, ...STORE_HOURS.summer });
  const winter = (y: number) => ({ from: `${y}-10-01`, through: `${y + 1}-03-31`, ...STORE_HOURS.winter });
  if (month >= 4 && month <= 9) return [summer(year), winter(year)];
  return month >= 10 ? [winter(year), summer(year + 1)] : [winter(year - 1), summer(year)];
}
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
