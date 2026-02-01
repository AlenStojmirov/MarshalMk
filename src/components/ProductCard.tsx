'use client';

import Image from 'next/image';
import Link from 'next/link';
import { ShoppingCart } from 'lucide-react';
import { Product } from '@/types';
import { useCart } from '@/context/CartContext';
import { useTranslation } from '@/lib/i18n';

interface ProductCardProps {
  product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
  const { addToCart } = useCart();
  const { t } = useTranslation();

  const handleAddToCart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    addToCart(product, 1);
  };

  const isValidImageUrl = product.imageUrl && (
                  product.imageUrl.startsWith('http://') ||
                  product.imageUrl.startsWith('https://') ||
                  product.imageUrl.startsWith('/')
                );

  return (
    <Link href={`/product/${product.id}`}>
      <div className="group bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow duration-300">
        {/* Product Image */}
        <div className="relative aspect-square overflow-hidden bg-gray-100">
          {isValidImageUrl ? (
            <Image
              src={product.imageUrl}
              alt={product.name}
              fill
              className="object-cover group-hover:scale-105 transition-transform duration-300"
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400">
              {t('common.noImage')}
            </div>
          )}
          {product.sale?.isActive && (
            <span className="absolute top-2 left-2 bg-red-600 text-white text-xs font-semibold px-2 py-1 rounded">
              -{product.sale.percentageOff}% {t('sale.off')}
            </span>
          )}
          {product.featured && !product.sale?.isActive && (
            <span className="absolute top-2 left-2 bg-blue-600 text-white text-xs font-semibold px-2 py-1 rounded">
              {t('common.featured')}
            </span>
          )}
          {product.stock === 0 && (
            <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
              <span className="text-white font-semibold text-lg">{t('common.outOfStock')}</span>
            </div>
          )}
        </div>

        {/* Product Info */}
        <div className="p-4">
          <p className="text-sm text-gray-500 mb-1">{product.category}</p>
          <h3 className="font-semibold text-gray-900 mb-2 line-clamp-2">{product.name}</h3>
          <div className="flex items-center justify-between">
            {product.sale?.isActive ? (
              <div className="flex flex-col">
                <span className="text-lg font-bold text-red-600">
                  ${product.sale.salePrice.toFixed(2)}
                </span>
                <span className="text-sm text-gray-400 line-through">
                  ${product.price.toFixed(2)}
                </span>
              </div>
            ) : (
              <span className="text-lg font-bold text-blue-600">
                ${product.price.toFixed(2)}
              </span>
            )}
            <button
              onClick={handleAddToCart}
              disabled={product.stock === 0}
              className="p-2 bg-blue-600 text-white rounded-full hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              title={t('common.addToCart')}
            >
              <ShoppingCart className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </Link>
  );
}
