/**
 * Замена: an exchange in the shop (Task 18.1, D-047, migration 025).
 *
 * The owner (2026-11-10): what the customer bought comes back to the shelf,
 * and the new pieces are recorded as sold on the day the returned one was
 * bought; one piece may be exchanged for two. No money is paid back, the
 * customer may only pay the difference.
 *
 * The owner (2026-11-11): the top-up belongs to the day of the exchange. So
 * the purchase day keeps what was paid on it: the new pieces are booked there
 * at that, spread over them by their prices, and the top-up is its own money
 * on the day it is paid (`exchanges.top_up_day`, which the sales screens add
 * in: `top-ups.ts`). When they cost less, nothing comes back. The database
 * does the booking (`exchange_apply`); `bookExchange` is the same arithmetic
 * for the screen, so the customer hears the top-up before anything is written.
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
  /** 'voucher' when a voucher's cards came back (026). */
  kind: 'exchange' | 'voucher';
  /** YYYY-MM-DD: the day the returned pieces were bought, and the new ones are sold on. */
  purchaseDay: string;
  returned: ExchangePiece[];
  given: ExchangeGivenPiece[];
  returnedTotal: number;
  givenTotal: number;
  /** Paid at the exchange. Never negative. */
  topUp: number;
  /** YYYY-MM-DD the top-up counts on as its own money; null when inside the prices (a voucher) or none. */
  topUpDay: string | null;
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
 * The booking `exchange_apply` writes (025).
 *
 * An exchange (`topUpApart`, the default) keeps the purchase day as it was:
 * what was paid then is spread over the new pieces by their prices, and the
 * top-up is its own money on the day of the exchange. A voucher (026) keeps
 * the top-up inside the prices: the new pieces at their own prices when they
 * cost more. Either way, when they cost less, what was paid is spread over
 * them and the rest is left behind.
 */
export function bookExchange(returned: number[], agreed: number[], topUpApart = true): Booking {
  const rc = returned.reduce((s, n) => s + cents(n), 0);
  const ac = agreed.map(cents);
  const gc = ac.reduce((s, n) => s + n, 0);
  const out = { returnedTotal: rc / 100, givenTotal: gc / 100 };
  if (gc === 0) return { ...out, prices: ac.map((c) => c / 100), topUp: 0, leftOver: 0 };
  return {
    ...out,
    prices: topUpApart || gc < rc ? spread(rc, ac) : ac.map((c) => c / 100),
    topUp: Math.max(0, gc - rc) / 100,
    leftOver: Math.max(0, rc - gc) / 100,
  };
}

/**
 * `exchange_spread`: totalCents over pieces by their prices (cents), largest
 * remainder first, in whole denars when the total is whole and no piece comes
 * out at nothing, otherwise in cents. BigInt, so a product of two large
 * amounts stays exact.
 */
function spread(totalCents: number, ac: number[]): number[] {
  const gc = BigInt(ac.reduce((s, n) => s + n, 0));
  let prices: number[] = [];
  for (const unit of totalCents % 100 === 0 ? [100, 1] : [1]) {
    const units = BigInt(totalCents / unit);
    const shares = ac.map((c, i) => ({ i, base: (BigInt(c) * units) / gc, rest: (BigInt(c) * units) % gc }));
    let left = units - shares.reduce((s, x) => s + x.base, BigInt(0));
    const bonus = new Array<number>(ac.length).fill(0);
    for (const x of [...shares].sort((a, b) => (b.rest > a.rest ? 1 : b.rest < a.rest ? -1 : a.i - b.i))) {
      if (left <= BigInt(0)) break;
      bonus[x.i] = 1;
      left -= BigInt(1);
    }
    prices = shares.map((x) => ((Number(x.base) + bonus[x.i]) * unit) / 100);
    if (prices.every((p) => p > 0)) break;
  }
  return prices;
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
export function firebaseSteps(
  x: Pick<Exchange, 'returned' | 'given' | 'purchaseDay' | 'topUp' | 'topUpDay'>,
  fmtDay: (d: string) => string,
  fmtPrice: (n: number) => string,
): string[] {
  const day = fmtDay(x.purchaseDay);
  return [
    ...x.returned.map((p) => `${pieceName(p)}: избриши ја продажбата од ${day} по ${fmtPrice(p.price)} и врати го парчето на залиха`),
    ...x.given.map((p) => `${pieceName(p)}: продажба на ${day} по ${fmtPrice(p.price)}`),
    // Firebase has no place for money without a piece; this app keeps it.
    ...(x.topUp > 0 && x.topUpDay
      ? [`Доплатата ${fmtPrice(x.topUp)} не се внесува во Firebase: запишана е тука, во продажбите на ${fmtDay(x.topUpDay)}`]
      : []),
  ];
}

/** An error from Supabase as the shop floor reads it. */
export function exchangeErrorMessage(
  err: { message?: string; hint?: string | null; code?: string; details?: string | null } | null | undefined,
  migration = '025',
): string {
  const hint = err?.hint ?? '';
  const what = err?.details ? ` (${err.details})` : '';
  switch (hint) {
    case 'day':
      return 'Денот на купување не може да е во иднина.';
    case 'invalid':
      return 'Не е исправно: секое парче мора да има цена (подарок не се заменува).';
    case 'missing':
      return 'Некој од производите не постои (можеби е избришан).';
    case 'voucher':
      return 'Ваучер не се заменува: се искористува во „Ваучери“.';
    case 'redeemed':
      return 'Ова е искористен ваучер: се поништува во „Ваучери“.';
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
    return `Ова чека миграција ${migration}.`;
  }
  return err?.message || 'Нешто не успеа. Обиди се повторно.';
}
