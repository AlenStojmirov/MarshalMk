'use client';

import { useState, useEffect } from 'react';
import { menuEntries, type MenuEntry } from '@/config/categories';
import { PUBLIC_PRODUCTS, isMissingRelation } from '@/lib/product-views';

/**
 * The header's categories (Task 2.4): the groups with something on the shelf,
 * in this season's order, then any raw category no group holds yet. The root
 * layout reads them on the server (Task 16.2) and passes them in; only when
 * that read came back empty (Supabase down at render time) does the browser
 * ask itself, as it did before — fetching the Supabase client for that alone,
 * since the header is on every page (16.11).
 */
export function useCategories(fromServer: MenuEntry[] = []) {
  const served = fromServer.length > 0;
  const [entries, setEntries] = useState<MenuEntry[]>([]);
  const [loading, setLoading] = useState(!served);

  useEffect(() => {
    if (served) return;
    const fetchCategories = async () => {
      try {
        const { supabase } = await import('@/lib/supabase');
        const read = (table: string) => supabase.from(table).select('category, is_visible, stock');
        let { data, error } = await read(PUBLIC_PRODUCTS);
        if (isMissingRelation(error)) ({ data, error } = await read('products'));

        if (error) throw error;

        const shelf = (data ?? [])
          .filter((row: { category: string; is_visible: boolean; stock: number }) =>
            row.category && row.is_visible !== false && row.stock > 0)
          .map((row: { category: string }) => row.category);

        setEntries(menuEntries(shelf));
      } catch (err) {
        console.error('Failed to fetch categories:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchCategories();
  }, [served]);

  return served ? { entries: fromServer, loading: false } : { entries, loading };
}
