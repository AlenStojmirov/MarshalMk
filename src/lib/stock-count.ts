/**
 * The stock count, попис (Tasks 17.2–17.3, migration 024, D-046).
 *
 * The owner (2026-11-09): the warehouse goes product by product, confirms the
 * numbers that are right and corrects the ones that are not; the admin sees
 * which products are wrong and fixes them. A count is finished when every
 * product on its list has been counted.
 *
 * The list is every product with stock when the admin starts the count. The
 * counter sees what the system holds and keeps it, or types what is really
 * there. A line remembers both. The admin applies the difference, never the
 * counted number: whatever sold between the count and the fix stays sold.
 *
 * Pure: no database, no browser. The database side is in
 * supabase/migrations/024_stock_count.sql, and `countMap` mirrors its
 * `stock_count_map`, so the screen and the database agree on what matches.
 */

import type { OrderStatus, ProductSize } from '@/types';

export interface CountSize {
  size: string;
  quantity: number;
}

export interface StockCount {
  id: number;
  startedAt: string;
  startedBy: string | null;
  note: string | null;
  closedAt: string | null;
  closedBy: string | null;
}

export type Resolution = 'applied' | 'dismissed';

export interface CountLine {
  countId: number;
  productId: string;
  /** On the list when the count started. False: found on the shelf, added when counted. */
  listed: boolean;
  /** What the shelf should have held when it was counted: the sizes plus what open orders hold. */
  expected: CountSize[] | null;
  counted: CountSize[] | null;
  matches: boolean | null;
  countedAt: string | null;
  countedBy: string | null;
  resolution: Resolution | null;
  /** What applying changed on the shelf. Less than the difference when a size could not go below zero. */
  applied: { size: string; change: number }[] | null;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

/**
 * Orders whose goods are still in the shop. The shelf numbers already lost
 * them (an order reserves at checkout, stock.ts), but the pieces are only
 * gone once handed to the courier or the customer. A counter finds them, so
 * the count expects them.
 */
export const HOLDING_STATUSES: readonly OrderStatus[] = ['pending', 'confirmed', 'processing'];

/**
 * Firebase is still where stock comes from until the switchover day: every
 * Sync All writes its numbers over these. A correction applied here then
 * lasts only until the next sync, unless it is made in Firebase too. Set to
 * false on the switchover day (Trello "🔁 Денот на преминот").
 */
export const FIREBASE_SYNC_LIVE = true;

const label = (s: string | null | undefined) => String(s ?? '').trim();
const units = (n: unknown) => Math.max(0, Math.trunc(Number(n) || 0));

export interface HoldingOrder {
  orderNumber: string;
  status: OrderStatus;
  items: { productId: string; size?: string; quantity: number }[];
}

export interface Held {
  quantity: number;
  orders: string[];
}

/** Per size: the units open orders hold of this product, and which orders. */
export function heldByOrders(productId: string, orders: HoldingOrder[]): Map<string, Held> {
  const out = new Map<string, Held>();
  for (const o of orders) {
    if (!HOLDING_STATUSES.includes(o.status)) continue;
    for (const it of o.items ?? []) {
      if (it.productId !== productId) continue;
      const k = label(it.size);
      const h = out.get(k) ?? { quantity: 0, orders: [] };
      h.quantity += units(it.quantity);
      if (!h.orders.includes(o.orderNumber)) h.orders.push(o.orderNumber);
      out.set(k, h);
    }
  }
  return out;
}

/**
 * What should be on the shelf: each size's number plus what open orders hold,
 * in the shelf's own order. A product without sizes keeps its stock in
 * `stock`, counted under the size ''.
 */
export function expectedOnShelf(
  sizes: Pick<ProductSize, 'size' | 'quantity'>[] | null | undefined,
  stock: number | null | undefined,
  held: Map<string, Held> = new Map(),
): CountSize[] {
  const list = sizes ?? [];
  if (list.length === 0) {
    return [{ size: '', quantity: units(stock) + (held.get('')?.quantity ?? 0) }];
  }
  const out: CountSize[] = [];
  for (const s of list) {
    const k = label(s.size);
    const at = out.find((x) => x.size === k);
    if (at) at.quantity += units(s.quantity);
    else out.push({ size: k, quantity: units(s.quantity) + (held.get(k)?.quantity ?? 0) });
  }
  for (const [k, h] of held) {
    if (!out.some((x) => x.size === k)) out.push({ size: k, quantity: h.quantity });
  }
  return out;
}

/** {size: units}, sizes trimmed, the same size added up, zeros dropped (= SQL stock_count_map). */
export function countMap(list: CountSize[] | null | undefined): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of list ?? []) {
    const k = label(s.size);
    m.set(k, (m.get(k) ?? 0) + (Number(s.quantity) || 0));
  }
  for (const [k, v] of m) if (v === 0) m.delete(k);
  return m;
}

export function sameCount(a: CountSize[] | null | undefined, b: CountSize[] | null | undefined): boolean {
  const x = countMap(a);
  const y = countMap(b);
  if (x.size !== y.size) return false;
  for (const [k, v] of x) if (y.get(k) !== v) return false;
  return true;
}

export interface SizeDiff {
  size: string;
  expected: number;
  counted: number;
  change: number;
}

/** Size by size, in the order expected then counted lists them. */
export function countDiff(expected: CountSize[] | null | undefined, counted: CountSize[] | null | undefined): SizeDiff[] {
  const x = countMap(expected);
  const y = countMap(counted);
  const order: string[] = [];
  for (const s of [...(expected ?? []), ...(counted ?? [])]) {
    const k = label(s.size);
    if (!order.includes(k)) order.push(k);
  }
  return order.map((size) => {
    const e = x.get(size) ?? 0;
    const c = y.get(size) ?? 0;
    return { size, expected: e, counted: c, change: c - e };
  });
}

/** Units missing (counted below the system) and extra (above), over the sizes of one line. */
export function lineShortExtra(line: Pick<CountLine, 'expected' | 'counted'>): { short: number; extra: number } {
  let short = 0;
  let extra = 0;
  for (const d of countDiff(line.expected, line.counted)) {
    if (d.change < 0) short -= d.change;
    else extra += d.change;
  }
  return { short, extra };
}

export type LineStatus = 'pending' | 'ok' | 'diff' | 'applied' | 'dismissed';

export function lineStatus(l: Pick<CountLine, 'countedAt' | 'matches' | 'resolution'>): LineStatus {
  if (!l.countedAt) return 'pending';
  if (l.resolution) return l.resolution;
  return l.matches ? 'ok' : 'diff';
}

export interface CountProgress {
  /** Products on the list. */
  listed: number;
  /** Of them, counted. */
  counted: number;
  /** Counted, not on the list: found on the shelf. */
  found: number;
  ok: number;
  /** Differences waiting for the admin. */
  open: number;
  applied: number;
  dismissed: number;
  /** Every product on the list counted. */
  complete: boolean;
  /** Complete, and no difference waiting. */
  closable: boolean;
}

export function countProgress(lines: CountLine[]): CountProgress {
  const p = { listed: 0, counted: 0, found: 0, ok: 0, open: 0, applied: 0, dismissed: 0 };
  for (const l of lines) {
    if (l.listed) p.listed += 1;
    const st = lineStatus(l);
    if (st === 'pending') continue;
    if (l.listed) p.counted += 1;
    else p.found += 1;
    if (st === 'ok') p.ok += 1;
    else if (st === 'diff') p.open += 1;
    else if (st === 'applied') p.applied += 1;
    else p.dismissed += 1;
  }
  const complete = p.counted === p.listed;
  return { ...p, complete, closable: complete && p.open === 0 };
}

/** What the database said, in words the shop floor reads. */
export function countErrorMessage(err: { message?: string; hint?: string | null; code?: string } | null | undefined): string {
  const hint = err?.hint ?? '';
  switch (hint) {
    case 'stale':
      return 'Залихата се смени додека бројше (продажба, нарачка или измена). Бројките се освежени: провери ги повторно.';
    case 'closed':
      return 'Пописот е заклучен или откажан. Освежи ја страната.';
    case 'resolved':
      return 'Админот веќе одлучил за овој производ. Не може повторно да се брои.';
    case 'invalid':
      return 'Бројките не се исправни: цели броеви од 0 до 999.';
    case 'missing':
      return 'Производот не постои (можеби е избришан).';
    case 'open':
      return 'Веќе има попис во тек.';
    case 'uncounted':
      return 'Не се попишани сите производи.';
    case 'unresolved':
      return 'Има разлики што чекаат одлука.';
    case 'applied':
      return 'Разликата е веќе применета. Не може да се брои повторно.';
    case 'unresolvable':
      return 'Овој производ не чека одлука.';
  }
  if (err?.code === '42501') return 'Немаш право за ова.';
  return err?.message || 'Нешто не успеа. Обиди се повторно.';
}
