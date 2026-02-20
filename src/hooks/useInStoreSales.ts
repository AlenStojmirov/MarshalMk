'use client';

import { Product, SoldItem } from '@/types';
import { updateProduct } from '@/hooks/useProducts';

// Aggregated sold item with product info (for display in sales views)
export interface AggregatedSoldItem {
  productId: string;
  productName: string;
  size: string;
  price: number;
  soldDate: string;
}

// Record a sale by updating the product's sold[], sizes[], and stock directly
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
