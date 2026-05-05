'use client';

import { ref, get, set, onValue, off } from 'firebase/database';
import { getRealtimeDatabase, isRealtimeDatabaseConfigured as checkRtdbConfigured } from './firebase-rtdb';
import { supabase } from './supabase';
import { productToRow, ProductRow, rowToProduct } from './db-mappers';
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
      sizes = Object.values(inv.sizes as Record<string, ProductSize>);
    }
  }

  const totalStock = sizes.reduce((sum, s) => sum + (s.quantity || 0), 0);

  let sold: Array<{ size: string; price: number; soldDate: string }> = [];
  if (inv.sold) {
    if (Array.isArray(inv.sold)) {
      sold = inv.sold.map(item => ({
        size: item.size || '',
        price: Number(item.price) || 0,
        soldDate: item.soldDate || '',
      }));
    } else {
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
    throw new Error('Realtime Database is not configured. Please set NEXT_PUBLIC_INVENTORY_FIREBASE_DATABASE_URL.');
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

  return () => off(productsRef);
}

// Sync a single product from inventory to Supabase
export async function syncProductToSupabase(
  id: string,
  invProduct: InventoryProduct
): Promise<void> {
  const { data: existing } = await supabase
    .from('products')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  const existingProduct = existing
    ? rowToProduct(existing as ProductRow)
    : undefined;

  const productData = inventoryToProduct(id, invProduct, existingProduct);
  const row = { id, ...productToRow(productData) };

  const { error } = await supabase.from('products').upsert(row);
  if (error) throw error;
}

/**
 * Sync all products from Realtime Database to Supabase.
 *  - Existing products: only update sizes, sold, stock
 *  - New products: full insert with is_visible: false
 */
export async function migrateAllProducts(): Promise<{
  migrated: number;
  updated: number;
  errors: string[];
}> {
  const inventory = await fetchInventoryProducts();
  const errors: string[] = [];
  let migrated = 0;
  let updated = 0;

  // Pull existing IDs once to decide insert vs update
  const { data: existingRows, error: existingErr } = await supabase
    .from('products')
    .select('id');

  if (existingErr) {
    return { migrated: 0, updated: 0, errors: [existingErr.message] };
  }
  const existingIds = new Set((existingRows ?? []).map((r) => (r as { id: string }).id));

  for (const [id, invProduct] of Object.entries(inventory)) {
    try {
      const productData = inventoryToProduct(id, invProduct);
      if (existingIds.has(id)) {
        const { error } = await supabase
          .from('products')
          .update(
            productToRow({
              sizes: productData.sizes,
              sold: productData.sold,
              stock: productData.stock,
            })
          )
          .eq('id', id);
        if (error) throw error;
        updated++;
      } else {
        const row = {
          id,
          ...productToRow({ ...productData, isVisible: false }),
        };
        const { error } = await supabase.from('products').insert(row);
        if (error) throw error;
        migrated++;
      }
    } catch (err) {
      errors.push(`Failed to process ${id}: ${err instanceof Error ? err.message : err}`);
    }
  }

  return { migrated, updated, errors };
}

// Export all products from Realtime Database as JSON
export async function exportInventoryData(): Promise<string> {
  const inventory = await fetchInventoryProducts();
  return JSON.stringify(inventory, null, 2);
}

// Import products into Realtime Database from JSON
export async function importInventoryData(jsonData: string): Promise<{
  imported: number;
  errors: string[];
}> {
  const rtdb = getRealtimeDatabase();
  if (!rtdb) {
    throw new Error('Realtime Database is not configured.');
  }

  let data: InventoryData;
  try {
    data = JSON.parse(jsonData);
  } catch {
    throw new Error('Invalid JSON format.');
  }

  if (typeof data !== 'object' || data === null || Array.isArray(data)) {
    throw new Error('JSON must be an object with product IDs as keys.');
  }

  const errors: string[] = [];
  let imported = 0;

  for (const [id, product] of Object.entries(data)) {
    try {
      const productRef = ref(rtdb, `products/${id}`);
      await set(productRef, product);
      imported++;
    } catch (err) {
      errors.push(`Failed to import ${id}: ${err instanceof Error ? err.message : err}`);
    }
  }

  return { imported, errors };
}

// Get products that exist in Supabase but not in inventory (orphaned)
export async function findOrphanedProducts(): Promise<string[]> {
  const inventory = await fetchInventoryProducts();
  const inventoryIds = new Set(Object.keys(inventory));

  const { data, error } = await supabase.from('products').select('id');
  if (error) return [];

  const orphaned: string[] = [];
  (data ?? []).forEach((row) => {
    const id = (row as { id: string }).id;
    if (!inventoryIds.has(id)) orphaned.push(id);
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
  const { error } = await supabase
    .from('products')
    .update(productToRow(fields))
    .eq('id', id);
  if (error) throw error;
}
