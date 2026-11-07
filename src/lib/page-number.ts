/**
 * ?page=N on a listing (Task 16.2, 16.3). Page 2 holds other products than
 * page 1, so it keeps its own canonical (pointed at page 1 it would ask Google
 * to drop them) and its title says which page it is.
 */

/** ?page=N as a whole number from 1; anything else is page 1. */
export function pageOf(value: string | string[] | undefined): number {
  const n = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : 1;
  return n >= 1 ? n : 1;
}

/** "Машки кошули · страна 2" from page 2 on. */
export function onPage(title: string, page: number): string {
  return page > 1 ? `${title} · страна ${page}` : title;
}

/** The address with its page from page 2 on: /new?page=2, /mens/knitwear?type=rolki&page=2. */
export function withPage(href: string, page: number): string {
  return page > 1 ? `${href}${href.includes('?') ? '&' : '?'}page=${page}` : href;
}
