'use client';

import { use, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, Minus, Plus, ShoppingCart } from 'lucide-react';
import { useProduct, useProductsByCategory } from '@/hooks/useProducts';
import { useCart } from '@/context/CartContext';
import { useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import ProductGrid from '@/components/ProductGrid';

interface ProductPageProps {
  params: Promise<{ id: string }>;
}

function RelatedProducts({ category, excludeId }: { category: string; excludeId: string }) {
  const { products, loading } = useProductsByCategory(category);
  const { t } = useTranslation();

  const relatedProducts = useMemo(
    () => products.filter((p) => p.id !== excludeId),
    [products, excludeId]
  );

  if (!loading && relatedProducts.length === 0) return null;

  return (
    <div className="bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <h2 className="text-2xl font-bold text-gray-900 mb-6">
          {t('product.relatedProducts')}
        </h2>
        <ProductGrid products={relatedProducts} loading={loading} />
      </div>
    </div>
  );
}

export default function ProductPage({ params }: ProductPageProps) {
  const { id } = use(params);
  const { product, loading, error } = useProduct(id);
  const { addToCart } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [addedToCart, setAddedToCart] = useState(false);
  const { t } = useTranslation();

  const hasSizes = product?.sizes && product.sizes.length > 0;
  const selectedSizeData = hasSizes
    ? product.sizes?.find((s) => s.size === selectedSize)
    : null;
  const availableStock = hasSizes
    ? selectedSizeData?.quantity || 0
    : product?.stock || 0;

  const handleAddToCart = () => {
    if (product) {
      if (hasSizes && !selectedSize) {
        return;
      }
      addToCart(product, quantity, selectedSize || undefined);
      setAddedToCart(true);
      setTimeout(() => setAddedToCart(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="animate-pulse">
          <div className="h-8 w-32 bg-gray-200 rounded mb-8" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="aspect-square bg-gray-200 rounded-lg" />
            <div className="space-y-4">
              <div className="h-8 bg-gray-200 rounded w-3/4" />
              <div className="h-6 bg-gray-200 rounded w-1/4" />
              <div className="h-24 bg-gray-200 rounded" />
              <div className="h-12 bg-gray-200 rounded w-1/2" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/" className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 mb-8">
          <ArrowLeft className="h-5 w-5" />
          {t('product.backToProducts')}
        </Link>
        <div className="text-center py-12">
          <p className="text-xl text-gray-900 font-semibold mb-2">{t('product.notFound')}</p>
          <p className="text-gray-500 mb-4">{t('product.notFoundDescription')}</p>
          <Link href="/" className="text-blue-600 hover:text-blue-800 font-medium">
            {t('product.returnHome')}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/" className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-800 mb-8">
          <ArrowLeft className="h-5 w-5" />
          {t('product.backToProducts')}
        </Link>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Product Image */}
          <div className="relative aspect-square rounded-lg overflow-hidden bg-gray-100">
            {product.imageUrl ? (
              <Image
                src={product.imageUrl}
                alt={product.name}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 50vw"
                priority
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-gray-400">
                {t('common.noImage')}
              </div>
            )}
            {product.featured && (
              <span className="absolute top-4 left-4 bg-blue-600 text-white text-sm font-semibold px-3 py-1 rounded">
                {t('common.featured')}
              </span>
            )}
          </div>

          {/* Product Details */}
          <div className="flex flex-col">
            {/* Brand */}
            {product.brand && (
              <p className="text-sm font-medium text-gray-500 uppercase tracking-wide mb-1">
                {product.brand}
              </p>
            )}

            <p className="text-sm text-gray-500 mb-2">{product.category}</p>
            <h1 className="text-3xl font-bold text-gray-900 mb-4">{product.name}</h1>
            <p className="text-3xl font-bold text-blue-600 mb-6">${product.price.toFixed(2)}</p>

            {/* Color */}
            {product.color && (
              <p className="text-gray-600 mb-4">
                <span className="font-medium">{t('product.color')}:</span> {product.color}
              </p>
            )}

            <p className="text-gray-600 mb-6 leading-relaxed">{product.description}</p>

            {/* Size Selector */}
            {hasSizes && (
              <div className="mb-6">
                <span className="text-gray-700 font-medium block mb-3">{t('product.size')}:</span>
                <div className="flex flex-wrap gap-2">
                  {product.sizes?.map((sizeOption) => {
                    const isAvailable = sizeOption.quantity > 0;
                    const isSelected = selectedSize === sizeOption.size;

                    return (
                      <button
                        key={sizeOption.size}
                        onClick={() => {
                          if (isAvailable) {
                            setSelectedSize(sizeOption.size);
                            setQuantity(1);
                          }
                        }}
                        disabled={!isAvailable}
                        className={`
                          px-4 py-2 rounded-md border-2 font-medium transition-all
                          ${
                            isSelected
                              ? 'border-blue-600 bg-blue-600 text-white'
                              : isAvailable
                              ? 'border-gray-300 hover:border-blue-400 text-gray-700'
                              : 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed line-through'
                          }
                        `}
                      >
                        {sizeOption.size}
                        {isAvailable && (
                          <span className="text-xs ml-1 opacity-70">
                            ({sizeOption.quantity})
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                {!selectedSize && (
                  <p className="text-sm text-amber-600 mt-2">{t('product.selectSize')}</p>
                )}
              </div>
            )}

            {/* Stock Status */}
            <div className="mb-6">
              {hasSizes ? (
                selectedSize ? (
                  availableStock > 0 ? (
                    <p className="text-green-600 font-medium">
                      {t('product.inStockInSize', { count: availableStock.toString(), size: selectedSize })}
                    </p>
                  ) : (
                    <p className="text-red-600 font-medium">
                      {t('product.outOfStockInSize', { size: selectedSize })}
                    </p>
                  )
                ) : (
                  <p className="text-gray-500 font-medium">
                    {t('product.totalStock', { count: product.stock.toString() })}
                  </p>
                )
              ) : product.stock > 0 ? (
                <p className="text-green-600 font-medium">
                  {t('product.inStockWithCount', { count: product.stock.toString() })}
                </p>
              ) : (
                <p className="text-red-600 font-medium">{t('common.outOfStock')}</p>
              )}
            </div>

            {/* Quantity Selector */}
            {availableStock > 0 && (!hasSizes || selectedSize) && (
              <div className="flex items-center gap-4 mb-6">
                <span className="text-gray-700 font-medium">{t('common.quantity')}:</span>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="p-2 rounded-md border border-gray-300 hover:bg-gray-100 transition-colors"
                  >
                    <Minus className="h-4 w-4" />
                  </button>
                  <span className="w-12 text-center font-medium text-lg">{quantity}</span>
                  <button
                    onClick={() => setQuantity(Math.min(availableStock, quantity + 1))}
                    className="p-2 rounded-md border border-gray-300 hover:bg-gray-100 transition-colors"
                  >
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            {/* Add to Cart Button */}
            <button
              onClick={handleAddToCart}
              disabled={availableStock === 0 || (hasSizes && !selectedSize)}
              className={`flex items-center justify-center gap-2 py-3 px-6 rounded-lg font-semibold transition-colors ${
                addedToCart
                  ? 'bg-green-600 text-white'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              } disabled:bg-gray-300 disabled:cursor-not-allowed`}
            >
              <ShoppingCart className="h-5 w-5" />
              {addedToCart
                ? t('product.addedToCart')
                : hasSizes && !selectedSize
                ? t('product.selectSize')
                : t('common.addToCart')}
            </button>
          </div>
        </div>
      </div>

      <RelatedProducts category={product.category} excludeId={id} />
    </>
  );
}
