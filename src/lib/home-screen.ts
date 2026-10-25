/**
 * Keeping the shop on a phone's home screen (Task 14.1, 14.4): which way a phone
 * does it, and where the guide may offer itself. Pure, so the rules read in one place.
 */

/**
 * How the shop gets onto this phone's home screen — each has its own steps.
 * An iPhone's depends on the browser and, in Safari, on its version: Safari
 * moved Share twice (Apple's iPhone User Guide, "Turn a website into an app"):
 * - up to 18, Share is a button in the bar at the bottom;
 * - 26 put it under ⋯ ("More"), beside the address;
 * - 27 under the page menu (three lines), left of the address, the ⋯ on the
 *   right having become the tabs button.
 * In both, with the Tabs layout set to Bottom or Top, Share is still a button.
 */
export type HomeScreenWay = 'android' | 'inapp' | 'safari-18' | 'safari-26' | 'safari-27' | 'ios-chrome' | 'ios-other';

/**
 * Instagram, Facebook and Messenger open links in their own browser, which has
 * no way to add a page to the home screen. Most visits come from posts, so
 * those visitors are first sent to Chrome or Safari.
 */
const IN_APP_BROWSER = /Instagram|FBAN|FBAV|FB_IAB|FBIOS|Messenger/i;

/** Browsers on an iPhone other than Safari and Chrome: Firefox, Edge, Opera, DuckDuckGo. */
const IOS_OTHER = /FxiOS|EdgiOS|OPiOS|OPT\/|DuckDuckGo|Ddg\//i;

/**
 * Null on a computer: the guide is for phones. iPadOS reports itself as a Mac,
 * and only its touch points tell it apart.
 */
export function homeScreenWay(userAgent: string, maxTouchPoints = 0): HomeScreenWay | null {
  if (IN_APP_BROWSER.test(userAgent)) return 'inapp';
  if (/iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)) return iosWay(userAgent);
  if (/Android/i.test(userAgent)) return 'android';
  return null;
}

/**
 * Safari 26 froze the iOS version in its user agent (18_6, later 18_7), but
 * `Version/` still carries Safari's own, and Safari's follows iOS.
 */
function iosWay(userAgent: string): HomeScreenWay {
  if (/CriOS/i.test(userAgent)) return 'ios-chrome';
  if (IOS_OTHER.test(userAgent)) return 'ios-other';
  const safari = Number(userAgent.match(/Version\/(\d+)/)?.[1]);
  if (!safari) return 'ios-other';
  if (safari >= 27) return 'safari-27';
  if (safari >= 26) return 'safari-26';
  return 'safari-18';
}

/** Never between a customer and an order, and not in the back office. */
const GUIDE_NEVER_ON = ['/admin', '/cart', '/checkout'];

export function guideAllowedOn(pathname: string): boolean {
  return !GUIDE_NEVER_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/**
 * The guide offers itself once on a phone (14.4), from this page view of a
 * visit on — never on the page someone landed on. After that, only the footer
 * link opens it.
 */
export const GUIDE_FROM_PAGE = 2;

/** …and a moment after that page shows, not while it is still drawing. */
export const GUIDE_DELAY_MS = 1500;

/** The footer link asks the guide to open through this window event. */
export const GUIDE_OPEN_EVENT = 'marshal:home-screen-guide';
