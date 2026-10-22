/**
 * Keeping the shop on a phone's home screen (Task 14.1): which way a phone does
 * it, and where the guide may offer itself. Pure, so the rules read in one place.
 */

/** How the shop gets onto this phone's home screen — each has its own steps. */
export type HomeScreenPlatform = 'android' | 'ios' | 'inapp';

/**
 * Instagram, Facebook and Messenger open links in their own browser, which has
 * no way to add a page to the home screen. Most visits come from posts, so
 * those visitors are first sent to Chrome or Safari.
 */
const IN_APP_BROWSER = /Instagram|FBAN|FBAV|FB_IAB|FBIOS|Messenger/i;

/**
 * Null on a computer: the guide is for phones. iPadOS reports itself as a Mac,
 * and only its touch points tell it apart.
 */
export function homeScreenPlatform(userAgent: string, maxTouchPoints = 0): HomeScreenPlatform | null {
  if (IN_APP_BROWSER.test(userAgent)) return 'inapp';
  if (/iPhone|iPad|iPod/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(userAgent)) return 'android';
  return null;
}

/** Never between a customer and an order, and not in the back office. */
const GUIDE_NEVER_ON = ['/admin', '/cart', '/checkout'];

export function guideAllowedOn(pathname: string): boolean {
  return !GUIDE_NEVER_ON.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

/** The guide offers itself from this page view of a visit on — never on the page someone landed on. */
export const GUIDE_FROM_PAGE = 2;

/** …and a moment after that page shows, not while it is still drawing. */
export const GUIDE_DELAY_MS = 1500;

/** "Not now" holds this long; the footer link opens the guide any time. */
export const GUIDE_SNOOZE_DAYS = 30;

/** The footer link asks the guide to open through this window event. */
export const GUIDE_OPEN_EVENT = 'marshal:home-screen-guide';
