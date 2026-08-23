'use client';

import { supabase } from './supabase';
import { rowToOrder, OrderRow } from './db-mappers';
import { applyOrderToStock, revertOrderFromStock, StockLine } from './stock';
import { Order, OrderStatus, CustomerInfo, OrderItem } from '@/types';

const ORDERS_TABLE = 'orders';

function generateOrderNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ORD-${timestamp}-${random}`;
}

/**
 * NOTE: in production, orders are created via the server-side API route
 * (`/api/orders`) which uses the service-role key. This client-side helper
 * is kept for parity with the previous Firestore implementation and should
 * only be used by authenticated admins.
 */
export async function createOrder(
  customer: CustomerInfo,
  items: OrderItem[],
  subtotal: number
): Promise<Order> {
  const row = {
    order_number: generateOrderNumber(),
    customer,
    items,
    subtotal,
    shipping: 0,
    total: subtotal,
    status: 'pending' as OrderStatus,
    payment_method: 'cash_on_delivery' as const,
  };

  const { data, error } = await supabase
    .from(ORDERS_TABLE)
    .insert(row)
    .select()
    .single();

  if (error) throw error;
  return rowToOrder(data as OrderRow);
}

export async function getOrders(): Promise<Order[]> {
  const { data, error } = await supabase
    .from(ORDERS_TABLE)
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return ((data as OrderRow[] | null) ?? []).map(rowToOrder);
}

export async function getOrderById(id: string): Promise<Order | null> {
  const { data, error } = await supabase
    .from(ORDERS_TABLE)
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) throw error;
  return data ? rowToOrder(data as OrderRow) : null;
}

export async function getOrderByNumber(orderNumber: string): Promise<Order | null> {
  const { data, error } = await supabase
    .from(ORDERS_TABLE)
    .select('*')
    .eq('order_number', orderNumber)
    .maybeSingle();

  if (error) throw error;
  return data ? rowToOrder(data as OrderRow) : null;
}

/**
 * Stock lines for an order, as they were reserved when it was created.
 *
 * `soldDate` is derived from the order's own date because that is what the API
 * used when it wrote the `sold[]` entries — matching it is how those entries are
 * found again on a cancel.
 */
function stockLinesFor(order: Order): StockLine[] {
  const soldDate = order.createdAt.toISOString().slice(0, 10);
  return order.items.map((item) => ({
    productId: item.productId,
    size: item.size ?? null,
    quantity: Math.max(1, Math.round(item.quantity || 1)),
    unitPrice: Number(item.price) || 0,
    soldDate,
  }));
}

/**
 * Move an order to a new status, putting stock back or taking it again when the
 * move crosses the cancelled boundary.
 *
 * Stock is reserved at order time (D-001), so cancelling has to release it — and
 * that means removing the `sold[]` entries and the ledger rows the order added,
 * or the sale stays on the books for goods still on the shelf.
 *
 * Un-cancelling re-reserves the stock and restores the `sold[]` entries. The
 * ledger rows are not rebuilt here; the next `npm run ledger:sync` inserts them
 * and attributes them to the order. `sold[]` is the source of truth (D-008), so
 * reports are already right in the meantime.
 */
export async function updateOrderStatus(id: string, status: OrderStatus): Promise<void> {
  const order = await getOrderById(id);
  if (!order) throw new Error('Order not found');

  const wasCancelled = order.status === 'cancelled';
  const willBeCancelled = status === 'cancelled';

  if (willBeCancelled && !wasCancelled) {
    await revertOrderFromStock(supabase, stockLinesFor(order));
    const { error: ledgerErr } = await supabase
      .from('sales_ledger')
      .delete()
      .eq('order_id', id);
    if (ledgerErr) {
      console.error('Failed to remove ledger rows for cancelled order:', ledgerErr.message);
    }
  } else if (!willBeCancelled && wasCancelled) {
    const result = await applyOrderToStock(supabase, stockLinesFor(order));
    if (!result.ok) {
      const detail = result.shortages.length
        ? result.shortages
            .map((s) => `${s.productId}/${s.size}: ${s.available} од ${s.requested}`)
            .join(', ')
        : (result.error ?? 'unknown');
      throw new Error('Не може да се врати нарачката — нема доволно залиха: ' + detail);
    }
  }

  const { error } = await supabase.from(ORDERS_TABLE).update({ status }).eq('id', id);
  if (error) throw error;
}
