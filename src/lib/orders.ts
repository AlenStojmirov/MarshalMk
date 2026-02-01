'use client';

import {
  collection,
  addDoc,
  getDocs,
  getDoc,
  doc,
  updateDoc,
  query,
  orderBy,
  where,
  Timestamp,
  runTransaction,
} from 'firebase/firestore';
import { db } from './firebase';
import { Order, OrderStatus, CustomerInfo, OrderItem, ProductSize } from '@/types';

const ORDERS_COLLECTION = 'orders';

function generateOrderNumber(): string {
  const timestamp = Date.now().toString(36).toUpperCase();
  const random = Math.random().toString(36).substring(2, 6).toUpperCase();
  return `ORD-${timestamp}-${random}`;
}

export async function createOrder(
  customer: CustomerInfo,
  items: OrderItem[],
  subtotal: number
): Promise<Order> {
  const now = new Date();
  const orderData = {
    orderNumber: generateOrderNumber(),
    customer,
    items,
    subtotal,
    shipping: 0,
    total: subtotal,
    status: 'pending' as OrderStatus,
    paymentMethod: 'cash_on_delivery' as const,
    createdAt: Timestamp.fromDate(now),
    updatedAt: Timestamp.fromDate(now),
  };

  const docRef = await addDoc(collection(db, ORDERS_COLLECTION), orderData);

  return {
    id: docRef.id,
    ...orderData,
    createdAt: now,
    updatedAt: now,
  };
}

export async function getOrders(): Promise<Order[]> {
  const q = query(
    collection(db, ORDERS_COLLECTION),
    orderBy('createdAt', 'desc')
  );
  const snapshot = await getDocs(q);

  return snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      orderNumber: data.orderNumber,
      customer: data.customer,
      items: data.items,
      subtotal: data.subtotal,
      shipping: data.shipping,
      total: data.total,
      status: data.status,
      paymentMethod: data.paymentMethod,
      createdAt: data.createdAt?.toDate() || new Date(),
      updatedAt: data.updatedAt?.toDate() || new Date(),
    } as Order;
  });
}

export async function getOrderById(id: string): Promise<Order | null> {
  const docRef = doc(db, ORDERS_COLLECTION, id);
  const snapshot = await getDoc(docRef);

  if (!snapshot.exists()) {
    return null;
  }

  const data = snapshot.data();
  return {
    id: snapshot.id,
    orderNumber: data.orderNumber,
    customer: data.customer,
    items: data.items,
    subtotal: data.subtotal,
    shipping: data.shipping,
    total: data.total,
    status: data.status,
    paymentMethod: data.paymentMethod,
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || new Date(),
  } as Order;
}

export async function getOrderByNumber(orderNumber: string): Promise<Order | null> {
  const q = query(
    collection(db, ORDERS_COLLECTION),
    where('orderNumber', '==', orderNumber)
  );
  const snapshot = await getDocs(q);

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  const data = doc.data();
  return {
    id: doc.id,
    orderNumber: data.orderNumber,
    customer: data.customer,
    items: data.items,
    subtotal: data.subtotal,
    shipping: data.shipping,
    total: data.total,
    status: data.status,
    paymentMethod: data.paymentMethod,
    createdAt: data.createdAt?.toDate() || new Date(),
    updatedAt: data.updatedAt?.toDate() || new Date(),
  } as Order;
}

export async function updateOrderStatus(
  id: string,
  status: OrderStatus
): Promise<void> {
  const orderRef = doc(db, ORDERS_COLLECTION, id);

  // If status is changing to "shipped", deduct stock from products
  if (status === 'shipped') {
    await runTransaction(db, async (transaction) => {
      // Get the order first
      const orderDoc = await transaction.get(orderRef);
      if (!orderDoc.exists()) {
        throw new Error('Order not found');
      }

      const orderData = orderDoc.data();
      const currentStatus = orderData.status;

      // Only deduct stock if the order was not already shipped
      if (currentStatus !== 'shipped' && currentStatus !== 'delivered') {
        const items = orderData.items as OrderItem[];

        // Deduct stock for each item
        for (const item of items) {
          const productRef = doc(db, 'products', item.productId);
          const productDoc = await transaction.get(productRef);

          if (productDoc.exists()) {
            const productData = productDoc.data();
            const currentStock = productData.stock || 0;
            const currentSizes = productData.sizes as ProductSize[] || [];

            // Deduct from total stock
            const newStock = Math.max(0, currentStock - item.quantity);

            // Deduct from size-specific stock if applicable
            let newSizes = currentSizes;
            if (item.size && currentSizes.length > 0) {
              newSizes = currentSizes.map((s) => {
                if (s.size === item.size) {
                  return { ...s, quantity: Math.max(0, s.quantity - item.quantity) };
                }
                return s;
              });
            }

            transaction.update(productRef, {
              stock: newStock,
              sizes: newSizes,
              updatedAt: Timestamp.fromDate(new Date()),
            });
          }
        }
      }

      // Update the order status
      transaction.update(orderRef, {
        status,
        updatedAt: Timestamp.fromDate(new Date()),
      });
    });
  } else {
    // For other status changes, just update the status
    await updateDoc(orderRef, {
      status,
      updatedAt: Timestamp.fromDate(new Date()),
    });
  }
}
