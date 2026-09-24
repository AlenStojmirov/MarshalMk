'use client';

import { useState, useEffect } from 'react';
import { supabase, PRODUCT_IMAGES_BUCKET } from '@/lib/supabase';
import { rowToProduct, productToRow, ProductRow } from '@/lib/db-mappers';
import { Product, ProductFormData } from '@/types';

async function fetchImageMap(): Promise<Record<string, string[]>> {
  try {
    const res = await fetch('/api/product-images');
    if (res.ok) return res.json();
  } catch (e) {
    console.error('Failed to fetch product images:', e);
  }
  return {};
}

function enrichWithLocalImages(product: Product, imageMap: Record<string, string[]>): Product {
  const localImages = imageMap[product.id];
  if (localImages && localImages.length > 0) {
    return {
      ...product,
      imageUrl: localImages[0],
      images: localImages.slice(1),
    };
  }
  return product;
}

/**
 * The storefront's only way to read products (Task 8.1, migration 007).
 *
 * `products_public` carries the customer-facing columns of the products a
 * customer may see; the table itself, with purchase prices and every sale, is
 * closed to the anon key. Admin screens keep reading the table.
 *
 * Until migration 007 has run the view does not exist, and the storefront falls
 * back to the table rather than going blank — it is read the old way, leak and
 * all, for exactly as long as the migration waits.
 */
export const PUBLIC_PRODUCTS = 'products_public';

function isMissingRelation(err: { code?: string; message?: string } | null): boolean {
  if (!err) return false;
  return err.code === '42P01' || err.code === 'PGRST205' || /does not exist|schema cache/i.test(err.message ?? '');
}

async function readPublicProducts(category?: string) {
  const run = (table: string) => {
    let q = supabase.from(table).select('*').order('created_at', { ascending: false });
    if (category) q = q.eq('category', category);
    return q;
  };
  const res = await run(PUBLIC_PRODUCTS);
  return isMissingRelation(res.error) ? run('products') : res;
}

/**
 * Everything the storefront lists. Same rule as the server pages: visible and
 * with at least one unit on a size — the view already applies it, this also
 * covers the fallback.
 */
function isShoppable(p: Product): boolean {
  return p.isVisible !== false && (p.sizes ?? []).some((s) => s.quantity >= 1);
}

export function usePublicProducts(category?: string) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [{ data, error: dbError }, imageMap] = await Promise.all([
          readPublicProducts(category),
          fetchImageMap(),
        ]);
        if (dbError) throw dbError;
        const fetched = ((data as ProductRow[] | null) ?? [])
          .map(rowToProduct)
          .filter(isShoppable)
          .map((p) => enrichWithLocalImages(p, imageMap));
        if (!cancelled) { setProducts(fetched); setError(null); }
      } catch (err) {
        if (!cancelled) setError('Failed to fetch products');
        console.error(err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [category]);

  return { products, loading, error };
}

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const [{ data, error: dbError }, imageMap] = await Promise.all([
        supabase
          .from('products')
          .select('*')
          .order('created_at', { ascending: false }),
        fetchImageMap(),
      ]);

      if (dbError) throw dbError;

      const fetched = ((data as ProductRow[] | null) ?? [])
        .map(rowToProduct)
        .map((p) => enrichWithLocalImages(p, imageMap));

      setProducts(fetched);
      setError(null);
    } catch (err) {
      setError('Failed to fetch products');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProducts();
  }, []);

  return { products, loading, error, refetch: fetchProducts };
}

export function useProduct(id: string) {
  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        setLoading(true);
        const [{ data, error: dbError }, imageMap] = await Promise.all([
          supabase.from('products').select('*').eq('id', id).maybeSingle(),
          fetchImageMap(),
        ]);

        if (dbError) throw dbError;

        if (data) {
          setProduct(enrichWithLocalImages(rowToProduct(data as ProductRow), imageMap));
        } else {
          setError('Product not found');
        }
      } catch (err) {
        setError('Failed to fetch product');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    if (id) {
      fetchProduct();
    }
  }, [id]);

  return { product, loading, error };
}

/** Products in one category, for the storefront (related products). */
export function useProductsByCategory(category: string) {
  return usePublicProducts(category);
}

// ---------------------------------------------------------------------------
// Admin functions for product management
// ---------------------------------------------------------------------------

export async function uploadProductImage(file: File): Promise<string> {
  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

  const { error } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(path, file, { cacheControl: '3600', upsert: false });

  if (error) throw error;

  const { data } = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

export async function deleteProductImage(imageUrl: string): Promise<void> {
  try {
    // Extract the storage path from the public URL
    const marker = `/${PRODUCT_IMAGES_BUCKET}/`;
    const idx = imageUrl.indexOf(marker);
    if (idx === -1) return; // not a Supabase Storage URL, skip

    const path = imageUrl.substring(idx + marker.length);
    await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([path]);
  } catch (err) {
    console.error('Failed to delete image:', err);
  }
}

export async function createProduct(data: ProductFormData, customId?: string): Promise<string> {
  const id = customId?.trim() || `p_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  // Stock normally arrives through receiving, which stamps first_received_at.
  // A product created here already holding quantities skipped that step, so
  // it is stamped now — the goods are on the shelf today. Without it the
  // product has no age, and ageing and the velocity classes cannot judge it.
  // Until the Firebase sync stopped, every product got an age from the
  // estimate script; after the switch this is the only place one comes from.
  const units = (data.sizes ?? []).reduce((a, s) => a + Math.max(0, Number(s.quantity) || 0), 0);
  const received = units > 0
    ? { first_received_at: new Date().toISOString(), first_received_estimated: false }
    : {};

  const row = { id, ...productToRow(data), ...received };

  const { error } = await supabase.from('products').insert(row);
  if (error) throw error;
  return id;
}

export async function updateProduct(id: string, data: Partial<ProductFormData>): Promise<void> {
  const row = productToRow(data);
  const { error } = await supabase.from('products').update(row).eq('id', id);
  if (error) throw error;
}

export async function deleteProduct(id: string): Promise<void> {
  const { error } = await supabase.from('products').delete().eq('id', id);
  if (error) throw error;
}

export function useCategories() {
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setLoading(true);
        const read = (table: string) => supabase.from(table).select('category, is_visible, stock');
        let { data, error } = await read(PUBLIC_PRODUCTS);
        if (isMissingRelation(error)) ({ data, error } = await read('products'));

        if (error) throw error;

        const categorySet = new Set<string>();
        (data ?? []).forEach((row: { category: string; is_visible: boolean; stock: number }) => {
          if (row.category && row.is_visible !== false && row.stock > 0) {
            categorySet.add(row.category);
          }
        });

        setCategories(Array.from(categorySet).sort());
      } catch (err) {
        console.error('Failed to fetch categories:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchCategories();
  }, []);

  return { categories, loading };
}
