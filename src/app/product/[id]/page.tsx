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

export default function ProductPage({ params }: ProductPageProps) {
  const { id } = use(params);
  const { product, loading, error } = useProduct(id);
  const { addToCart } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [addedToCart, setAddedToCart] = useState(false);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
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

  if (loading) {
    return (
      <div className="bg-white min-h-screen max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20">
        <div className="animate-pulse">
          <div className="h-4 w-24 bg-stone-100 mb-12" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20">
            <div className="aspect-[3/4] bg-stone-100" />
            <div className="space-y-6 py-4">
              <div className="h-3 bg-stone-100 w-20" />
              <div className="h-7 bg-stone-100 w-3/4" />
              <div className="h-5 bg-stone-100 w-24" />
              <div className="h-px bg-stone-100 w-full" />
              <div className="h-20 bg-stone-100 w-full" />
              <div className="h-12 bg-stone-100 w-full" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error || !product) {
    return (
      <div className="bg-white min-h-screen max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-stone-400 hover:text-stone-900 transition-colors duration-200 mb-12 text-sm tracking-wide"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('product.backToProducts')}
        </Link>
        <div className="text-center py-20">
          <p className="text-lg text-stone-900 font-light mb-2">{t('product.notFound')}</p>
          <p className="text-stone-400 text-sm mb-8">{t('product.notFoundDescription')}</p>
          <Link
            href="/"
            className="text-sm text-stone-900 underline underline-offset-4 hover:text-stone-600 transition-colors duration-200"
          >
            {t('product.returnHome')}
          </Link>
        </div>
      </div>
    );
  }

  const currentImage = allImages[selectedImageIndex] || product.imageUrl;

  return (
    <div className="bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-16">
        {/* Back Navigation */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-stone-400 hover:text-stone-900 transition-colors duration-200 mb-8 md:mb-14 text-sm tracking-wide"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('product.backToProducts')}
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-20">
          {/* ─── Left Column: Product Images ─── */}
          <div>
            {/* Main Image */}
            <div className="relative aspect-[3/4] bg-stone-50 overflow-hidden">
              {currentImage ? (
                <Image
                  src={currentImage}
                  alt={product.name}
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  priority
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-stone-300 text-sm">
                  {t('common.noImage')}
                </div>
              )}
              {product.featured && (
                <span className="absolute top-5 left-5 bg-stone-900 text-white text-[10px] uppercase tracking-[0.15em] px-3 py-1.5">
                  {t('common.featured')}
                </span>
              )}
            </div>

            {/* Thumbnail Gallery */}
            {allImages.length > 1 && (
              <div className="flex gap-3 mt-3">
                {allImages.map((img, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedImageIndex(index)}
                    className={`relative w-16 h-20 sm:w-20 sm:h-24 flex-shrink-0 overflow-hidden transition-all duration-200 ${
                      selectedImageIndex === index
                        ? 'ring-1 ring-stone-900 ring-offset-2'
                        : 'opacity-60 hover:opacity-100'
                    }`}
                  >
                    <Image
                      src={img}
                      alt={`${product.name} - ${index + 1}`}
                      fill
                      className="object-cover"
                      sizes="80px"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ─── Right Column: Product Information ─── */}
          <div className="flex flex-col py-0 lg:py-4">
            {/* Product Name */}
            <h1 className="text-2xl md:text-3xl font-light text-stone-900 leading-tight mb-4">
              {product.name}
            </h1>
            
            {/* Category */}
            <p className="text-[11px] uppercase tracking-[0.2em] text-stone-400 mb-3">
              {product.category}
            </p>

            {/* Brand */}
            {/* {product.brand && (
              <p className="text-xs uppercase tracking-[0.15em] text-stone-500 mb-2">
                {product.brand}
              </p>
            )} */}

            {/* Price */}
            <div className="mb-6">
              {product.sale?.isActive ? (
                <div className="flex items-baseline gap-3">
                  <span className="text-xl text-stone-900">{product.sale.salePrice.toFixed(2)} ден.</span>
                  <span className="text-sm text-stone-400 line-through">{product.price.toFixed(2)} ден.</span>
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
          </div>
        </div>
      </div>

      <RelatedProducts category={product.category} excludeId={id} />
    </div>
  );
}
