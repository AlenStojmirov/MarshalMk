'use client';

import { useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useProducts } from '@/hooks/useProducts';
import { Product, SoldItem } from '@/types';
import {
  ArrowLeft,
  Package,
  Receipt,
  Calendar,
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';
import { useTranslation } from '@/lib/i18n';

interface ExpenseItem {
  product: Product;
  soldItem: SoldItem;
  soldIndex: number;
}

function ExpensesView() {
  const { t } = useTranslation();
  const { products, loading } = useProducts();

  // Get all products with expense items (sold at price 0)
  const expenseItems = useMemo(() => {
    const items: ExpenseItem[] = [];

    products.forEach(product => {
      if (product.sold && Array.isArray(product.sold)) {
        product.sold.forEach((soldItem, index) => {
          if (soldItem.price === 0 || soldItem.price === '0' as unknown as number) {
            items.push({
              product,
              soldItem,
              soldIndex: index,
            });
          }
        });
      }
    });

    // Sort by date (newest first)
    items.sort((a, b) => b.soldItem.soldDate.localeCompare(a.soldItem.soldDate));

    return items;
  }, [products]);

  // Group by date
  const groupedByDate = useMemo(() => {
    const grouped = new Map<string, ExpenseItem[]>();

    expenseItems.forEach(item => {
      const dateKey = item.soldItem.soldDate;
      const existing = grouped.get(dateKey) || [];
      grouped.set(dateKey, [...existing, item]);
    });

    return grouped;
  }, [expenseItems]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 sm:mb-8">
        <div className="flex items-center gap-3 sm:gap-4">
          <Link
            href="/admin"
            className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-xl sm:text-3xl font-bold text-gray-900 flex items-center gap-2">
              <Receipt className="h-6 w-6 sm:h-8 sm:w-8 text-orange-500" />
              {t('expenses.title')}
            </h1>
            <p className="text-sm sm:text-base text-gray-500">
              {t('expenses.subtitle', { count: expenseItems.length })}
            </p>
          </div>
        </div>
      </div>

      {/* Expense Items */}
      {loading ? (
        <div className="flex items-center justify-center py-8 sm:py-12">
          <div className="animate-spin h-10 w-10 sm:h-12 sm:w-12 border-4 border-blue-600 border-t-transparent rounded-full" />
        </div>
      ) : expenseItems.length === 0 ? (
        <div className="text-center py-8 sm:py-12 bg-white rounded-lg shadow-md px-4">
          <Receipt className="h-10 w-10 sm:h-12 sm:w-12 mx-auto text-gray-300 mb-3 sm:mb-4" />
          <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-1">{t('expenses.noExpenses')}</h3>
          <p className="text-sm sm:text-base text-gray-500">{t('expenses.noExpensesDescription')}</p>
        </div>
      ) : (
        <div className="space-y-4 sm:space-y-6">
          {Array.from(groupedByDate.entries()).map(([dateKey, items]) => (
            <div key={dateKey} className="bg-white rounded-lg shadow-md overflow-hidden">
              {/* Date Header */}
              <div className="bg-orange-50 px-3 sm:px-4 py-2 sm:py-3 border-b border-orange-100">
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 sm:h-5 sm:w-5 text-orange-500 shrink-0" />
                  <h3 className="font-bold text-gray-900 text-sm sm:text-base truncate">{formatDate(dateKey)}</h3>
                  <span className="ml-auto text-xs sm:text-sm text-gray-500 shrink-0">
                    {items.length} {t('expenses.items')}
                  </span>
                </div>
              </div>

              {/* Items */}
              <div className="divide-y divide-gray-100">
                {items.map((item, idx) => (
                  <Link
                    key={`${item.product.id}-${item.soldIndex}-${idx}`}
                    href={`/admin/product/${item.product.id}`}
                    className="flex items-center gap-2 sm:gap-4 p-3 sm:p-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="text-gray-400 font-bold w-6 sm:w-8 text-sm sm:text-base">{idx + 1}</div>

                    {item.product.imageUrl ? (
                      <div className="relative w-10 h-10 sm:w-12 sm:h-12 rounded-lg overflow-hidden bg-gray-100 shrink-0">
                        <Image
                          src={item.product.imageUrl}
                          alt={item.product.name}
                          fill
                          className="object-cover"
                          sizes="48px"
                        />
                      </div>
                    ) : (
                      <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                        <Package className="h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <h4 className="font-bold text-gray-900 truncate text-sm sm:text-base">{item.product.name}</h4>
                      <p className="text-xs sm:text-sm text-gray-500 truncate">
                        {item.product.brand} | {item.product.category}
                      </p>
                      <p className="text-xs sm:text-sm">
                        {t('expenses.size')}: <span className="font-bold">{item.soldItem.size}</span>
                      </p>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="inline-flex items-center px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-full text-xs font-medium bg-orange-100 text-orange-700">
                        {t('expenses.expense')}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function ExpensesPage() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Access Denied</h1>
          <p className="text-gray-500 mb-4">Please log in to access this page.</p>
          <Link href="/admin" className="text-blue-600 hover:text-blue-700 font-medium">
            Go to Admin Login
          </Link>
        </div>
      </div>
    );
  }

  return <ExpensesView />;
}
