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

export function useProductsByCategory(category: string) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        setLoading(true);
        let query = supabase
          .from('products')
          .select('*')
          .order('created_at', { ascending: false });

        if (category) {
          query = query.eq('category', category);
        }

        const [{ data, error: dbError }, imageMap] = await Promise.all([
          query,
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

    fetchProducts();
  }, [category]);

  return { products, loading, error };
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
  const row = { id, ...productToRow(data) };

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
        const { data, error } = await supabase
          .from('products')
          .select('category, is_visible, stock');

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
