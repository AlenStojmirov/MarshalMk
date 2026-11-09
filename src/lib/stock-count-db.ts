/**
 * The stock count in the database (Tasks 17.2–17.3, migration 024).
 *
 * Reads go to the tables; every write is one of the functions in 024, which
 * check the role, that the count is open, and that the shelf has not moved
 * since the counter looked (D-013). Applying a difference to the shelf is in
 * stock.ts (`applyCountLine`), with every other write to stock.
 *
 * Takes the client as an argument, so it never pulls supabase-js onto a page
 * by itself (16.11).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Order, ProductSize } from '@/types';
import { isMissingRelation } from './product-views';
import {
  HOLDING_STATUSES, countErrorMessage,
  type CountLine, type CountSize, type HoldingOrder, type StockCount,
} from './stock-count';

interface CountRow {
  id: number;
  started_at: string;
  started_by: string | null;
  note: string | null;
  closed_at: string | null;
  closed_by: string | null;
}

export interface LineRow {
  count_id: number;
  product_id: string;
  listed: boolean;
  expected: CountSize[] | null;
  counted: CountSize[] | null;
  matches: boolean | null;
  counted_at: string | null;
  counted_by: string | null;
  resolution: 'applied' | 'dismissed' | null;
  applied: { size: string; change: number }[] | null;
  resolved_at: string | null;
  resolved_by: string | null;
}

const rowToCount = (r: CountRow): StockCount => ({
  id: Number(r.id),
  startedAt: r.started_at,
  startedBy: r.started_by,
  note: r.note,
  closedAt: r.closed_at,
  closedBy: r.closed_by,
});

export const rowToLine = (r: LineRow): CountLine => ({
  countId: Number(r.count_id),
  productId: r.product_id,
  listed: r.listed,
  expected: r.expected,
  counted: r.counted,
  matches: r.matches,
  countedAt: r.counted_at,
  countedBy: r.counted_by,
  resolution: r.resolution,
  applied: r.applied,
  resolvedAt: r.resolved_at,
  resolvedBy: r.resolved_by,
});

/** An error from Supabase as the shop floor reads it. */
export class CountError extends Error {
  hint: string;
  constructor(err: { message?: string; hint?: string | null; code?: string }) {
    super(countErrorMessage(err));
    this.hint = err.hint ?? '';
  }
}

const PAGE = 1000;

async function readLines(sb: SupabaseClient, countIds: number[]): Promise<CountLine[]> {
  const out: CountLine[] = [];
  if (countIds.length === 0) return out;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from('stock_count_lines')
      .select('*')
      .in('count_id', countIds)
      .order('count_id')
      .order('product_id')
      .range(from, from + PAGE - 1);
    if (error) throw new CountError(error);
    out.push(...((data as LineRow[]) ?? []).map(rowToLine));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

export interface CountState {
  /** Migration 024 has not run yet. */
  missing: boolean;
  open: StockCount | null;
  lines: CountLine[];
  /** Closed counts, newest first, with their lines (the last few only). */
  history: { count: StockCount; lines: CountLine[] }[];
}

const HISTORY = 5;

export async function fetchCountState(sb: SupabaseClient, withHistory: boolean): Promise<CountState> {
  const { data, error } = await sb
    .from('stock_counts')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(HISTORY + 1);
  if (isMissingRelation(error)) return { missing: true, open: null, lines: [], history: [] };
  if (error) throw new CountError(error);

  const counts = ((data as CountRow[]) ?? []).map(rowToCount);
  const open = counts.find((c) => !c.closedAt) ?? null;
  const closed = withHistory ? counts.filter((c) => c.closedAt).slice(0, HISTORY) : [];
  const lines = await readLines(sb, [...(open ? [open.id] : []), ...closed.map((c) => c.id)]);

  return {
    missing: false,
    open,
    lines: open ? lines.filter((l) => l.countId === open.id) : [],
    history: closed.map((count) => ({ count, lines: lines.filter((l) => l.countId === count.id) })),
  };
}

/** Is a count open? For the warehouse screen and the sale screen; false before 024. */
export async function fetchOpenCountId(sb: SupabaseClient): Promise<number | null> {
  const { data, error } = await sb.from('stock_counts').select('id').is('closed_at', null).limit(1);
  if (error) return null;
  return data?.[0] ? Number(data[0].id) : null;
}

/** The line of one product in a count, or null. */
export async function fetchLine(sb: SupabaseClient, countId: number, productId: string): Promise<CountLine | null> {
  const { data, error } = await sb
    .from('stock_count_lines')
    .select('*')
    .eq('count_id', countId)
    .eq('product_id', productId)
    .maybeSingle();
  if (error) return null;
  return data ? rowToLine(data as LineRow) : null;
}

/** Orders whose goods are still in the shop (see HOLDING_STATUSES). */
export async function fetchHoldingOrders(sb: SupabaseClient): Promise<HoldingOrder[]> {
  const { data, error } = await sb
    .from('orders')
    .select('order_number, status, items')
    .in('status', [...HOLDING_STATUSES]);
  if (error) throw new CountError(error);
  return ((data ?? []) as { order_number: string; status: Order['status']; items: Order['items'] }[]).map((r) => ({
    orderNumber: r.order_number,
    status: r.status,
    items: (r.items ?? []).map((it) => ({ productId: it.productId, size: it.size, quantity: it.quantity })),
  }));
}

export interface Shelf {
  sizes: ProductSize[];
  stock: number;
  /** The row's updated_at exactly as the database wrote it: the count is checked against it. */
  updatedAt: string;
}

/** The shelf of one product, fresh. */
export async function readShelf(sb: SupabaseClient, productId: string): Promise<Shelf | null> {
  const { data, error } = await sb
    .from('products')
    .select('sizes, stock, updated_at')
    .eq('id', productId)
    .maybeSingle();
  if (error) throw new CountError(error);
  if (!data) return null;
  return { sizes: data.sizes ?? [], stock: Number(data.stock) || 0, updatedAt: data.updated_at };
}

async function call<T>(p: PromiseLike<{ data: unknown; error: { message?: string; hint?: string | null; code?: string } | null }>): Promise<T> {
  const { data, error } = await p;
  if (error) throw new CountError(error);
  return data as T;
}

export const startCount = (sb: SupabaseClient, note: string) =>
  call<number>(sb.rpc('stock_count_start', { p_note: note || null })).then(Number);

export const recordCount = (
  sb: SupabaseClient,
  countId: number,
  productId: string,
  seen: string,
  expected: CountSize[],
  counted: CountSize[],
) =>
  call<LineRow>(sb.rpc('stock_count_record', {
    p_count: countId, p_product: productId, p_seen: seen, p_expected: expected, p_counted: counted,
  })).then(rowToLine);

export const dismissLine = (sb: SupabaseClient, countId: number, productId: string) =>
  call<LineRow>(sb.rpc('stock_count_dismiss', { p_count: countId, p_product: productId })).then(rowToLine);

export const recountLine = (sb: SupabaseClient, countId: number, productId: string) =>
  call<null>(sb.rpc('stock_count_recount', { p_count: countId, p_product: productId }));

export const closeCount = (sb: SupabaseClient, countId: number) =>
  call<null>(sb.rpc('stock_count_close', { p_count: countId }));

/** Give a count up: it and everything counted in it go; the shelf is not touched. */
export async function cancelCount(sb: SupabaseClient, countId: number): Promise<void> {
  const { error } = await sb.from('stock_counts').delete().eq('id', countId).is('closed_at', null);
  if (error) throw new CountError(error);
}
