'use client';

import Link from 'next/link';
import { usePublicProducts } from '@/hooks/useProducts';
import { useMemo } from 'react';
import { ChevronRight } from 'lucide-react';
import { useTranslation } from '@/lib/i18n';
import { canonicalCategory, groupOfCategory, menuEntries, slugOf } from '@/config/categories';

/**
 * Every group with something on the shelf (Task 2.4), in this season's order,
 * each with the kinds it holds now. The 404 page links here.
 */
export default function CategoriesPage() {
  const { products, loading } = usePublicProducts();
  const { t } = useTranslation();

  const entries = useMemo(() => menuEntries(products.map((p) => p.category)), [products]);

  // The kinds on the shelf per group, in the group's own order.
  const kinds = useMemo(() => {
    const on = new Set(products.map((p) => slugOf(canonicalCategory(p.category))));
    const out = new Map<string, string[]>();
    for (const p of products) {
      const g = groupOfCategory(p.category);
      if (g && !out.has(g.key)) out.set(g.key, g.categories.filter((c) => on.has(slugOf(c))));
    }
    return out;
  }, [products]);

  const named = (key: string, fallback: string) => {
    const s = t(key);
    return s === key ? fallback : s;
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">{t('categories.title')}</h1>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white rounded-lg shadow-md p-6 animate-pulse">
              <div className="h-6 bg-gray-200 rounded w-2/3 mb-2" />
              <div className="h-4 bg-gray-200 rounded w-1/3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <h1 className="text-3xl font-bold text-gray-900 mb-8">{t('categories.title')}</h1>

      {entries.length === 0 ? (
        <p className="text-gray-500 text-center py-12">{t('categories.noCategories')}</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {entries.map((entry) => {
            const title = entry.kind === 'group'
              ? named(`categoryGroups.${entry.key}`, entry.key)
              : named(`categoryNames.${entry.key}`, entry.key);
            const holds = entry.kind === 'group' ? kinds.get(entry.key) ?? [] : [];
            return (
              <Link
                key={entry.href}
                href={entry.href}
                className="group bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
              >
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="text-xl font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                      {title}
                    </h2>
                    <p className="text-gray-500">
                      {t('categories.productCount', { count: entry.count.toString() })}
                    </p>
                    {holds.length > 1 && (
                      <p className="text-sm text-gray-400 mt-1">
                        {holds.map((c) => named(`categoryNames.${c}`, c)).join(' · ')}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="h-6 w-6 shrink-0 text-gray-400 group-hover:text-blue-600 transition-colors" />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
