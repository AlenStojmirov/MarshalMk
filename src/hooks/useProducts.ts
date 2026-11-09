'use client';

import { useState, useEffect } from 'react';
import { supabase, PRODUCT_IMAGES_BUCKET } from '@/lib/supabase';
import { rowToProduct, productToRow, ProductRow } from '@/lib/db-mappers';
import { Product, ProductFormData } from '@/types';
import { COSTED_PRODUCTS, isMissingRelation } from '@/lib/product-views';

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

export function useProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = async () => {
    try {
      setLoading(true);
      const read = (table: string) =>
        supabase.from(table).select('*').order('created_at', { ascending: false });
      const [first, imageMap] = await Promise.all([read(COSTED_PRODUCTS), fetchImageMap()]);
      const { data, error: dbError } = isMissingRelation(first.error) ? await read('products') : first;

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
  // Bumped by refetch() — after an edit, so the page shows what was saved.
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const fetchProduct = async () => {
      try {
        // Only the first read blanks the page; a refetch keeps it on screen.
        if (version === 0) setLoading(true);
        const read = (table: string) => supabase.from(table).select('*').eq('id', id).maybeSingle();
        const [first, imageMap] = await Promise.all([read(COSTED_PRODUCTS), fetchImageMap()]);
        const { data, error: dbError } = isMissingRelation(first.error) ? await read('products') : first;

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
  }, [id, version]);

  return { product, loading, error, refetch: () => setVersion((v) => v + 1) };
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
