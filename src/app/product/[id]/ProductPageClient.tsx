'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ArrowLeft, Minus, Plus, ShoppingCart } from 'lucide-react';
import { useProductsByCategory } from '@/hooks/useProducts';
import { useCart } from '@/context/CartContext';
import { getProductDisplayName } from '@/lib/product-display';
import { useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import ProductGrid from '@/components/ProductGrid';
import ProductImageGallery from '@/components/ProductImageGallery';
import { Product } from '@/types';

function RelatedProducts({ category, excludeId }: { category: string; excludeId: string }) {
  const { products, loading } = useProductsByCategory(category);
  const { t } = useTranslation();

  const relatedProducts = useMemo(
    () => products.filter((p) => p.id !== excludeId && p.isVisible !== false).slice(0, 4),
    [products, excludeId]
  );

  if (!loading && relatedProducts.length === 0) return null;

  return (
    <div className="bg-white border-t border-stone-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
        <h2 className="text-xs uppercase tracking-[0.2em] text-stone-400 mb-10">
          {t('product.relatedProducts')}
        </h2>
        <ProductGrid products={relatedProducts} loading={loading} />
      </div>
    </div>
  );
}

interface ProductPageClientProps {
  product: Product;
}

export default function ProductPageClient({ product }: ProductPageClientProps) {
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

  const onSale = !!product.sale?.isActive;
  const percentOff = onSale
    ? Math.round(
        product.sale!.percentageOff ||
          ((product.price - product.sale!.salePrice) / product.price) * 100
      )
    : 0;
  const savings = onSale ? Math.max(0, product.price - product.sale!.salePrice) : 0;

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

  // Build an array of all available images
  const allImages = useMemo(() => {
    if (!product) return [];
    const imgs: string[] = [];
    if (product.imageUrl) imgs.push(product.imageUrl);
    if (product.images && product.images.length > 0) {
      product.images.forEach((img) => {
        if (img !== product.imageUrl) imgs.push(img);
      });
    }
    return imgs;
  }, [product]);

  return (
    <div className="bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-16">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-20">
          {/* ─── Left Column: Product Images ─── */}
          <ProductImageGallery
            images={allImages}
            alt={getProductDisplayName(product.name, product.category, product.brand)}
            featured={product.featured}
            featuredLabel={t('common.featured')}
            noImageLabel={t('common.noImage')}
            onSale={onSale}
            saleLabel={t('product.sale')}
            percentOff={percentOff}
          />

          {/* ─── Right Column: Product Information ─── */}
          <div className="flex flex-col py-0 lg:py-4 lg:sticky lg:top-8 lg:self-start">
            {/* Back Navigation */}
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-stone-400 hover:text-stone-900 transition-colors duration-200 mb-6 text-sm tracking-wide"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('product.backToProducts')}
            </Link>
            {/* Product Name */}
            <h1 className="text-2xl md:text-3xl font-light text-stone-900 leading-tight mb-4">
              {getProductDisplayName(product.name, product.category, product.brand)}
            </h1>

            {/* Category */}
            <p className="text-[11px] uppercase tracking-[0.2em] text-stone-400 mb-3">
              {t('categoryNames.' + product.category)}
            </p>

            {/* Price */}
            <div className="mb-6">
              {onSale ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span className="text-2xl md:text-3xl font-semibold text-red-600">
                      {product.sale!.salePrice.toFixed(2)} ден.
                    </span>
                    <span className="text-base text-stone-400 line-through">
                      {product.price.toFixed(2)} ден.
                    </span>
                    {percentOff > 0 && (
                      <span className="text-[11px] font-bold uppercase tracking-[0.15em] text-white bg-red-600 px-2 py-1">
                        -{percentOff}%
                      </span>
                    )}
                  </div>
                  {savings > 0 && (
                    <span className="inline-flex w-fit text-[11px] font-semibold uppercase tracking-wider text-red-700 bg-red-50 border border-red-100 px-2 py-1 rounded-sm">
                      {t('product.save', { amount: savings.toFixed(0) })}
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-xl text-stone-900">{product.price.toFixed(2)} ден.</p>
              )}
            </div>

            {/* Divider */}
            <div className="h-px bg-stone-200 mb-6" />

            {/* Color */}
            {product.color && (
              <p className="text-sm text-stone-500 mb-5">
                <span className="text-stone-700">{t('product.color')}:</span>{' '}
                {product.color}
              </p>
            )}

            {/* Description */}
            <p className="text-sm text-stone-500 leading-relaxed mb-8">{product.description}</p>

            {/* ─── Size Selector ─── */}
            {hasSizes && (
              <div className="mb-8">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs uppercase tracking-[0.15em] text-stone-700">
                    {t('product.size')}
                  </span>
                  {!selectedSize && (
                    <span className="text-xs text-stone-400">{t('product.selectSize')}</span>
                  )}
                </div>
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
                          min-w-[3rem] h-12 px-4 border text-sm transition-all duration-150
                          ${
                            isSelected
                              ? 'border-stone-900 bg-stone-900 text-white'
                              : isAvailable
                              ? 'border-stone-300 text-stone-700 hover:border-stone-900'
                              : 'border-stone-100 bg-stone-50 text-stone-300 cursor-not-allowed'
                          }
                        `}
                      >
                        {sizeOption.size}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Stock Status */}
            <div className="mb-6">
              {hasSizes ? (
                selectedSize ? (
                  availableStock > 0 ? (
                    <p className="text-xs text-stone-500">
                      {t('product.inStockInSize', { count: availableStock.toString(), size: selectedSize })}
                    </p>
                  ) : (
                    <p className="text-xs text-red-700">
                      {t('product.outOfStockInSize', { size: selectedSize })}
                    </p>
                  )
                ) : (
                  <p className="text-xs text-stone-400">
                    {t('product.totalStock', { count: product.stock.toString() })}
                  </p>
                )
              ) : product.stock > 0 ? (
                <p className="text-xs text-stone-500">
                  {t('product.inStockWithCount', { count: product.stock.toString() })}
                </p>
              ) : (
                <p className="text-xs text-red-700">{t('common.outOfStock')}</p>
              )}
            </div>

            {/* ─── Quantity Selector ─── */}
            {availableStock > 0 && (!hasSizes || selectedSize) && (
              <div className="flex items-center gap-4 mb-8">
                <span className="text-xs uppercase tracking-[0.15em] text-stone-700">
                  {t('common.quantity')}
                </span>
                <div className="flex items-center border border-stone-300">
                  <button
                    onClick={() => setQuantity(Math.max(1, quantity - 1))}
                    className="w-10 h-10 flex items-center justify-center text-stone-500 hover:text-stone-900 hover:bg-stone-50 transition-colors duration-150"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-12 h-10 flex items-center justify-center text-sm text-stone-900 border-x border-stone-300">
                    {quantity}
                  </span>
                  <button
                    onClick={() => setQuantity(Math.min(availableStock, quantity + 1))}
                    className="w-10 h-10 flex items-center justify-center text-stone-500 hover:text-stone-900 hover:bg-stone-50 transition-colors duration-150"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* ─── Add to Cart CTA ─── */}
            <button
              onClick={handleAddToCart}
              disabled={availableStock === 0 || (hasSizes && !selectedSize)}
              className={`
                w-full flex items-center justify-center gap-2.5 py-4 text-xs uppercase tracking-[0.2em] transition-colors duration-200
                ${
                  addedToCart
                    ? 'bg-stone-700 text-white'
                    : 'bg-stone-900 text-white hover:bg-stone-800'
                }
                disabled:bg-stone-200 disabled:text-stone-400 disabled:cursor-not-allowed
              `}
            >
              <ShoppingCart className="h-4 w-4" />
              {addedToCart
                ? t('product.addedToCart')
                : hasSizes && !selectedSize
                ? t('product.selectSize')
                : t('common.addToCart')}
            </button>

            {/* ─── Ask on Instagram ─── */}
            <a
              href="https://ig.me/m/marshalonlinemk"
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                if (/Android|iPhone|iPad|iPod/i.test(navigator.userAgent)) {
                  e.preventDefault();
                  window.location.href = 'instagram://user?username=marshalonlinemk';
                  setTimeout(() => {
                    window.open('https://ig.me/m/marshalonlinemk', '_blank');
                  }, 500);
                }
              }}
              className="w-full flex items-center justify-center gap-2.5 py-4 mt-3 text-xs uppercase tracking-[0.2em] border border-stone-300 text-stone-700 hover:bg-stone-50 transition-colors duration-200"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
              </svg>
              {t('product.askOnInstagram')}
            </a>
          </div>
        </div>
      </div>

      <RelatedProducts category={product.category} excludeId={product.id} />
    </div>
  );
}
