'use client';

import Link from 'next/link';
import { ArrowLeft, ShoppingBag, Trash2, ShieldCheck } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import CartItemComponent from '@/components/CartItem';
import { useTranslation } from '@/lib/i18n';
import { getShippingCost, getShippingLabel } from '@/config/shipping';
import { getEffectivePrice } from '@/lib/pricing';

export default function CartPage() {
  const { items, totalItems, totalPrice, clearCart } = useCart();
  const { t } = useTranslation();

  const totalSavings = items.reduce(
    (sum, item) => sum + (item.product.price - getEffectivePrice(item.product)) * item.quantity,
    0
  );

  if (items.length === 0) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-md">
          <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <ShoppingBag className="h-10 w-10 text-gray-300" />
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-3">{t('cart.title')}</h1>
          <p className="text-lg text-gray-500 mb-1">{t('cart.empty')}</p>
          <p className="text-gray-400 mb-8">{t('cart.emptyDescription')}</p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 active:bg-blue-800 transition-all duration-200"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('cart.continueShopping')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 sm:mb-10">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{t('cart.title')}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {totalItems} {t('cart.items').toLowerCase()}
          </p>
        </div>
        <button
          onClick={clearCart}
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-red-500 transition-colors duration-200"
        >
          <Trash2 className="h-4 w-4" />
          <span className="hidden sm:inline">{t('cart.clearCart')}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10">
        {/* Cart Items */}
        <div className="lg:col-span-7 xl:col-span-8">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm divide-y divide-gray-100">
            {items.map(item => (
              <CartItemComponent key={`${item.product.id}-${item.selectedSize || ''}`} item={item} />
            ))}
          </div>

          {/* Continue Shopping Link - Desktop */}
          <Link
            href="/"
            className="hidden sm:inline-flex items-center gap-2 mt-6 text-sm text-gray-500 hover:text-blue-600 transition-colors duration-200"
          >
            <ArrowLeft className="h-4 w-4" />
            {t('cart.continueShopping')}
          </Link>
        </div>

        {/* Order Summary */}
        <div className="lg:col-span-5 xl:col-span-4">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 sm:p-6 lg:sticky lg:top-24">
            <h2 className="text-lg font-bold text-gray-900 mb-5">{t('cart.orderSummary')}</h2>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between text-gray-600">
                <span>{t('cart.items')} ({totalItems})</span>
                <span>{totalPrice.toFixed(2)} ден.</span>
              </div>
              {totalSavings > 0 && (
                <div className="flex justify-between items-center bg-red-50 border border-red-100 -mx-1 px-3 py-2 rounded-md">
                  <span className="text-red-700 font-medium flex items-center gap-1.5">
                    <span className="inline-block bg-red-600 text-white text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded">
                      {t('product.sale')}
                    </span>
                    {t('cart.youSaved')}
                  </span>
                  <span className="text-red-700 font-semibold tabular-nums">
                    -{totalSavings.toFixed(2)} ден.
                  </span>
                </div>
              )}
              <div className="flex justify-between text-gray-600">
                <span>{t('common.shipping')}</span>
                <span className="text-emerald-600 font-medium">{getShippingLabel(totalPrice, t('common.free'))}</span>
              </div>
            </div>

            <div className="border-t border-dashed border-gray-200 my-4" />

            <div className="flex justify-between items-baseline mb-6">
              <span className="text-base font-bold text-gray-900">{t('common.total')}</span>
              <span className="text-xl font-bold text-gray-900">{(totalPrice + getShippingCost(totalPrice)).toFixed(2)} ден.</span>
            </div>

            <div className="space-y-3">
              <Link
                href="/checkout"
                className="block w-full py-3.5 px-6 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 active:bg-blue-800 transition-all duration-200 text-center shadow-sm shadow-blue-600/20"
              >
                {t('cart.proceedToCheckout')}
              </Link>
              <Link
                href="/"
                className="block w-full py-3.5 px-6 text-center border border-gray-200 rounded-lg font-medium text-gray-600 hover:bg-gray-50 hover:border-gray-300 active:bg-gray-100 transition-all duration-200 sm:hidden"
              >
                {t('cart.continueShopping')}
              </Link>
            </div>

            <div className="flex items-center justify-center gap-1.5 mt-5">
              <ShieldCheck className="h-4 w-4 text-gray-400" />
              <p className="text-xs text-gray-400">
                {t('cart.freeShipping')}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
