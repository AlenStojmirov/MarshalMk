'use client';

import { useState, useEffect } from 'react';
import {
  collection,
  getDocs,
  addDoc,
  query,
  where,
  orderBy,
  Timestamp,
  updateDoc,
  doc,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { InStoreSale, InStoreSaleItem, Product } from '@/types';

// Fetch all in-store sales
export function useInStoreSales() {
  const [sales, setSales] = useState<InStoreSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSales = async () => {
    try {
      setLoading(true);
      const salesRef = collection(db, 'inStoreSales');
      const q = query(salesRef, orderBy('saleDate', 'desc'));
      const snapshot = await getDocs(q);

      const fetchedSales: InStoreSale[] = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
        saleDate: doc.data().saleDate?.toDate() || new Date(),
        createdAt: doc.data().createdAt?.toDate() || new Date(),
      })) as InStoreSale[];

      setSales(fetchedSales);
      setError(null);
    } catch (err) {
      setError('Failed to fetch sales');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSales();
  }, []);

  return { sales, loading, error, refetch: fetchSales };
}

// Fetch sales by date range
export function useInStoreSalesByDate(startDate: Date, endDate: Date) {
  const [sales, setSales] = useState<InStoreSale[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSales = async () => {
      try {
        setLoading(true);
        const salesRef = collection(db, 'inStoreSales');

        // Set start of day and end of day for proper range
        const startOfDay = new Date(startDate);
        startOfDay.setHours(0, 0, 0, 0);

        const endOfDay = new Date(endDate);
        endOfDay.setHours(23, 59, 59, 999);

        const q = query(
          salesRef,
          where('saleDate', '>=', Timestamp.fromDate(startOfDay)),
          where('saleDate', '<=', Timestamp.fromDate(endOfDay)),
          orderBy('saleDate', 'desc')
        );
        const snapshot = await getDocs(q);

        const fetchedSales: InStoreSale[] = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          saleDate: doc.data().saleDate?.toDate() || new Date(),
          createdAt: doc.data().createdAt?.toDate() || new Date(),
        })) as InStoreSale[];

        setSales(fetchedSales);
        setError(null);
      } catch (err) {
        setError('Failed to fetch sales by date');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchSales();
  }, [startDate.getTime(), endDate.getTime()]);

  return { sales, loading, error };
}

// Create a new in-store sale
export async function createInStoreSale(
  items: InStoreSaleItem[],
  saleDate: Date,
  notes?: string
): Promise<string> {
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const saleData = {
    items,
    total,
    saleDate: Timestamp.fromDate(saleDate),
    notes: notes || '',
    createdAt: Timestamp.now(),
  };

  const salesRef = collection(db, 'inStoreSales');
  const docRef = await addDoc(salesRef, saleData);
  return docRef.id;
}

// Deduct stock after recording an in-store sale
export async function deductStockForSale(items: InStoreSaleItem[]): Promise<void> {
  for (const item of items) {
    const productRef = doc(db, 'products', item.productId);
    const productDoc = await getDocs(query(collection(db, 'products'), where('__name__', '==', item.productId)));

    if (!productDoc.empty) {
      const product = productDoc.docs[0].data() as Product;
      const newStock = Math.max(0, product.stock - item.quantity);

      // If product has sizes, update size quantity
      let updatedSizes = product.sizes;
      if (item.size && product.sizes) {
        updatedSizes = product.sizes.map(s =>
          s.size === item.size
            ? { ...s, quantity: Math.max(0, s.quantity - item.quantity) }
            : s
        );
      }

      await updateDoc(productRef, {
        stock: newStock,
        ...(updatedSizes && { sizes: updatedSizes }),
        updatedAt: Timestamp.now(),
      });
    }
  }
}

// Format date to YYYY-MM-DD in local timezone
export function formatDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// Get sales grouped by date for reporting
export function groupSalesByDate(sales: InStoreSale[]): Map<string, InStoreSale[]> {
  const grouped = new Map<string, InStoreSale[]>();

  console.log(sales, "here ?");
  sales.forEach(sale => {
    const dateKey = formatDateKey(sale.saleDate);
    const existing = grouped.get(dateKey) || [];
    grouped.set(dateKey, [...existing, sale]);
  });

  return grouped;
}

// Calculate totals for a date
export function calculateDailyTotal(sales: InStoreSale[]): number {
  return sales.reduce((sum, sale) => sum + sale.total, 0);
}

// Get all unique products sold on a date
export function getProductsSoldOnDate(sales: InStoreSale[]): Map<string, { name: string; quantity: number; revenue: number }> {
  const products = new Map<string, { name: string; quantity: number; revenue: number }>();

  sales.forEach(sale => {
    sale.items.forEach(item => {
      const existing = products.get(item.productId) || { name: item.productName, quantity: 0, revenue: 0 };
      products.set(item.productId, {
        name: item.productName,
        quantity: existing.quantity + item.quantity,
        revenue: existing.revenue + (item.price * item.quantity),
      });
    });
  });

  return products;
}
