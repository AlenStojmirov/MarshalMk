/**
 * The basket on the server (Task 13.7, D-031, D-032). Server only: it reads
 * purchase prices with the service role.
 *
 * Prices come from the database, never from the browser: before this task the
 * order route took each item's price from the request, so anyone could order
 * at a price they typed. The same function prices the checkout's preview and
 * the order itself, so what the customer was shown and what is booked cannot
 * disagree.
 *
 * Coupons and points belong to a member only: a signed-in customer with a
 * confirmed e-mail and a profile (D-033). Anyone else — a guest, a back-office
 * account — gets the plain basket, and is shown what a member would earn.
 */

import type { SupabaseClient, User } from '@supabase/supabase-js';
import type { DeliveryMethod, Product } from '@/types';
import { ProductRow, rowToProduct } from './db-mappers';
import { getEffectivePrice } from './pricing';
import { BasketCoupon, BasketLine, BasketQuote, couponRefusalText, pointsRefusalText, quoteBasket } from './loyalty';
import { LoyaltySettings, fetchLoyaltySettings } from './loyalty-settings';
import { describeCoupon, lookupCoupon, lookupRefusalText, toBasketCoupon } from './coupons';
import { fetchPointsMovements, summarizePoints } from './points';
import { isBackOffice, roleOf } from './roles';
import { DEFAULT_LANGUAGE, translate, type Language } from './i18n/messages';

export interface CartLineInput {
  productId: string;
  size: string | null;
  quantity: number;
}

/** The cart as sent by the browser: ids, sizes and quantities. Anything else in it is ignored. */
export function cleanCartLines(raw: unknown): CartLineInput[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > 100) return null;
  const out: CartLineInput[] = [];
  for (const r of raw) {
    const o = r as Record<string, unknown>;
    if (typeof o?.productId !== 'string' || !o.productId) return null;
    const q = Number(o.quantity);
    if (!Number.isInteger(q) || q < 1 || q > 999) return null;
    out.push({ productId: o.productId, size: typeof o.size === 'string' && o.size ? o.size : null, quantity: q });
  }
  return out;
}

export interface BasketProduct {
  product: Product;
  cost?: number;
}

export async function readBasketProducts(sb: SupabaseClient, ids: string[]): Promise<Map<string, BasketProduct>> {
  const unique = [...new Set(ids)];
  const [products, costs] = await Promise.all([
    sb.from('products').select('*').in('id', unique),
    sb.from('product_costs').select('product_id, purchase_price').in('product_id', unique),
  ]);
  if (products.error) throw new Error(products.error.message);
  const cost = new Map(((costs.data ?? []) as Array<{ product_id: string; purchase_price: number | string }>)
    .map((c) => [c.product_id, Number(c.purchase_price)]));
  return new Map(((products.data ?? []) as ProductRow[]).map((row) => {
    const product = rowToProduct(row);
    const c = cost.get(product.id);
    return [product.id, { product, cost: c !== undefined && Number.isFinite(c) && c > 0 ? c : undefined }];
  }));
}

/** May this account use coupons and points? Only a customer with a confirmed e-mail and a profile. */
export async function loyaltyMember(sb: SupabaseClient, user: User | null): Promise<string | null> {
  if (!user || !user.email_confirmed_at || isBackOffice(roleOf(user))) return null;
  const { data } = await sb.from('customers').select('user_id').eq('user_id', user.id).maybeSingle();
  return data ? user.id : null;
}

/** The signed-in user behind a request's access token, or null. Never fails a request. */
export async function userFromRequest(sb: SupabaseClient, authorization: string | null): Promise<User | null> {
  const token = authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data } = await sb.auth.getUser(token);
  return data.user ?? null;
}

export interface ServerQuote {
  quote: BasketQuote;
  products: Map<string, BasketProduct>;
  /** Ids in the cart that are gone or hidden: an order with them is refused. */
  unavailable: string[];
  /** The account id when coupons and points apply, else null. */
  memberId: string | null;
  settings: LoyaltySettings;
  coupon?: { code: string; applied: boolean; message?: string; description?: string };
  pointsMessage?: string;
}

export async function quoteServer(sb: SupabaseClient, a: {
  /** The language the messages are in: the request's (D-039). */
  lang?: Language;
  lines: CartLineInput[];
  method: DeliveryMethod;
  couponCode?: string;
  pointsRequested?: number;
  user: User | null;
}): Promise<ServerQuote> {
  const [{ settings }, products, memberId] = await Promise.all([
    fetchLoyaltySettings(sb),
    readBasketProducts(sb, a.lines.map((l) => l.productId)),
    loyaltyMember(sb, a.user),
  ]);

  const unavailable = a.lines.filter((l) => {
    const p = products.get(l.productId)?.product;
    return !p || p.isVisible === false;
  }).map((l) => l.productId);
  const basketLines: BasketLine[] = a.lines
    .filter((l) => !unavailable.includes(l.productId))
    .map((l) => {
      const { product, cost } = products.get(l.productId)!;
      return { productId: l.productId, category: product.category, quantity: l.quantity, regularPrice: product.price, price: getEffectivePrice(product), cost };
    });

  let balance = 0;
  if (memberId) {
    const moves = await fetchPointsMovements(sb, memberId);
    balance = summarizePoints(moves.data, new Date()).active;
  }

  const lang = a.lang ?? DEFAULT_LANGUAGE;
  let coupon: ServerQuote['coupon'];
  let basketCoupon: BasketCoupon | undefined;
  const code = a.couponCode?.trim();
  if (code) {
    if (!memberId) coupon = { code, applied: false, message: lookupRefusalText('login', undefined, lang) };
    else {
      const r = await lookupCoupon(sb, code, memberId);
      if (r.error) coupon = { code, applied: false, message: translate(lang, 'errors.api.cart.couponCheck') };
      else if (r.refusal || !r.coupon) coupon = { code, applied: false, message: lookupRefusalText(r.refusal ?? 'not_found', undefined, lang) };
      else basketCoupon = toBasketCoupon(r.coupon);
    }
  }

  const quote = quoteBasket({
    lines: basketLines,
    method: a.method,
    settings,
    coupon: basketCoupon,
    pointsBalance: balance,
    pointsRequested: memberId ? a.pointsRequested : 0,
  });

  if (basketCoupon && quote.coupon) {
    coupon = quote.coupon.applied
      ? { code: basketCoupon.code, applied: true, description: describeCoupon(basketCoupon, undefined, lang) }
      : { code: basketCoupon.code, applied: false, message: couponRefusalText(quote.coupon.refusal!, basketCoupon, lang) };
  }
  const pointsMessage = memberId && quote.points.refusal ? pointsRefusalText(quote.points.refusal, settings, lang) : undefined;

  return { quote, products, unavailable, memberId, settings, coupon, pointsMessage };
}
