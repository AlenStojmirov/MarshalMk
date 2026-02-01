'use client';

import { ref, get, onValue, off, Database } from 'firebase/database';
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  writeBatch,
  Timestamp,
} from 'firebase/firestore';
import { getRealtimeDatabase, isRealtimeDatabaseConfigured as checkRtdbConfigured, db } from './firebase';
import { Product, ProductSize } from '@/types';

// Re-export the check function
export const isRealtimeDatabaseConfigured = checkRtdbConfigured;

// Type for inventory product from Realtime Database
// Note: RTDB can return arrays as objects with numeric keys
export interface InventoryProduct {
  brand?: string;
  category: string;
  name: string;
  price: number;
  purchasePrice?: number;
  image?: string;
  sizes?: ProductSize[] | Record<string, ProductSize>;
  sold?: Array<{
    price: number | string;
    size: string;
    soldDate: string;
  }> | Record<string, {
    price: number | string;
    size: string;
    soldDate: string;
  }>;
}

// Type for the products object from RTDB
export interface InventoryData {
  [key: string]: InventoryProduct;
}

// Convert inventory product to e-commerce product
function inventoryToProduct(
  id: string,
  inv: InventoryProduct,
  existingProduct?: Partial<Product>
): Omit<Product, 'createdAt' | 'updatedAt'> {
  // Handle sizes - convert from object format if needed
  let sizes: ProductSize[] = [];
  if (inv.sizes) {
    if (Array.isArray(inv.sizes)) {
      sizes = inv.sizes;
    } else {
      // Convert object format { 0: { size, quantity }, 1: { size, quantity } } to array
      sizes = Object.values(inv.sizes as Record<string, ProductSize>);
    }
  }

  // Calculate total stock from sizes
  const totalStock = sizes.reduce((sum, s) => sum + (s.quantity || 0), 0);

  // Handle sold items - convert from object format if needed
  let sold: Array<{ size: string; price: number; soldDate: string }> = [];
  if (inv.sold) {
    if (Array.isArray(inv.sold)) {
      sold = inv.sold.map(item => ({
        size: item.size || '',
        price: Number(item.price) || 0,
        soldDate: item.soldDate || '',
      }));
    } else {
      // Convert object format { 0: { size, price, soldDate }, ... } to array
      sold = Object.values(inv.sold as Record<string, { size: string; price: number | string; soldDate: string }>)
        .map(item => ({
          size: item.size || '',
          price: Number(item.price) || 0,
          soldDate: item.soldDate || '',
        }));
    }
  }

  return {
    id,
    name: inv.name || '',
    description: existingProduct?.description || '',
    price: inv.price || 0,
    category: inv.category || '',
    imageUrl: existingProduct?.imageUrl || inv.image || '',
    images: existingProduct?.images || [],
    stock: totalStock,
    sizes: sizes,
    sold: sold,
    brand: inv.brand,
    color: existingProduct?.color || '',
    featured: existingProduct?.featured || false,
  };
}

// Fetch all products from Realtime Database
export async function fetchInventoryProducts(): Promise<InventoryData> {
  const rtdb = getRealtimeDatabase();
  if (!rtdb) {
    throw new Error('Realtime Database is not configured. Please set NEXT_PUBLIC_FIREBASE_DATABASE_URL.');
  }

  const productsRef = ref(rtdb, 'products');
  const snapshot = await get(productsRef);

  if (!snapshot.exists()) {
    return {};
  }

  return snapshot.val() as InventoryData;
}

// Subscribe to real-time inventory updates
export function subscribeToInventory(
  callback: (data: InventoryData) => void
): () => void {
  const rtdb = getRealtimeDatabase();
  if (!rtdb) {
    console.warn('Realtime Database is not configured');
    callback({});
    return () => {};
  }

  const productsRef = ref(rtdb, 'products');

  onValue(productsRef, (snapshot) => {
    if (snapshot.exists()) {
      callback(snapshot.val() as InventoryData);
    } else {
      callback({});
    }
  });

  // Return unsubscribe function
  return () => off(productsRef);
}

// Sync a single product from inventory to Firestore
export async function syncProductToFirestore(
  id: string,
  invProduct: InventoryProduct
): Promise<void> {
  const docRef = doc(db, 'products', id);
  const existingDoc = await getDoc(docRef);
  const existingData = existingDoc.exists() ? existingDoc.data() : undefined;

  const productData = inventoryToProduct(id, invProduct, existingData as Partial<Product>);
  const now = Timestamp.fromDate(new Date());

  await setDoc(
    docRef,
    {
      ...productData,
      updatedAt: now,
      createdAt: existingDoc.exists() ? existingData?.createdAt : now,
    },
    { merge: true }
  );
}

// Migrate all products from Realtime Database to Firestore
export async function migrateAllProducts(): Promise<{
  migrated: number;
  errors: string[];
}> {
  const inventory = await fetchInventoryProducts();
  const errors: string[] = [];
  let migrated = 0;

  const batch = writeBatch(db);
  const now = Timestamp.fromDate(new Date());

  for (const [id, invProduct] of Object.entries(inventory)) {
    try {
      const docRef = doc(db, 'products', id);
      const existingDoc = await getDoc(docRef);
      const existingData = existingDoc.exists() ? existingDoc.data() : undefined;

      const productData = inventoryToProduct(id, invProduct, existingData as Partial<Product>);

      batch.set(
        docRef,
        {
          ...productData,
          updatedAt: now,
          createdAt: existingDoc.exists() ? existingData?.createdAt : now,
        },
        { merge: true }
      );

      migrated++;
    } catch (err) {
      errors.push(`Failed to migrate ${id}: ${err}`);
    }
  }

  await batch.commit();

  return { migrated, errors };
}

// Get products that exist in Firestore but not in inventory (orphaned)
export async function findOrphanedProducts(): Promise<string[]> {
  const inventory = await fetchInventoryProducts();
  const inventoryIds = new Set(Object.keys(inventory));

  const productsSnapshot = await getDocs(collection(db, 'products'));
  const orphaned: string[] = [];

  productsSnapshot.forEach((doc) => {
    if (!inventoryIds.has(doc.id)) {
      orphaned.push(doc.id);
    }
  });

  return orphaned;
}

// Update product with e-commerce specific fields (image, description, etc.)
export async function updateProductEcommerceFields(
  id: string,
  fields: {
    description?: string;
    imageUrl?: string;
    images?: string[];
    color?: string;
    featured?: boolean;
  }
): Promise<void> {
  const docRef = doc(db, 'products', id);
  await setDoc(
    docRef,
    {
      ...fields,
      updatedAt: Timestamp.fromDate(new Date()),
    },
    { merge: true }
  );
}
