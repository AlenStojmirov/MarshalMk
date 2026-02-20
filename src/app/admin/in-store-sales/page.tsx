'use client';

import { useState, useMemo } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useProducts } from '@/hooks/useProducts';
import {
  recordProductSale,
  getAllSoldItems,
  groupSoldItemsByDate,
  calculateDailyTotal,
  getProductsSoldOnDate,
} from '@/hooks/useInStoreSales';
import { Product } from '@/types';
import {
  ArrowLeft,
  Plus,
  Trash2,
  Calendar,
  Search,
  ShoppingBag,
  DollarSign,
  Package,
  ChevronDown,
  ChevronUp,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { useTranslation } from '@/lib/i18n';

interface SaleCartItem {
  product: Product;
  size: string;
  price: number;
  quantity: number;
}

function RecordSaleModal({
  products,
  onSave,
  onCancel,
}: {
  products: Product[];
  onSave: (items: SaleCartItem[], saleDate: string) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [items, setItems] = useState<SaleCartItem[]>([]);
  const [saleDate, setSaleDate] = useState(new Date().toISOString().split('T')[0]);
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showProductPicker, setShowProductPicker] = useState(false);

  const filteredProducts = useMemo(() => {
    if (!searchTerm) return products;
    const term = searchTerm.toLowerCase();
    return products.filter(
      p => p.name.toLowerCase().includes(term) || p.id.toLowerCase().includes(term)
    );
  }, [products, searchTerm]);

  const addProduct = (product: Product, size?: string) => {
    const existingIndex = items.findIndex(
      item => item.product.id === product.id && item.size === (size || '')
    );

    if (existingIndex >= 0) {
      const newItems = [...items];
      newItems[existingIndex].quantity += 1;
      setItems(newItems);
    } else {
      setItems([
        ...items,
        {
          product,
          size: size || '',
          price: product.price,
          quantity: 1,
        },
      ]);
    }
    setShowProductPicker(false);
    setSearchTerm('');
  };

  const updateQuantity = (index: number, quantity: number) => {
    if (quantity < 1) return;
    const newItems = [...items];
    newItems[index].quantity = quantity;
    setItems(newItems);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (items.length === 0) {
      alert(t('inStoreSales.addAtLeastOneProduct'));
      return;
    }
    setSaving(true);
    try {
      await onSave(items, saleDate);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-2 sm:p-4 z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[95vh] sm:max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-3 sm:p-4 border-b sticky top-0 bg-white z-10">
          <h2 className="text-lg sm:text-xl font-bold text-gray-900">{t('inStoreSales.recordSale')}</h2>
          <button onClick={onCancel} className="text-gray-500 hover:text-gray-700 p-1">
            <X className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-6 space-y-4 sm:space-y-6">
          {/* Sale Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('inStoreSales.saleDate')}
            </label>
            <input
              type="date"
              value={saleDate}
              onChange={e => setSaleDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Products */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              {t('inStoreSales.products')}
            </label>

            {/* Add Product Button */}
            <button
              type="button"
              onClick={() => setShowProductPicker(true)}
              className="flex items-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 rounded-lg w-full justify-center text-gray-600 hover:border-blue-500 hover:text-blue-600 transition-colors mb-4"
            >
              <Plus className="h-5 w-5" />
              {t('inStoreSales.addProduct')}
            </button>

            {/* Product Picker Dropdown */}
            {showProductPicker && (
              <div className="border border-gray-200 rounded-lg p-4 mb-4 bg-gray-50">
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder={t('inStoreSales.searchProducts')}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    autoFocus
                  />
                </div>
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {filteredProducts.slice(0, 10).map(product => (
                    <div key={product.id}>
                      {product.sizes && product.sizes.length > 0 ? (
                        <div className="bg-white rounded-lg p-2">
                          <div className="font-medium text-gray-900 mb-1">{product.name}</div>
                          <div className="flex flex-wrap gap-1">
                            {product.sizes.map(size => (
                              <button
                                key={size.size}
                                type="button"
                                onClick={() => addProduct(product, size.size)}
                                disabled={size.quantity === 0}
                                className="px-2 py-1 text-xs rounded bg-gray-100 hover:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
                              >
                                {size.size} ({size.quantity})
                              </button>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => addProduct(product)}
                          className="w-full text-left px-3 py-2 rounded-lg hover:bg-white flex justify-between items-center"
                        >
                          <span className="font-medium text-gray-900">{product.name}</span>
                          <span className="text-sm text-gray-500">
                            {product.price.toFixed(2)} ден. ({product.stock} {t('inStoreSales.inStock')})
                          </span>
                        </button>
                      )}
                    </div>
                  ))}
                  {filteredProducts.length === 0 && (
                    <p className="text-center text-gray-500 py-4">{t('inStoreSales.noProductsFound')}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setShowProductPicker(false);
                    setSearchTerm('');
                  }}
                  className="mt-3 text-sm text-gray-500 hover:text-gray-700"
                >
                  {t('common.cancel')}
                </button>
              </div>
            )}

            {/* Selected Items */}
            {items.length > 0 ? (
              <div className="space-y-2">
                {items.map((item, index) => (
                  <div
                    key={`${item.product.id}-${item.size || 'nosize'}`}
                    className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="font-medium text-gray-900">
                        {item.product.name}
                        {item.size && (
                          <span className="ml-2 text-sm text-gray-500">({item.size})</span>
                        )}
                      </div>
                      <div className="text-sm text-gray-500">{item.price.toFixed(2)} ден. each</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateQuantity(index, item.quantity - 1)}
                        className="w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center"
                      >
                        -
                      </button>
                      <span className="w-8 text-center font-medium">{item.quantity}</span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(index, item.quantity + 1)}
                        className="w-8 h-8 rounded-full bg-gray-200 hover:bg-gray-300 flex items-center justify-center"
                      >
                        +
                      </button>
                    </div>
                    <div className="w-24 text-right font-medium">
                      {(item.price * item.quantity).toFixed(2)} ден.
                    </div>
                    <button
                      type="button"
                      onClick={() => removeItem(index)}
                      className="p-1 text-gray-400 hover:text-red-600"
                    >
                      <Trash2 className="h-5 w-5" />
                    </button>
                  </div>
                ))}
                <div className="flex justify-between items-center pt-3 border-t mt-3">
                  <span className="text-lg font-bold text-gray-900">{t('inStoreSales.total')}</span>
                  <span className="text-xl font-bold text-gray-900">{total.toFixed(2)} ден.</span>
                </div>
              </div>
            ) : (
              <p className="text-center text-gray-500 py-4">{t('inStoreSales.noItemsAdded')}</p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 border border-gray-300 rounded-lg font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              {t('common.cancel')}
            </button>
            <button
              type="submit"
              disabled={saving || items.length === 0}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              <ShoppingBag className="h-4 w-4" />
              {saving ? t('inStoreSales.saving') : t('inStoreSales.recordSale')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function SalesByDateView() {
  const { t } = useTranslation();
  const { products, loading, refetch } = useProducts();
  const [showRecordModal, setShowRecordModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [filterDate, setFilterDate] = useState('');

  // Aggregate sold items from all products
  const allSoldItems = useMemo(() => getAllSoldItems(products), [products]);
  const groupedSales = useMemo(() => groupSoldItemsByDate(allSoldItems), [allSoldItems]);

  const filteredDates = useMemo(() => {
    const dates = Array.from(groupedSales.keys()).sort((a, b) => b.localeCompare(a));
    if (!filterDate) return dates;
    return dates.filter(date => date === filterDate);
  }, [groupedSales, filterDate]);

  const handleRecordSale = async (items: SaleCartItem[], saleDate: string) => {
    // For each item, call recordProductSale once per quantity unit
    for (const item of items) {
      for (let i = 0; i < item.quantity; i++) {
        await recordProductSale(item.product, item.size, item.price, saleDate);
        // Update the product reference for subsequent calls (stock/sizes changed)
        if (i < item.quantity - 1) {
          item.product = {
            ...item.product,
            sizes: item.product.sizes?.map(sz =>
              sz.size === item.size
                ? { ...sz, quantity: Math.max(0, sz.quantity - 1) }
                : sz
            ),
            sold: [...(item.product.sold || []), { size: item.size, price: item.price, soldDate: saleDate }],
            stock: Math.max(0, item.product.stock - 1),
          };
        }
      }
    }
    setShowRecordModal(false);
    refetch();
  };

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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6 sm:mb-8">
        <div className="flex items-center gap-3 sm:gap-4">
          <Link
            href="/admin"
            className="p-1.5 sm:p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5 text-gray-600" />
          </Link>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{t('inStoreSales.title')}</h1>
            <p className="text-sm sm:text-base text-gray-500">{t('inStoreSales.subtitle')}</p>
          </div>
        </div>
        <button
          onClick={() => setShowRecordModal(true)}
          className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors text-sm sm:text-base"
        >
          <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
          {t('inStoreSales.recordSale')}
        </button>
      </div>

      {/* Date Filter */}
      <div className="mb-4 sm:mb-6">
        <div className="flex items-center gap-2 max-w-full sm:max-w-xs">
          <div className="relative flex-1">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 sm:h-5 sm:w-5 text-gray-400" />
            <input
              type="date"
              value={filterDate}
              onChange={e => setFilterDate(e.target.value)}
              className="w-full pl-9 sm:pl-10 pr-3 sm:pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm sm:text-base"
              placeholder={t('inStoreSales.filterByDate')}
            />
          </div>
          {filterDate && (
            <button
              onClick={() => setFilterDate('')}
              className="p-1.5 sm:p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
              title={t('common.cancel')}
            >
              <X className="h-4 w-4 sm:h-5 sm:w-5" />
            </button>
          )}
        </div>
      </div>

      {/* Sales List */}
      {loading ? (
        <div className="flex items-center justify-center py-8 sm:py-12">
          <div className="animate-spin h-10 w-10 sm:h-12 sm:w-12 border-4 border-blue-600 border-t-transparent rounded-full" />
        </div>
      ) : filteredDates.length === 0 ? (
        <div className="text-center py-8 sm:py-12 bg-white rounded-lg shadow-md px-4">
          <ShoppingBag className="h-10 w-10 sm:h-12 sm:w-12 mx-auto text-gray-300 mb-3 sm:mb-4" />
          <h3 className="text-base sm:text-lg font-medium text-gray-900 mb-1">{t('inStoreSales.noSalesFound')}</h3>
          <p className="text-sm sm:text-base text-gray-500">{t('inStoreSales.noSalesDescription')}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredDates.map(dateKey => {
            const dateItems = groupedSales.get(dateKey) || [];
            const dailyTotal = calculateDailyTotal(dateItems);
            const productsSold = getProductsSoldOnDate(dateItems);
            const isExpanded = selectedDate === dateKey;

            return (
              <div key={dateKey} className="bg-white rounded-lg shadow-md overflow-hidden">
                {/* Date Header */}
                <button
                  onClick={() => setSelectedDate(isExpanded ? null : dateKey)}
                  className="w-full flex flex-col sm:flex-row sm:items-center justify-between p-3 sm:p-4 hover:bg-gray-50 transition-colors gap-3 sm:gap-4"
                >
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 bg-blue-100 rounded-lg flex items-center justify-center shrink-0">
                      <Calendar className="h-5 w-5 sm:h-6 sm:w-6 text-blue-600" />
                    </div>
                    <div className="text-left min-w-0">
                      <h3 className="font-bold text-gray-900 text-sm sm:text-base truncate">{formatDate(dateKey)}</h3>
                      <p className="text-xs sm:text-sm text-gray-500">
                        {dateItems.length} {t('inStoreSales.sold')} | {productsSold.size} {t('inStoreSales.uniqueProducts')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4 ml-13 sm:ml-0">
                    <div className="text-left sm:text-right">
                      <p className="text-base sm:text-lg font-bold text-gray-900">{dailyTotal.toFixed(2)} ден.</p>
                      <p className="text-xs sm:text-sm text-gray-500">{t('inStoreSales.totalSales')}</p>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="h-5 w-5 text-gray-400 shrink-0" />
                    ) : (
                      <ChevronDown className="h-5 w-5 text-gray-400 shrink-0" />
                    )}
                  </div>
                </button>

                {/* Expanded Details */}
                {isExpanded && (
                  <div className="border-t">
                    {/* Products Sold Summary */}
                    <div className="p-3 sm:p-4 bg-gray-50">
                      <h4 className="font-medium text-gray-700 mb-2 sm:mb-3 flex items-center gap-2 text-sm sm:text-base">
                        <Package className="h-4 w-4" />
                        {t('inStoreSales.productsSold')}
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
                        {Array.from(productsSold.entries()).map(([productId, data]) => (
                          <div key={productId} className="bg-white p-2 sm:p-3 rounded-lg">
                            <p className="font-medium text-gray-900 text-sm truncate">{data.name}</p>
                            <div className="flex justify-between text-xs sm:text-sm text-gray-500 mt-1">
                              <span>{data.quantity} {t('inStoreSales.sold')}</span>
                              <span>{data.revenue.toFixed(2)} ден.</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Individual Items */}
                    <div className="p-3 sm:p-4">
                      <h4 className="font-medium text-gray-700 mb-2 sm:mb-3 flex items-center gap-2 text-sm sm:text-base">
                        <DollarSign className="h-4 w-4" />
                        {t('inStoreSales.sold')}
                      </h4>
                      <div className="space-y-2">
                        {dateItems.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-xs sm:text-sm border border-gray-200 rounded-lg p-2 sm:p-3">
                            <span className="text-gray-600 truncate mr-2">
                              {item.productName}
                              {item.size && ` (${item.size})`}
                            </span>
                            <span className="text-gray-900 shrink-0 font-medium">
                              {item.price.toFixed(2)} ден.
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Record Sale Modal */}
      {showRecordModal && (
        <RecordSaleModal
          products={products}
          onSave={handleRecordSale}
          onCancel={() => setShowRecordModal(false)}
        />
      )}
    </div>
  );
}

export default function InStoreSalesPage() {
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
          <Link
            href="/admin"
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            Go to Admin Login
          </Link>
        </div>
      </div>
    );
  }

  return <SalesByDateView />;
}
