'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { CartItem as CartItemType } from '@/types';
import { useCart } from '@/context/CartContext';
import { useTranslation } from '@/lib/i18n';
import { getProductDisplayName } from '@/lib/product-display';

interface CartItemProps {
  item: CartItemType;
}

export default function CartItem({ item }: CartItemProps) {
  const { updateQuantity, removeFromCart } = useCart();
  const { t } = useTranslation();
  const { product, quantity, selectedSize } = item;

  // Get max stock based on size or total stock
  const maxStock = selectedSize && product.sizes
    ? product.sizes.find(s => s.size === selectedSize)?.quantity || 0
    : product.stock;

  return (
    <div className="flex gap-3 sm:gap-4 p-4 sm:p-5 group">
      {/* Product Image */}
      <Link href={`/product/${product.id}`} className="shrink-0">
        <div className="relative w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden bg-gray-50 ring-1 ring-gray-100">
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={getProductDisplayName(product.name, product.category, product.brand)}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-300"
              sizes="(max-width: 640px) 80px, 96px"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
              {t('common.noImage')}
            </div>
          )}
        </div>
      </Link>

      {/* Product Details & Controls */}
      <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
        {/* Info */}
        <div className="flex-1 min-w-0">
          <Link href={`/product/${product.id}`}>
            <h3 className="text-sm sm:text-base font-medium text-gray-900 hover:text-blue-600 transition-colors duration-200 line-clamp-2">
              {getProductDisplayName(product.name, product.category, product.brand)}
            </h3>
          </Link>
          <p className="text-xs text-gray-400 mt-0.5">{t('categoryNames.' + product.category)}</p>
          {selectedSize && (
            <p className="text-xs text-gray-500 mt-1">
              {t('cart.size')}: <span className="font-medium text-gray-700">{selectedSize}</span>
            </p>
          )}
          <p className="text-sm font-semibold text-gray-900 mt-1.5">{product.price.toFixed(2)} ден.</p>
        </div>

        {/* Quantity + Actions */}
        <div className="flex items-center justify-between sm:flex-col sm:items-end gap-2 sm:gap-3">
          {/* Quantity Controls */}
          <div className="flex items-center gap-0 border border-gray-200 rounded-lg overflow-hidden">
            <button
              onClick={() => updateQuantity(product.id, quantity - 1, selectedSize)}
              className="p-2 sm:p-1.5 hover:bg-gray-50 active:bg-gray-100 transition-colors duration-150"
            >
              <Minus className="h-3.5 w-3.5 text-gray-500" />
            </button>
            <span className="w-9 sm:w-8 text-center text-sm font-medium text-gray-900 tabular-nums">{quantity}</span>
            <button
              onClick={() => updateQuantity(product.id, quantity + 1, selectedSize)}
              disabled={quantity >= maxStock}
              className="p-2 sm:p-1.5 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors duration-150"
            >
              <Plus className="h-3.5 w-3.5 text-gray-500" />
            </button>
          </div>

          {/* Subtotal + Remove */}
          <div className="flex items-center gap-3 sm:flex-col sm:items-end sm:gap-1.5">
            <p className="text-sm font-bold text-gray-900 tabular-nums">
              {(product.price * quantity).toFixed(2)} ден.
            </p>
            <button
              onClick={() => removeFromCart(product.id, selectedSize)}
              className="text-gray-300 hover:text-red-500 transition-colors duration-200 p-1"
              title={t('cart.removeItem')}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
