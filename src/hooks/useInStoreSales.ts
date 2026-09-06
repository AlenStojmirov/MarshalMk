'use client';

import { Product, SoldItem } from '@/types';
import { updateProduct } from '@/hooks/useProducts';
import { supabase } from '@/lib/supabase';
import { buildLedgerRow } from '@/lib/sales-ledger';

/**
 * The ledger stores a timestamp, but a shop sale only ever knows a day —
 * `sold[]` has never held anything finer. Noon UTC is the same convention
 * `scripts/sync-sales-ledger.ts` uses, so a row written here and a row the sync
 * would have written for the same sale land on the identical day key and the
 * multiset diff sees one sale, not two.
 */
const dayToTimestamp = (day: string) => day.slice(0, 10) + 'T12:00:00.000Z';

// Aggregated sold item with product info (for display in sales views)
export interface AggregatedSoldItem {
  productId: string;
  productName: string;
  size: string;
  price: number;
  soldDate: string;
}

/**
 * Record one unit leaving the shop.
 *
 * Writes twice, in a deliberate order. `sold[]` first, because it is still the
 * source of truth every report reads (D-008); `sales_ledger` second, because it
 * is the record those reports are being moved onto (Task 0.3).
 *
 * A failed ledger write is logged and swallowed rather than thrown. The sale
 * happened, the stock moved, and `npm run ledger:sync` closes the gap on the
 * next run — losing a recorded sale over a secondary write would be the worse
 * trade. That is the same call the order API makes for the same reason.
 */
export async function recordProductSale(
  product: Product,
  size: string,
  price: number,
  soldDate?: string
): Promise<void> {
  const today = soldDate || formatDateKey(new Date());

  // Reduce quantity from selected size
  const updatedSizes = product.sizes?.map(sz =>
    sz.size === size
      ? { ...sz, quantity: Math.max(0, sz.quantity - 1) }
      : sz
  ) || [];

  // Calculate new total stock
  const newStock = updatedSizes.reduce((sum, sz) => sum + sz.quantity, 0);

  // Add to sold list
  const newSoldItem: SoldItem = {
    size,
    price,
    soldDate: today,
  };
  const updatedSold = [...(product.sold || []), newSoldItem];

  await updateProduct(product.id, {
    sizes: updatedSizes,
    sold: updatedSold,
    stock: newStock,
  } as Partial<Product>);

  await appendLedgerRow(product, size, price, today);
}

/** Best-effort second write. Never throws — see recordProductSale. */
async function appendLedgerRow(
  product: Product,
  size: string,
  price: number,
  day: string
): Promise<void> {
  try {
    const { data } = await supabase.auth.getUser();

    const row = buildLedgerRow({
      occurredAt: dayToTimestamp(day),
      channel: 'store',
      // reason is derived from the price: a zero is never a sale (D-005).
      productId: product.id,
      productName: product.name,
      productCategory: product.category,
      size,
      qty: 1,
      unitPrice: price,
      // What the item was listed at, so the discount is derivable later without
      // being stored — the two can then never disagree.
      unitListPrice: product.price,
      // Cost is snapshotted here on purpose: a later change to purchase_price
      // must not silently rewrite the margin on a sale already made.
      unitCost: product.purchasePrice ?? null,
      createdBy: data.user?.email ?? null,
      source: 'pos',
    });

    const { error } = await supabase.from('sales_ledger').insert(row);
    if (error) throw error;
  } catch (err) {
    console.warn(
      '[LEDGER_POS_WRITE_FAILED] продажбата е запишана во sold[], ledger-от заостанува. ' +
      'Пушти `npm run ledger:sync apply`.',
      { productId: product.id, size, price, day, err }
    );
  }
}

// Aggregate all sold items from all products into a flat list
export function getAllSoldItems(products: Product[]): AggregatedSoldItem[] {
  const items: AggregatedSoldItem[] = [];

  products.forEach(product => {
    if (product.sold && product.sold.length > 0) {
      product.sold.forEach(item => {
        items.push({
          productId: product.id,
          productName: product.name,
          size: item.size,
          price: item.price,
          soldDate: item.soldDate,
        });
      });
    }
  });

  return items;
}

// Format date to YYYY-MM-DD in local timezone
export function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Get sold items grouped by date
export function groupSoldItemsByDate(items: AggregatedSoldItem[]): Map<string, AggregatedSoldItem[]> {
  const grouped = new Map<string, AggregatedSoldItem[]>();

  items.forEach(item => {
    const existing = grouped.get(item.soldDate) || [];
    grouped.set(item.soldDate, [...existing, item]);
  });

  return grouped;
}

// Calculate total revenue for a list of sold items
export function calculateDailyTotal(items: AggregatedSoldItem[]): number {
  return items.reduce((sum, item) => sum + item.price, 0);
}

// Get unique products sold summary
export function getProductsSoldOnDate(items: AggregatedSoldItem[]): Map<string, { name: string; quantity: number; revenue: number }> {
  const products = new Map<string, { name: string; quantity: number; revenue: number }>();

  items.forEach(item => {
    const existing = products.get(item.productId) || { name: item.productName, quantity: 0, revenue: 0 };
    products.set(item.productId, {
      name: item.productName,
      quantity: existing.quantity + 1,
      revenue: existing.revenue + item.price,
    });
  });

  return products;
}
