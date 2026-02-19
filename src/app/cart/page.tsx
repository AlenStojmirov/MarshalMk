'use client';

import Link from 'next/link';
import { ArrowLeft, ShoppingBag, Trash2 } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import CartItemComponent from '@/components/CartItem';
import { useTranslation } from '@/lib/i18n';

export default function CartPage() {
  const { items, totalItems, totalPrice, clearCart } = useCart();
  const { t } = useTranslation();

  if (items.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">{t('cart.title')}</h1>
        <div className="text-center py-16">
          <ShoppingBag className="h-16 w-16 text-gray-300 mx-auto mb-4" />
          <p className="text-xl text-gray-500 mb-2">{t('cart.empty')}</p>
          <p className="text-gray-400 mb-4">{t('cart.emptyDescription')}</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 font-medium"
          >
            <ArrowLeft className="h-5 w-5" />
            {t('cart.continueShopping')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold text-gray-900">{t('cart.title')}</h1>
        <button
          onClick={clearCart}
          className="flex items-center gap-2 text-red-500 hover:text-red-700 transition-colors"
        >
          <Trash2 className="h-5 w-5" />
          {t('cart.clearCart')}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Cart Items */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow-md p-6">
            {items.map(item => (
              <CartItemComponent key={`${item.product.id}-${item.selectedSize || ''}`} item={item} />
            ))}
          </div>
        </div>

        {/* Order Summary */}
        <div className="lg:col-span-1">
          <div className="bg-white rounded-lg shadow-md p-6 sticky top-24">
            <h2 className="text-xl font-bold text-gray-900 mb-4">{t('cart.orderSummary')}</h2>

            <div className="space-y-3 mb-6">
              <div className="flex justify-between text-gray-600">
                <span>{t('cart.items')} ({totalItems})</span>
                <span>{totalPrice.toFixed(2)} ден.</span>
              </div>
              <div className="flex justify-between text-gray-600">
                <span>{t('common.shipping')}</span>
                <span className="text-green-600">{t('common.free')}</span>
              </div>
              <hr />
              <div className="flex justify-between text-lg font-bold text-gray-900">
                <span>{t('common.total')}</span>
                <span>{totalPrice.toFixed(2)} ден.</span>
              </div>
            </div>

            <div className="space-y-3">
              <Link
                href="/checkout"
                className="block w-full py-3 px-6 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors text-center"
              >
                {t('cart.proceedToCheckout')}
              </Link>
              <Link
                href="/"
                className="block w-full py-3 px-6 text-center border border-gray-300 rounded-lg font-semibold text-gray-700 hover:bg-gray-50 transition-colors"
              >
                {t('cart.continueShopping')}
              </Link>
            </div>

            <p className="text-sm text-gray-500 mt-4 text-center">
              {t('cart.freeShipping')}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
