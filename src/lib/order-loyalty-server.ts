/**
 * Points and coupons follow the order (Task 13.8, D-032). Server only.
 *
 * The staff mark an order delivered, refused or cancelled from their phone;
 * the points functions answer only the admin and the server. So after every
 * change the screen asks the server to bring the loyalty side in line with
 * the order as it now stands. That is a sync, not an event: it reads the order
 * and the points rows and does what is missing, so running it twice, late or
 * after a dropped connection is safe.
 *
 *   cancelled (refused, returned, not collected, or cancelled by the shop)
 *     → the order's earnings are voided, the points it spent come back,
 *       its coupon use is released
 *   delivered and paid
 *     → its earnings and the account's pending bonuses wait `pendingDays`
 *       from that day, then count for `expiryMonths`; the phone on the
 *       account is confirmed if the order went to it
 *   back from cancelled (a mistake undone)
 *     → the points and the coupon are taken again where they still can be,
 *       and the earnings credited again; what cannot is reported, not forced
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { OrderRow } from './db-mappers';
import { normalizePhone } from './customers';
import { fetchLoyaltySettings } from './loyalty-settings';
import { PointsRow, activateLot, cancelOrderPoints, creditPoints, expiryFor, redeemPoints } from './points';
import { redeemCoupon, releaseOrderCoupon } from './coupons';
import { SHIPPING_CONFIG } from '@/config/shipping';

export type OrderLoyaltyState = 'open' | 'delivered' | 'cancelled';

/** Where an order stands, read the way the customers screen reads it (outcomeOf, D-014). */
export function loyaltyState(o: Pick<OrderRow, 'status' | 'outcome'>): OrderLoyaltyState {
  if (o.status === 'cancelled' || (o.outcome && o.outcome !== 'delivered')) return 'cancelled';
  if (o.outcome === 'delivered' || o.status === 'delivered') return 'delivered';
  return 'open';
}

export interface SyncResult {
  orderNumber: string;
  state: OrderLoyaltyState | 'guest';
  /** What this run changed, in the owner's words. Empty: already in line. */
  done: string[];
  /** What could not be done and needs a look. */
  problems: string[];
}

const DAY = 86_400_000;

export async function syncOrderLoyalty(sb: SupabaseClient, orderId: string): Promise<SyncResult> {
  const { data, error } = await sb.from('orders').select('*').eq('id', orderId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error('Нарачката не постои.');
  const order = data as OrderRow;
  const userId = order.customer?.userId;
  const res: SyncResult = { orderNumber: order.order_number, state: userId ? loyaltyState(order) : 'guest', done: [], problems: [] };
  if (!userId) return res;

  if (res.state === 'cancelled') {
    const p = await cancelOrderPoints(sb, order.id);
    if (p.error) res.problems.push(`Поени: ${p.error}`);
    else {
      if (p.voided) res.done.push(`одземени ${p.voided} заработени поени`);
      if (p.returned) res.done.push(`вратени ${p.returned} потрошени поени`);
    }
    const c = await releaseOrderCoupon(sb, order.id);
    if (c.error) res.problems.push(`Купон: ${c.error}`);
    else if (c.released) res.done.push('купонот е ослободен');
    return res;
  }

  // Open or delivered: first undo a cancellation that was itself undone.
  const { data: rowsData, error: rowsErr } = await sb.from('points_ledger').select('*').eq('order_id', order.id);
  if (rowsErr) throw new Error(rowsErr.message);
  const rows = (rowsData ?? []) as PointsRow[];
  const loyalty = order.customer.loyalty ?? {};

  const spentNow = rows.filter((r) => r.kind === 'redeem' && !r.reversed_at).reduce((a, r) => a + r.points, 0);
  if ((loyalty.pointsUsed ?? 0) > spentNow) {
    const r = await redeemPoints(sb, userId, (loyalty.pointsUsed ?? 0) - spentNow, order.id, order.order_number);
    if (r.error) res.problems.push(`Поените (${loyalty.pointsUsed}) не можат повторно да се земат: купувачот веќе ги нема. Нарачката е со попустот од нив.`);
    else res.done.push(`повторно земени ${(loyalty.pointsUsed ?? 0) - spentNow} поени`);
  }
  if (loyalty.couponCode) {
    const { data: use } = await sb.from('coupon_redemptions').select('id').eq('order_id', order.id).is('released_at', null).maybeSingle();
    if (!use) {
      const r = await redeemCoupon(sb, {
        code: loyalty.couponCode, userId, orderId: order.id, orderNumber: order.order_number,
        discount: loyalty.couponDiscount ?? 0, shippingWaived: loyalty.shippingWaived ? SHIPPING_CONFIG.shippingCost : 0,
      });
      if (r.refusal || r.error) res.problems.push(`Купонот ${loyalty.couponCode} не може повторно да се земе (${r.refusal ?? r.error}). Нарачката е со неговиот попуст.`);
      else res.done.push(`купонот ${loyalty.couponCode} е повторно земен`);
    }
  }
  // Earnings voided by the cancellation: credit them again, pending.
  const voided = new Set(rows.filter((r) => r.kind === 'cancel').map((r) => r.related_id));
  const earnLive = rows.filter((r) => r.kind === 'earn' && !voided.has(r.id));
  if ((loyalty.pointsEarned ?? 0) > 0 && earnLive.length === 0) {
    const r = await creditPoints(sb, { userId, kind: 'earn', points: loyalty.pointsEarned!, orderId: order.id, orderNumber: order.order_number });
    if (r.error) res.problems.push(`Заработените поени не се запишани: ${r.error}`);
    else {
      res.done.push(`повторно запишани ${loyalty.pointsEarned} заработени поени`);
      earnLive.push({ id: r.id!, kind: 'earn', available_at: null, remaining: loyalty.pointsEarned! } as PointsRow);
    }
  }

  if (res.state !== 'delivered') return res;

  // Delivered and paid: the waiting period starts on that day.
  const { settings } = await fetchLoyaltySettings(sb);
  const paidAt = new Date(order.outcome_at ?? order.updated_at ?? Date.now());
  const availableAt = new Date(paidAt.getTime() + settings.pendingDays * DAY);
  const expiresAt = expiryFor('earn', availableAt, settings);

  for (const lot of earnLive.filter((r) => !r.available_at && (r.remaining ?? 0) > 0)) {
    const r = await activateLot(sb, lot.id, availableAt, expiresAt);
    if (r.error) res.problems.push(`Поените од нарачката не се активирани: ${r.error}`);
    else if (r.activated) res.done.push(`${lot.remaining} поени стануваат активни на ${availableAt.toLocaleDateString('mk-MK')}`);
  }

  // Bonuses wait for the first paid order (D-032), then follow the same dates.
  const { data: bonusData } = await sb.from('points_ledger').select('id, remaining')
    .eq('user_id', userId).eq('kind', 'bonus').is('available_at', null).gt('remaining', 0);
  for (const lot of (bonusData ?? []) as Array<{ id: string; remaining: number }>) {
    const r = await activateLot(sb, lot.id, availableAt, expiresAt);
    if (r.error) res.problems.push(`Бонусот не е активиран: ${r.error}`);
    else if (r.activated) res.done.push(`бонус ${lot.remaining} поени, активен на ${availableAt.toLocaleDateString('mk-MK')}`);
  }

  // The phone is confirmed by an order to it that was delivered and paid (D-033).
  const { data: confirmed } = await sb.from('customers')
    .update({ phone_verified_at: paidAt.toISOString() })
    .eq('user_id', userId).eq('phone_norm', normalizePhone(order.customer.phone)).is('phone_verified_at', null)
    .select('user_id');
  if (confirmed && confirmed.length) res.done.push('телефонот на профилот е потврден');

  return res;
}

/** Every order placed with an account, in line again. For the owner's "sync all". */
export async function syncAllOrderLoyalty(sb: SupabaseClient): Promise<SyncResult[]> {
  const out: SyncResult[] = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await sb.from('orders').select('id').not('customer->>userId', 'is', null)
      .order('created_at', { ascending: true }).range(from, from + 499);
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as Array<{ id: string }>) out.push(await syncOrderLoyalty(sb, row.id));
    if ((data ?? []).length < 500) break;
  }
  return out;
}
