'use client';

import { useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { X, ShoppingBag, ArrowRight, Minus, Plus, Trash2 } from 'lucide-react';
import { useCart } from '@/context/CartContext';
import { useTranslation } from '@/lib/i18n';
import { getProductDisplayName } from '@/lib/product-display';
import { getEffectivePrice, isOnSale } from '@/lib/pricing';
import FreeShippingProgress from './FreeShippingProgress';

export default function MiniCart() {
  const {
    items,
    totalItems,
    totalPrice,
    isMiniCartOpen,
    closeMiniCart,
    updateQuantity,
    removeFromCart,
  } = useCart();
  const { t } = useTranslation();

  // Lock body scroll when drawer is open
  useEffect(() => {
    if (!isMiniCartOpen) return;
    const original = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = original;
    };
  }, [isMiniCartOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isMiniCartOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeMiniCart();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isMiniCartOpen, closeMiniCart]);

  return (
    <div
      className={`fixed inset-0 z-[60] ${isMiniCartOpen ? '' : 'pointer-events-none'}`}
      aria-hidden={!isMiniCartOpen}
    >
      {/* Backdrop */}
      <div
        onClick={closeMiniCart}
        className={`absolute inset-0 bg-black/40 backdrop-blur-[2px] transition-opacity duration-300 ${
          isMiniCartOpen ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={t('cart.title')}
        className={`absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl flex flex-col transition-transform duration-300 ease-out will-change-transform ${
          isMiniCartOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="h-5 w-5 text-gray-700" />
            <div>
              <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">
                {t('cart.title')}
              </h2>
              <p className="text-[11px] text-gray-500">
                {t('cart.miniCartSubtitle', { count: totalItems.toString() })}
              </p>
            </div>
          </div>
          <button
            onClick={closeMiniCart}
            aria-label="Close cart"
            className="p-2 rounded-full text-gray-500 hover:text-gray-900 hover:bg-gray-100 active:scale-95 transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Items */}
        {items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
              <ShoppingBag className="h-8 w-8 text-gray-300" />
            </div>
            <p className="text-base text-gray-700 font-medium mb-1">{t('cart.empty')}</p>
            <p className="text-sm text-gray-400 mb-6">{t('cart.emptyDescription')}</p>
            <button
              onClick={closeMiniCart}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white text-sm font-medium rounded-lg hover:bg-gray-800 active:scale-[0.98] transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
            >
              {t('cart.continueShopping')}
            </button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto px-5 py-3 divide-y divide-gray-100">
            {items.map((item) => {
              const { product, quantity, selectedSize } = item;
              const onSale = isOnSale(product);
              const unitPrice = getEffectivePrice(product);
              const lineTotal = unitPrice * quantity;
              const maxStock =
                selectedSize && product.sizes
                  ? product.sizes.find((s) => s.size === selectedSize)?.quantity || 0
                  : product.stock;

              return (
                <div
                  key={`${product.id}-${selectedSize || ''}`}
                  className="flex gap-3 py-4 first:pt-2 last:pb-2"
                >
                  <Link
                    href={`/product/${product.id}`}
                    onClick={closeMiniCart}
                    className="shrink-0 group"
                  >
                    <div
                      className={`relative w-20 h-24 rounded-md overflow-hidden bg-gray-50 ring-1 ${
                        onSale ? 'ring-red-200' : 'ring-gray-100'
                      }`}
                    >
                      {product.imageUrl ? (
                        <Image
                          src={product.imageUrl}
                          alt={getProductDisplayName(product.name, product.category, product.brand)}
                          fill
                          className="object-cover transition-transform duration-300 group-hover:scale-105"
                          sizes="80px"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400">
                          {t('common.noImage')}
                        </div>
                      )}
                    </div>
                  </Link>

                  <div className="flex-1 min-w-0 flex flex-col">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        href={`/product/${product.id}`}
                        onClick={closeMiniCart}
                        className="text-sm font-medium text-gray-900 hover:text-gray-600 line-clamp-2 leading-snug transition-colors duration-150"
                      >
                        {getProductDisplayName(product.name, product.category, product.brand)}
                      </Link>
                      <button
                        onClick={() => removeFromCart(product.id, selectedSize)}
                        aria-label={t('cart.removeItem')}
                        title={t('cart.removeItem')}
                        className="shrink-0 text-gray-300 hover:text-red-500 hover:bg-red-50 active:scale-95 p-1 rounded-md transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>

                    {selectedSize && (
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {t('cart.size')}:{' '}
                        <span className="text-gray-700 font-medium">{selectedSize}</span>
                      </p>
                    )}

                    <div className="mt-auto pt-2 flex items-center justify-between gap-2">
                      {/* Qty */}
                      <div className="flex items-center border border-gray-200 rounded-md overflow-hidden">
                        <button
                          onClick={() =>
                            updateQuantity(product.id, quantity - 1, selectedSize)
                          }
                          disabled={quantity <= 1}
                          aria-label="Decrease quantity"
                          className="p-1.5 text-gray-500 hover:bg-gray-100 active:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors duration-150"
                        >
                          <Minus className="h-3 w-3" />
                        </button>
                        <span className="w-7 text-center text-xs font-semibold text-gray-900 tabular-nums">
                          {quantity}
                        </span>
                        <button
                          onClick={() =>
                            updateQuantity(product.id, quantity + 1, selectedSize)
                          }
                          disabled={quantity >= maxStock}
                          aria-label="Increase quantity"
                          className="p-1.5 text-gray-500 hover:bg-gray-100 active:bg-gray-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors duration-150"
                        >
                          <Plus className="h-3 w-3" />
                        </button>
                      </div>

                      {/* Line total */}
                      <div className="text-right">
                        <p
                          className={`text-sm font-bold tabular-nums whitespace-nowrap ${
                            onSale ? 'text-red-600' : 'text-gray-900'
                          }`}
                        >
                          {lineTotal.toFixed(2)} ден.
                        </p>
                        {onSale && (
                          <p className="text-[10px] text-gray-400 line-through tabular-nums">
                            {(product.price * quantity).toFixed(2)} ден.
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        {items.length > 0 && (
          <div className="border-t border-gray-100 px-5 py-4 bg-white">
            <FreeShippingProgress
              subtotal={totalPrice}
              variant="compact"
              className="mb-4"
            />
            <div className="flex items-baseline justify-between mb-4">
              <span className="text-sm font-semibold uppercase tracking-wider text-gray-700">
                {t('cart.subtotal')}
              </span>
              <span className="text-lg font-bold text-gray-900 tabular-nums">
                {totalPrice.toFixed(2)} ден.
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <Link
                href="/cart"
                onClick={closeMiniCart}
                className="flex items-center justify-center gap-1.5 py-3 px-4 border border-gray-300 text-gray-900 text-xs font-semibold uppercase tracking-wider rounded-lg hover:bg-gray-50 hover:border-gray-900 active:scale-[0.98] transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
              >
                {t('cart.viewCart')}
              </Link>
              <Link
                href="/checkout"
                onClick={closeMiniCart}
                className="flex items-center justify-center gap-1.5 py-3 px-4 bg-gray-900 text-white text-xs font-semibold uppercase tracking-wider rounded-lg shadow-md hover:bg-black hover:shadow-lg hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.98] transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-900 focus-visible:ring-offset-2"
              >
                {t('cart.checkout')}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>

            <p className="text-[11px] text-gray-400 text-center mt-3">
              {t('cart.freeShipping')}
            </p>
          </div>
        )}
      </aside>
    </div>
  );
}
