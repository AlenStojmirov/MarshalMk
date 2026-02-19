'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Minus, Plus, Trash2 } from 'lucide-react';
import { CartItem as CartItemType } from '@/types';
import { useCart } from '@/context/CartContext';
import { useTranslation } from '@/lib/i18n';

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
    <div className="flex gap-4 py-4 border-b">
      {/* Product Image */}
      <Link href={`/product/${product.id}`} className="shrink-0">
        <div className="relative w-24 h-24 rounded-lg overflow-hidden bg-gray-100">
          {product.imageUrl ? (
            <Image
              src={product.imageUrl}
              alt={product.name}
              fill
              className="object-cover"
              sizes="96px"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400 text-xs">
              {t('common.noImage')}
            </div>
          )}
        </div>
      </Link>

      {/* Product Details */}
      <div className="flex-1 min-w-0">
        <Link href={`/product/${product.id}`}>
          <h3 className="font-medium text-gray-900 hover:text-blue-600 transition-colors line-clamp-2">
            {product.name}
          </h3>
        </Link>
        <p className="text-sm text-gray-500 mt-1">{product.category}</p>
        {selectedSize && (
          <p className="text-sm text-gray-600 mt-1">
            {t('cart.size')}: <span className="font-medium">{selectedSize}</span>
          </p>
        )}
        <p className="text-blue-600 font-semibold mt-1">{product.price.toFixed(2)} ден.</p>
      </div>

      {/* Quantity Controls */}
      <div className="flex flex-col items-end gap-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => updateQuantity(product.id, quantity - 1, selectedSize)}
            className="p-1 rounded-md border border-gray-300 hover:bg-gray-100 transition-colors"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-8 text-center font-medium">{quantity}</span>
          <button
            onClick={() => updateQuantity(product.id, quantity + 1, selectedSize)}
            disabled={quantity >= maxStock}
            className="p-1 rounded-md border border-gray-300 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
        <button
          onClick={() => removeFromCart(product.id, selectedSize)}
          className="text-red-500 hover:text-red-700 transition-colors p-1"
          title={t('cart.removeItem')}
        >
          <Trash2 className="h-5 w-5" />
        </button>
        <p className="text-sm font-semibold text-gray-900">
          {t('common.subtotal')}: {(product.price * quantity).toFixed(2)} ден.
        </p>
      </div>
    </div>
  );
}
