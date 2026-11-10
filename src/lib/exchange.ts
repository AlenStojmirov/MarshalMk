/**
 * Замена: an exchange in the shop (Task 18.1, D-047, migration 025).
 *
 * The owner (2026-11-10): what the customer bought comes back to the shelf,
 * and the new pieces are recorded as sold on the day the returned one was
 * bought; one piece may be exchanged for two. No money is paid back, the
 * customer may only pay the difference.
 *
 * So the new pieces are booked together at what was paid then plus the top-up
 * paid now. When they cost less, nothing comes back, and what was paid is
 * spread over them by their prices. The database does the booking
 * (`exchange_make`); `bookExchange` is the same arithmetic for the screen, so
 * the customer hears the top-up before anything is written.
 *
 * Pure: no database, no browser.
 */

/** Never exchanged here: a voucher is redeemed, not exchanged (D-047). */
export const NOT_EXCHANGED: ReadonlySet<string> = new Set(['vaucer']);

/** One returned piece: a sale as `sold[]` holds it. */
export interface ReturnedPiece {
  productId: string;
  size: string;
  /** What was paid for it. */
  price: number;
}

/** One new piece, at the price asked for it today. */
export interface GivenPiece {
  productId: string;
  size: string;
  agreed: number;
}

/** A piece as an exchange keeps it. */
export interface ExchangePiece {
  productId: string;
  name: string;
  category: string;
  size: string;
  /** Returned: what was paid. Given: what it is booked at. */
  price: number;
}

export interface ExchangeGivenPiece extends ExchangePiece {
  /** The price asked for it on the day of the exchange. */
  agreed: number;
  /** Its tag price then. */
  list: number;
}

export interface Exchange {
  id: number;
  madeAt: string;
  madeBy: string | null;
  /** YYYY-MM-DD: the day the returned pieces were bought, and the new ones are sold on. */
  purchaseDay: string;
  returned: ExchangePiece[];
  given: ExchangeGivenPiece[];
  returnedTotal: number;
  givenTotal: number;
  /** Paid at the exchange. Never negative. */
  topUp: number;
  channel: 'store' | 'online';
  orderNumber: string | null;
  note: string | null;
  undoneAt: string | null;
  undoneBy: string | null;
}

export interface Booking {
  returnedTotal: number;
  givenTotal: number;
  /** What each new piece is booked at, in the order given. */
  prices: number[];
  /** Paid now. */
  topUp: number;
  /** What the customer leaves behind when the new pieces cost less. */
  leftOver: number;
}

const cents = (n: number) => Math.round((Number(n) || 0) * 100);

/**
 * The booking `exchange_make` writes (025): the new pieces at their own prices
 * when they cost at least what was paid, the difference paid now; otherwise
 * what was paid, spread over them by price, largest remainder first, in whole
 * denars when what was paid is whole.
 */
export function bookExchange(returned: number[], agreed: number[]): Booking {
  const rc = returned.reduce((s, n) => s + cents(n), 0);
  const ac = agreed.map(cents);
  const gc = ac.reduce((s, n) => s + n, 0);
  const out = { returnedTotal: rc / 100, givenTotal: gc / 100 };

  if (gc >= rc || gc === 0) {
    return { ...out, prices: ac.map((c) => c / 100), topUp: Math.max(0, gc - rc) / 100, leftOver: 0 };
  }

  const unit = rc % 100 === 0 ? 100 : 1;
  const units = rc / unit;
  const shares = ac.map((c, i) => ({ i, base: Math.floor((c * units) / gc), rest: (c * units) % gc }));
  let left = units - shares.reduce((s, x) => s + x.base, 0);
  const bonus = new Array<number>(ac.length).fill(0);
  for (const x of [...shares].sort((a, b) => b.rest - a.rest || a.i - b.i)) {
    if (left <= 0) break;
    bonus[x.i] = 1;
    left -= 1;
  }
  return {
    ...out,
    prices: shares.map((x) => ((x.base + bonus[x.i]) * unit) / 100),
    topUp: 0,
    leftOver: (rc - gc) / 100,
  };
}

/** Whole days from a purchase to today, both YYYY-MM-DD. */
export function daysSince(day: string, today: string): number {
  const ms = Date.parse(today.slice(0, 10) + 'T00:00:00Z') - Date.parse(day.slice(0, 10) + 'T00:00:00Z');
  return Math.round(ms / 86_400_000);
}

/** The key a sale is found by, as the database finds it: trimmed size, price to the cent, day. */
export const saleKey = (size: string, price: number, day: string) =>
  `${String(size ?? '').trim()}|${cents(price)}|${String(day).slice(0, 10)}`;

const pieceName = (p: ExchangePiece) => `${p.name}${p.size ? ' ' + p.size : ''}`;

/**
 * What to enter in Firebase so its next Sync All agrees with the exchange,
 * while Firebase is still where stock comes from (FIREBASE_SYNC_LIVE).
 * The same day and the same prices, or the sync puts the old sale back.
 */
export function firebaseSteps(x: Pick<Exchange, 'returned' | 'given' | 'purchaseDay'>, fmtDay: (d: string) => string, fmtPrice: (n: number) => string): string[] {
  const day = fmtDay(x.purchaseDay);
  return [
    ...x.returned.map((p) => `${pieceName(p)}: избриши ја продажбата од ${day} по ${fmtPrice(p.price)} и врати го парчето на залиха`),
    ...x.given.map((p) => `${pieceName(p)}: продажба на ${day} по ${fmtPrice(p.price)}`),
  ];
}

/** An error from Supabase as the shop floor reads it. */
export function exchangeErrorMessage(err: { message?: string; hint?: string | null; code?: string; details?: string | null } | null | undefined): string {
  const hint = err?.hint ?? '';
  const what = err?.details ? ` (${err.details})` : '';
  switch (hint) {
    case 'day':
      return 'Денот на купување не може да е во иднина.';
    case 'invalid':
      return 'Замената не е исправна: секое ново парче мора да има цена.';
    case 'missing':
      return 'Некој од производите не постои (можеби е избришан).';
    case 'voucher':
      return 'Ваучер не се заменува.';
    case 'nosale':
      return `Таа продажба веќе ја нема во системот${what}: можеби е вратена или сменета. Освежи ја страната.`;
    case 'short':
      return `Новото парче го нема на залиха${what}: можеби е продадено или резервирано со онлајн нарачка.`;
    case 'nothing':
      return 'Таа замена не постои.';
    case 'undone':
      return 'Замената е веќе поништена.';
    case 'gone':
      return `Новото парче веќе не е запишано како продадено${what}: вратено или сменето по замената.`;
    case 'resold':
      return `Вратеното парче го нема на залиха${what}: продадено е повторно.`;
  }
  if (err?.code === '42501') return 'Немаш право за ова.';
  if (err?.code === 'PGRST202' || /could not find the function/i.test(err?.message ?? '')) {
    return 'Замената чека миграција 025.';
  }
  return err?.message || 'Нешто не успеа. Обиди се повторно.';
}
