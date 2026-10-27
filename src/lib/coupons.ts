/**
 * Coupons (EPIC 13, Task 13.4, migration 016, D-032).
 *
 * Whether a coupon may be used at all — its window, how often, whose it is —
 * is answered by the database (`coupon_lookup`, and again under a lock by
 * `coupon_redeem`), so the basket and the order can never disagree. What it
 * takes off a basket is the basket arithmetic's call (`quoteBasket` in
 * loyalty.ts), within the limits. One coupon per order.
 *
 * Takes the Supabase client as an argument: the admin's browser client
 * creates and edits coupons (RLS, admin only), the server (service role)
 * looks them up, records a use and issues personal ones.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { BasketCoupon, CouponKind } from './loyalty';
import { DEFAULT_LANGUAGE, translate, type Language } from './i18n/messages';
import { formatDate, formatNumber, formatPrice } from './i18n/format';

export const COUPONS = 'coupons';
export const COUPON_REDEMPTIONS = 'coupon_redemptions';

export const COUPON_SOURCES = ['public', 'manual', 'welcome', 'birthday', 'wheel', 'abandoned'] as const;
export type CouponSource = (typeof COUPON_SOURCES)[number];

export const SOURCE_LABEL: Record<CouponSource, string> = {
  public: 'Јавен код',
  manual: 'Рачно доделен',
  welcome: 'Добредојде',
  birthday: 'Роденден',
  wheel: 'Тркало на среќа',
  abandoned: 'Напуштена кошничка',
};

export const KIND_LABEL: Record<CouponKind, string> = {
  percent: 'Попуст во %',
  fixed: 'Попуст во денари',
  free_shipping: 'Бесплатна достава',
};

export interface CouponRow {
  id: string;
  code: string;
  kind: CouponKind;
  value: number | string;
  max_discount: number | null;
  min_basket: number | null;
  starts_at: string;
  ends_at: string | null;
  max_uses: number | null;
  max_uses_per_user: number | null;
  user_id: string | null;
  include_categories: string[] | null;
  exclude_categories: string[] | null;
  include_products: string[] | null;
  exclude_products: string[] | null;
  source: CouponSource;
  active: boolean;
  note: string | null;
  created_at: string;
  updated_at: string;
}

export interface Coupon {
  id?: string;
  code: string;
  kind: CouponKind;
  value: number;
  maxDiscount?: number;
  minBasket?: number;
  startsAt: Date;
  endsAt?: Date;
  /** Across everyone; undefined = no limit. */
  maxUses?: number;
  /** Per customer; 1 = once, undefined = no limit. */
  maxUsesPerUser?: number;
  /** Personal coupon: only this account. */
  userId?: string;
  includeCategories: string[];
  excludeCategories: string[];
  includeProducts: string[];
  excludeProducts: string[];
  source: CouponSource;
  active: boolean;
  note?: string;
  createdAt?: Date;
}

const opt = <T>(v: T | null | undefined) => (v === null || v === undefined ? undefined : v);

export function rowToCoupon(r: CouponRow): Coupon {
  return {
    id: r.id,
    code: r.code,
    kind: r.kind,
    value: Number(r.value) || 0,
    maxDiscount: opt(r.max_discount),
    minBasket: opt(r.min_basket),
    startsAt: new Date(r.starts_at),
    endsAt: r.ends_at ? new Date(r.ends_at) : undefined,
    maxUses: opt(r.max_uses),
    maxUsesPerUser: opt(r.max_uses_per_user),
    userId: opt(r.user_id),
    includeCategories: r.include_categories ?? [],
    excludeCategories: r.exclude_categories ?? [],
    includeProducts: r.include_products ?? [],
    excludeProducts: r.exclude_products ?? [],
    source: r.source,
    active: r.active,
    note: opt(r.note),
    createdAt: new Date(r.created_at),
  };
}

function couponToRow(c: Coupon) {
  return {
    code: normalizeCode(c.code),
    kind: c.kind,
    value: c.kind === 'free_shipping' ? 0 : c.value,
    max_discount: c.kind === 'percent' ? c.maxDiscount ?? null : null,
    min_basket: c.minBasket ?? null,
    starts_at: c.startsAt.toISOString(),
    ends_at: c.endsAt ? c.endsAt.toISOString() : null,
    max_uses: c.maxUses ?? null,
    max_uses_per_user: c.maxUsesPerUser ?? null,
    user_id: c.userId ?? null,
    include_categories: c.includeCategories,
    exclude_categories: c.excludeCategories,
    include_products: c.includeProducts,
    exclude_products: c.excludeProducts,
    source: c.source,
    active: c.active,
    note: c.note?.trim() || null,
  };
}

/** The coupon as the basket arithmetic needs it. */
export function toBasketCoupon(c: Pick<Coupon, 'code' | 'kind' | 'value' | 'maxDiscount' | 'minBasket' | 'includeCategories' | 'excludeCategories' | 'includeProducts' | 'excludeProducts'>): BasketCoupon {
  return {
    code: c.code,
    kind: c.kind,
    value: c.value,
    maxDiscount: c.maxDiscount,
    minBasket: c.minBasket,
    includeCategories: c.includeCategories,
    excludeCategories: c.excludeCategories,
    includeProducts: c.includeProducts,
    excludeProducts: c.excludeProducts,
  };
}

// ---------------------------------------------------------------------------
// Codes
// ---------------------------------------------------------------------------

/** What the database accepts (the `coupons_code` check). */
export const CODE_PATTERN = /^[A-Z0-9-]{3,24}$/;

/** No 0/O, 1/I/L: a code read off a phone or a story should not be guessed at. */
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** "zima 10 " → "ZIMA-10". Spaces become dashes; anything else not allowed is dropped. */
export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '-').replace(/[^A-Z0-9-]/g, '');
}

/** A code nobody can guess, e.g. "MR-7K3QX9". */
export function generateCode(prefix = 'MR', length = 6): string {
  const bytes = new Uint8Array(length);
  globalThis.crypto.getRandomValues(bytes);
  const body = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  return `${normalizeCode(prefix)}-${body}`;
}

// ---------------------------------------------------------------------------
// What the customer reads
// ---------------------------------------------------------------------------

/** Why the database will not let this customer use this code. 'login': no account. */
export type CouponLookupRefusal = 'not_found' | 'inactive' | 'not_started' | 'expired' | 'not_yours' | 'used_up' | 'used' | 'login';

export function lookupRefusalText(r: CouponLookupRefusal, startsAt?: Date, lang: Language = DEFAULT_LANGUAGE): string {
  const say = (key: string, params?: Record<string, string>) => translate(lang, `coupon.refusal.${key}`, params);
  switch (r) {
    case 'not_found': return say('notFound');
    case 'inactive': return say('inactive');
    case 'not_started': return startsAt ? say('notStartedFrom', { date: formatDate(lang, startsAt) }) : say('notStarted');
    case 'expired': return say('expired');
    case 'not_yours': return say('notYours');
    case 'used_up': return say('usedUp');
    case 'used': return say('used');
    case 'login': return say('login');
  }
}

/** "−10% · најмногу 500 ден. · кошничка од 1.500 ден." — in the customer's words, without the internal note. */
export function describeCoupon(
  c: Pick<Coupon, 'kind' | 'value' | 'maxDiscount' | 'minBasket'>,
  scope?: string,
  lang: Language = DEFAULT_LANGUAGE,
): string {
  const price = (n: number) => formatPrice(lang, n);
  const parts = [
    c.kind === 'percent' ? `−${formatNumber(lang, c.value, 1)}%` : c.kind === 'fixed' ? `−${price(c.value)}` : translate(lang, 'coupon.freeShipping'),
    c.kind === 'percent' && c.maxDiscount ? translate(lang, 'coupon.atMost', { amount: price(c.maxDiscount) }) : null,
    c.minBasket ? translate(lang, 'coupon.minBasket', { amount: price(c.minBasket) }) : null,
    scope || null,
  ];
  return parts.filter(Boolean).join(' · ');
}

// ---------------------------------------------------------------------------
// Reading and writing
// ---------------------------------------------------------------------------

export interface CouponsRead<T> {
  data: T;
  /** Migration 016 has not run. */
  missingTable: boolean;
  error?: string;
}

function isMissing(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return ['42P01', 'PGRST205', 'PGRST202', '42883'].includes(err.code ?? '') ||
    /does not exist|schema cache|could not find the function/i.test(err.message ?? '');
}

export interface CouponWithUses extends Coupon {
  /** Uses that count: on orders that were not cancelled or refused. */
  uses: number;
}

/** Every coupon with how often it was used, newest first (admin). */
export async function fetchCoupons(sb: SupabaseClient): Promise<CouponsRead<CouponWithUses[]>> {
  const { data, error } = await sb.from(COUPONS).select('*').order('created_at', { ascending: false });
  if (error) return { data: [], missingTable: isMissing(error), error: error.message };
  const uses = new Map<string, number>();
  for (let from = 0; ; from += 1000) {
    const r = await sb.from(COUPON_REDEMPTIONS).select('coupon_id').is('released_at', null).range(from, from + 999);
    if (r.error) return { data: [], missingTable: isMissing(r.error), error: r.error.message };
    for (const row of (r.data ?? []) as Array<{ coupon_id: string }>) uses.set(row.coupon_id, (uses.get(row.coupon_id) ?? 0) + 1);
    if ((r.data ?? []).length < 1000) break;
  }
  return { data: ((data ?? []) as CouponRow[]).map((row) => ({ ...rowToCoupon(row), uses: uses.get(row.id) ?? 0 })), missingTable: false };
}

export interface Redemption {
  id: string;
  couponId: string;
  code: string;
  userId: string;
  orderId: string;
  orderNumber?: string;
  discount: number;
  shippingWaived: number;
  createdAt: Date;
  releasedAt?: Date;
}

export async function fetchRedemptions(sb: SupabaseClient, limit = 100): Promise<CouponsRead<Redemption[]>> {
  const { data, error } = await sb.from(COUPON_REDEMPTIONS).select('*').order('created_at', { ascending: false }).limit(limit);
  if (error) return { data: [], missingTable: isMissing(error), error: error.message };
  return {
    data: ((data ?? []) as Array<Record<string, string | number | null>>).map((r) => ({
      id: String(r.id),
      couponId: String(r.coupon_id),
      code: String(r.code),
      userId: String(r.user_id),
      orderId: String(r.order_id),
      orderNumber: r.order_number ? String(r.order_number) : undefined,
      discount: Number(r.discount) || 0,
      shippingWaived: Number(r.shipping_waived) || 0,
      createdAt: new Date(String(r.created_at)),
      releasedAt: r.released_at ? new Date(String(r.released_at)) : undefined,
    })),
    missingTable: false,
  };
}

/** The e-mails behind account ids, for the owner's screens. */
export async function fetchUserEmails(sb: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  if (ids.length === 0) return out;
  const { data } = await sb.rpc('admin_user_emails', { p_ids: ids });
  for (const r of (data ?? []) as Array<{ user_id: string; email: string }>) out.set(r.user_id, r.email);
  return out;
}

/** Problems the owner can fix in the form, before the database is asked. */
export function couponProblems(c: Coupon): string[] {
  const out: string[] = [];
  if (!CODE_PATTERN.test(normalizeCode(c.code))) out.push('Кодот треба да има 3 до 24 букви (латиница), бројки или цртички.');
  if (c.kind === 'percent' && !(c.value > 0 && c.value <= 100)) out.push('Процентот треба да е од 1 до 100.');
  if (c.kind === 'fixed' && !(c.value > 0)) out.push('Износот треба да е поголем од 0.');
  if (c.endsAt && c.endsAt <= c.startsAt) out.push('Крајот треба да е по почетокот.');
  if (c.maxUses !== undefined && !(Number.isInteger(c.maxUses) && c.maxUses > 0)) out.push('Вкупните користења треба да се цел број над 0, или празно.');
  if (c.maxUsesPerUser !== undefined && !(Number.isInteger(c.maxUsesPerUser) && c.maxUsesPerUser > 0)) out.push('Користењата по купувач треба да се цел број над 0, или празно.');
  if (c.includeCategories.some((k) => c.excludeCategories.includes(k))) out.push('Една категорија не може да е и „важи“ и „не важи“.');
  return out;
}

/** Insert or update (by id). The code and the owner of a personal coupon do not change once it exists. */
export async function saveCoupon(sb: SupabaseClient, c: Coupon): Promise<{ id?: string; error?: string }> {
  const problems = couponProblems(c);
  if (problems.length) return { error: problems.join(' ') };
  const row = couponToRow(c);
  const res = c.id
    ? await sb.from(COUPONS).update({ ...row, code: undefined, user_id: undefined }).eq('id', c.id).select('id').single()
    : await sb.from(COUPONS).insert(row).select('id').single();
  if (res.error) {
    if (/coupons_code_unique|duplicate key/i.test(res.error.message)) return { error: 'Тој код веќе постои. Избери друг.' };
    return { error: res.error.message };
  }
  return { id: (res.data as { id: string }).id };
}

export async function setCouponActive(sb: SupabaseClient, id: string, active: boolean): Promise<{ error?: string }> {
  const { error } = await sb.from(COUPONS).update({ active }).eq('id', id);
  return error ? { error: error.message } : {};
}

// Server (service role): the basket (13.7), the order outcome (13.8), and the
// sources that issue personal coupons — welcome (13.6), wheel (13.10), birthday (13.11).

export interface LookedUpCoupon extends Pick<Coupon, 'code' | 'kind' | 'value' | 'maxDiscount' | 'minBasket' | 'includeCategories' | 'excludeCategories' | 'includeProducts' | 'excludeProducts' | 'source' | 'endsAt'> {
  id: string;
  refusal?: CouponLookupRefusal;
}

export async function lookupCoupon(sb: SupabaseClient, code: string, userId: string | null): Promise<{ coupon?: LookedUpCoupon; refusal?: CouponLookupRefusal; error?: string }> {
  if (!userId) return { refusal: 'login' };
  const { data, error } = await sb.rpc('coupon_lookup', { p_code: normalizeCode(code), p_user: userId });
  if (error) return { error: error.message };
  const r = ((data ?? []) as Array<Record<string, unknown>>)[0];
  if (!r) return { refusal: 'not_found' };
  const coupon: LookedUpCoupon = {
    id: String(r.id),
    code: String(r.code),
    kind: r.kind as CouponKind,
    value: Number(r.value) || 0,
    maxDiscount: r.max_discount == null ? undefined : Number(r.max_discount),
    minBasket: r.min_basket == null ? undefined : Number(r.min_basket),
    endsAt: r.ends_at ? new Date(String(r.ends_at)) : undefined,
    includeCategories: (r.include_categories as string[]) ?? [],
    excludeCategories: (r.exclude_categories as string[]) ?? [],
    includeProducts: (r.include_products as string[]) ?? [],
    excludeProducts: (r.exclude_products as string[]) ?? [],
    source: r.source as CouponSource,
    refusal: (r.refusal as CouponLookupRefusal | null) ?? undefined,
  };
  return { coupon, refusal: coupon.refusal };
}

/** Record the use on the order. Checked again under a lock: the last use of a limited code goes to one order only. */
export async function redeemCoupon(sb: SupabaseClient, a: {
  code: string; userId: string; orderId: string; orderNumber: string; discount: number; shippingWaived: number;
}): Promise<{ id?: string; refusal?: CouponLookupRefusal; error?: string }> {
  const { data, error } = await sb.rpc('coupon_redeem', {
    p_code: normalizeCode(a.code), p_user: a.userId, p_order_id: a.orderId, p_order_number: a.orderNumber,
    p_discount: Math.max(0, Math.floor(a.discount)), p_shipping_waived: Math.max(0, Math.floor(a.shippingWaived)),
  });
  if (error) {
    const m = /coupon refused: (\w+)/.exec(error.message);
    return m ? { refusal: m[1] as CouponLookupRefusal } : { error: error.message };
  }
  return { id: data as string };
}

export async function releaseOrderCoupon(sb: SupabaseClient, orderId: string): Promise<{ released: number; error?: string }> {
  const { data, error } = await sb.rpc('coupon_release_order', { p_order_id: orderId });
  return error ? { released: 0, error: error.message } : { released: Number(data) || 0 };
}

/**
 * A personal coupon for one account, with a fresh code. A clash with an
 * existing code (one in a billion) is retried, not reported.
 */
export async function issuePersonalCoupon(sb: SupabaseClient, a: {
  userId: string; source: Exclude<CouponSource, 'public'>; kind: CouponKind; value: number;
  validHours: number; minBasket?: number; maxDiscount?: number; note?: string; prefix?: string;
}): Promise<{ id?: string; code?: string; error?: string }> {
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + a.validHours * 3_600_000);
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generateCode(a.prefix ?? 'MR');
    const r = await saveCoupon(sb, {
      code, kind: a.kind, value: a.value, maxDiscount: a.maxDiscount, minBasket: a.minBasket,
      startsAt, endsAt, maxUses: 1, maxUsesPerUser: 1, userId: a.userId,
      includeCategories: [], excludeCategories: [], includeProducts: [], excludeProducts: [],
      source: a.source, active: true, note: a.note,
    });
    if (r.id) return { id: r.id, code };
    if (!/код веќе постои/.test(r.error ?? '')) return { error: r.error };
  }
  return { error: 'Не успеав да направам единствен код.' };
}
