'use client';

import { supabase } from './supabase';
import { rowToOrder, OrderRow, productToRow } from './db-mappers';
import { Order, OrderStatus, CustomerInfo, OrderItem, ProductSize } from '@/types';

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
 * Update an order's status. When transitioning to "shipped", deduct the
 * ordered quantities from each product's stock and size buckets.
 *
 * Postgres doesn't have a multi-row equivalent of Firestore transactions
 * accessible from the client, but each per-product update is atomic and
 * the read-modify-write window is small. For stricter consistency,
 * promote this logic to a server action / RPC.
 */
export async function updateOrderStatus(id: string, status: OrderStatus): Promise<void> {
  if (status !== 'shipped') {
    const { error } = await supabase
      .from(ORDERS_TABLE)
      .update({ status })
      .eq('id', id);
    if (error) throw error;
    return;
  }

  // Load order to know its current status + items
  const { data: orderData, error: orderErr } = await supabase
    .from(ORDERS_TABLE)
    .select('status, items')
    .eq('id', id)
    .single();

  if (orderErr) throw orderErr;
  if (!orderData) throw new Error('Order not found');

  const currentStatus = orderData.status as OrderStatus;
  const items = (orderData.items ?? []) as OrderItem[];

  // Only deduct stock if not already shipped/delivered
  if (currentStatus !== 'shipped' && currentStatus !== 'delivered') {
    for (const item of items) {
      const { data: productData, error: productErr } = await supabase
        .from('products')
        .select('stock, sizes')
        .eq('id', item.productId)
        .maybeSingle();

      if (productErr || !productData) continue;

      const currentStock = (productData.stock as number) || 0;
      const currentSizes = (productData.sizes as ProductSize[] | null) || [];

      const newStock = Math.max(0, currentStock - item.quantity);
      let newSizes = currentSizes;
      if (item.size && currentSizes.length > 0) {
        newSizes = currentSizes.map((s) =>
          s.size === item.size
            ? { ...s, quantity: Math.max(0, s.quantity - item.quantity) }
            : s
        );
      }

      await supabase
        .from('products')
        .update(productToRow({ stock: newStock, sizes: newSizes }))
        .eq('id', item.productId);
    }
  }

  const { error: statusErr } = await supabase
    .from(ORDERS_TABLE)
    .update({ status })
    .eq('id', id);
  if (statusErr) throw statusErr;
}
