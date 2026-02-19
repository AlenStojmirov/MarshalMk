'use client';

import { useState, useEffect } from 'react';
import {
  collection,
  getDocs,
  getDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  doc,
  query,
  where,
  orderBy,
  Timestamp,
} from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { db, storage } from '@/lib/firebase';
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
      const productsRef = collection(db, 'products');
      const q = query(productsRef, orderBy('createdAt', 'desc'));
      const [snapshot, imageMap] = await Promise.all([getDocs(q), fetchImageMap()]);

      const fetchedProducts: Product[] = snapshot.docs.map(doc => {
        const product = {
          id: doc.id,
          ...doc.data(),
          createdAt: doc.data().createdAt?.toDate() || new Date(),
          updatedAt: doc.data().updatedAt?.toDate() || new Date(),
        } as Product;
        return enrichWithLocalImages(product, imageMap);
      });

      setProducts(fetchedProducts);
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
        const docRef = doc(db, 'products', id);
        const [docSnap, imageMap] = await Promise.all([getDoc(docRef), fetchImageMap()]);

        if (docSnap.exists()) {
          const product = {
            id: docSnap.id,
            ...docSnap.data(),
            createdAt: docSnap.data().createdAt?.toDate() || new Date(),
            updatedAt: docSnap.data().updatedAt?.toDate() || new Date(),
          } as Product;
          setProduct(enrichWithLocalImages(product, imageMap));
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
        const productsRef = collection(db, 'products');
        const q = category
          ? query(productsRef, where('category', '==', category), orderBy('createdAt', 'desc'))
          : query(productsRef, orderBy('createdAt', 'desc'));

        const [snapshot, imageMap] = await Promise.all([getDocs(q), fetchImageMap()]);

        const fetchedProducts: Product[] = snapshot.docs.map(doc => {
          const product = {
            id: doc.id,
            ...doc.data(),
            createdAt: doc.data().createdAt?.toDate() || new Date(),
            updatedAt: doc.data().updatedAt?.toDate() || new Date(),
          } as Product;
          return enrichWithLocalImages(product, imageMap);
        });

        setProducts(fetchedProducts);
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

// Admin functions for product management
export async function uploadProductImage(file: File): Promise<string> {
  const fileName = `products/${Date.now()}-${file.name}`;
  const storageRef = ref(storage, fileName);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

export async function deleteProductImage(imageUrl: string): Promise<void> {
  try {
    const storageRef = ref(storage, imageUrl);
    await deleteObject(storageRef);
  } catch (err) {
    console.error('Failed to delete image:', err);
  }
}

export async function createProduct(data: ProductFormData, customId?: string): Promise<string> {
  const productData = {
    ...data,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };

  if (customId && customId.trim()) {
    // Use custom ID with setDoc
    const docRef = doc(db, 'products', customId.trim());
    await setDoc(docRef, productData);
    return customId.trim();
  } else {
    // Auto-generate ID with addDoc
    const productsRef = collection(db, 'products');
    const docRef = await addDoc(productsRef, productData);
    return docRef.id;
  }
}

export async function updateProduct(id: string, data: Partial<ProductFormData>): Promise<void> {
  const docRef = doc(db, 'products', id);
  await updateDoc(docRef, {
    ...data,
    updatedAt: Timestamp.now(),
  });
}

export async function deleteProduct(id: string): Promise<void> {
  const docRef = doc(db, 'products', id);
  await deleteDoc(docRef);
}

export function useCategories() {
  const [categories, setCategories] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCategories = async () => {
      try {
        setLoading(true);
        const productsRef = collection(db, 'products');
        const snapshot = await getDocs(productsRef);

        const categorySet = new Set<string>();
        snapshot.docs.forEach(doc => {
          const category = doc.data().category;
          if (category) {
            categorySet.add(category);
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
