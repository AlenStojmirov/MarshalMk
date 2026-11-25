'use client';

import { useMemo } from 'react';
import { lastPieces, sizeLabel } from '@/lib/sizes';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Minus, Plus, Ruler, ShoppingCart } from 'lucide-react';
import { productFacts } from '@/lib/product-facts';
import { fitHint, sizeChartFor } from '@/lib/size-chart';
import { CareFold, ProductDetailsFold } from '@/components/ProductDetails';
import SizeGuide, { SIZE_GUIDE_ID } from '@/components/SizeGuide';
import { useCart } from '@/context/CartContext';
import { productTitle } from '@/lib/product-display';
import { canonicalCategory, categoryHref } from '@/config/categories';
import Link from 'next/link';
import { useState } from 'react';
import { useTranslation } from '@/lib/i18n';
import ProductGrid from '@/components/ProductGrid';
import ProductImageGallery from '@/components/ProductImageGallery';
import ProductDeliveryInfo from '@/components/ProductDeliveryInfo';
import ShareProduct from '@/components/ShareProduct';
import { Product } from '@/types';
import { campaignOf, getReferencePrice } from '@/lib/pricing';
import { shopDate } from '@/lib/campaign';

/** Picked and read on the server (`fetchRelatedProducts`, 16.2): the same kind
 * first, then the rest of its group. */
function RelatedProducts({ products }: { products: Product[] }) {
  const { t } = useTranslation();

  if (products.length === 0) return null;

  return (
    <div className="bg-white border-t border-stone-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 md:py-24">
        <h2 className="text-xs uppercase tracking-[0.2em] text-stone-400 mb-10">
          {t('product.relatedProducts')}
        </h2>
        <ProductGrid products={products} />
      </div>
    </div>
  );
}

interface ProductPageClientProps {
  product: Product;
  related: Product[];
}

export default function ProductPageClient({ product, related }: ProductPageClientProps) {
  const router = useRouter();
  const { addToCart } = useCart();
  const [quantity, setQuantity] = useState(1);
  const [selectedSize, setSelectedSize] = useState<string | null>(null);
  const [addedToCart, setAddedToCart] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);
  const { t, language, price } = useTranslation();

  // Task 9.9: what the attributes say, the standard chart for these sizes,
  // and the one line on how this cut fits.
  const facts = useMemo(() => productFacts(product), [product]);
  const chart = useMemo(
    () => sizeChartFor(product.category, (product.sizes ?? []).map((s) => s.size)),
    [product.category, product.sizes]
  );
  const measurements = product.attributes?.measurements ?? {};
  const hasGuide = !!chart || Object.keys(measurements).length > 0;
  const hint = fitHint(facts.fit, product.attributes?.sizeAdvice);

  const openGuide = () => {
    setGuideOpen(true);
    // After the fold has opened, so the scroll lands on its content.
    requestAnimationFrame(() =>
      document.getElementById(SIZE_GUIDE_ID)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    );
  };

  const hasSizes = product?.sizes && product.sizes.length > 0;
  const selectedSizeData = hasSizes
    ? product.sizes?.find((s) => s.size === selectedSize)
    : null;
  const availableStock = hasSizes
    ? selectedSizeData?.quantity || 0
    : product?.stock || 0;
  const piecesLeft = lastPieces(selectedSizeData?.quantity);

  const onSale = !!product.sale?.isActive;
  // During a campaign the price struck through is the lowest before it (D-051).
  const reference = getReferencePrice(product);
  const campaign = campaignOf(product);
  const percentOff = onSale
    ? Math.round(
        product.sale!.percentageOff ||
          ((reference - product.sale!.salePrice) / reference) * 100
      )
    : 0;
  const savings = onSale ? Math.max(0, reference - product.sale!.salePrice) : 0;

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
            alt={productTitle(product, language)}
            featured={product.featured}
            featuredLabel={t('common.featured')}
            noImageLabel={t('common.noImage')}
            onSale={onSale}
            saleLabel={campaign ? t('campaign.badge', { name: campaign.name }) : t('product.sale')}
            percentOff={percentOff}
            campaign={!!campaign}
          />

          {/* ─── Right Column: Product Information ─── */}
          <div className="flex flex-col py-0 lg:py-4 lg:sticky lg:top-8 lg:self-start">
            {/* Back Navigation */}
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined' && window.history.length > 1) {
                  router.back();
                } else {
                  router.push('/');
                }
              }}
              className="inline-flex items-center gap-2 text-stone-400 hover:text-stone-900 hover:gap-3 transition-all duration-200 mb-6 text-sm tracking-wide w-fit cursor-pointer"
            >
              <ArrowLeft className="h-4 w-4" />
              {t('product.backToProducts')}
            </button>
            {/* Product Name */}
            <h1 className="text-2xl md:text-3xl font-light text-stone-900 leading-tight mb-4">
              {productTitle(product, language)}
            </h1>

            {/* Category */}
            <p className="text-[11px] uppercase tracking-[0.2em] text-stone-400 mb-3">
              <Link href={categoryHref(product.category)} className="hover:text-stone-900 transition-colors">
                {t('categoryNames.' + canonicalCategory(product.category))}
              </Link>
            </p>

            {/* Price */}
            <div className="mb-6">
              {onSale ? (
                <div className="flex flex-col gap-2">
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span className={campaign ? 'text-2xl md:text-3xl font-extrabold text-stone-950' : 'text-2xl md:text-3xl font-semibold text-red-600'}>
                      {price(product.sale!.salePrice)}
                    </span>
                    <span className="text-base text-stone-400 line-through">
                      {price(reference)}
                    </span>
                    {percentOff > 0 && (
                      <span className={campaign ? 'text-[12px] font-black tracking-[0.1em] text-stone-950 bg-amber-300 px-2 py-1' : 'text-[11px] font-bold uppercase tracking-[0.15em] text-white bg-red-600 px-2 py-1'}>
                        -{percentOff}%
                      </span>
                    )}
                  </div>
                  {campaign && (
                    <Link
                      href="/black-friday"
                      className="inline-flex w-fit items-center gap-2 text-[11px] font-bold uppercase tracking-[0.15em] text-amber-300 bg-stone-950 px-2.5 py-1.5 hover:bg-stone-800 transition-colors"
                    >
                      {t('campaign.until', { name: campaign.name, date: shopDate(language, campaign.endsAt, true) })}
                    </Link>
                  )}
                  {savings > 0 && (
                    <span className="inline-flex w-fit text-[11px] font-semibold uppercase tracking-wider text-red-700 bg-red-50 border border-red-100 px-2 py-1 rounded-sm">
                      {t('product.save', { amount: price(savings) })}
                    </span>
                  )}
                </div>
              ) : (
                <p className="text-xl text-stone-900">{price(product.price)}</p>
              )}
            </div>

            {/* Divider */}
            <div className="h-px bg-stone-200 mb-6" />

            {/* Description: only what it says beyond the details below (9.9) */}
            {facts.rest && (
              <p className="text-sm text-stone-500 leading-relaxed mb-8 whitespace-pre-line">{facts.rest}</p>
            )}

            {/* ─── Size Selector ─── */}
            {hasSizes && (
              <div className="mb-8">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs uppercase tracking-[0.15em] text-stone-700">
                    {t('product.size')}
                  </span>
                  {hasGuide ? (
                    <button
                      type="button"
                      onClick={openGuide}
                      aria-controls={SIZE_GUIDE_ID}
                      className="inline-flex items-center gap-1.5 text-xs text-stone-600 underline underline-offset-4 decoration-stone-300 hover:text-stone-900 hover:decoration-stone-900 transition-colors"
                    >
                      <Ruler className="h-3.5 w-3.5" aria-hidden="true" />
                      {t('product.sizeGuideLink')}
                    </button>
                  ) : (
                    !selectedSize && <span className="text-xs text-stone-400">{t('product.selectSize')}</span>
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
                          min-w-[3rem] h-12 px-4 border text-sm transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-offset-1
                          ${
                            isSelected
                              ? 'border-stone-900 bg-stone-900 text-white shadow-md'
                              : isAvailable
                              ? 'border-stone-300 text-stone-700 hover:border-stone-900 hover:bg-stone-50 hover:-translate-y-0.5 hover:shadow-sm active:translate-y-0'
                              : 'border-stone-100 bg-stone-50 text-stone-300 cursor-not-allowed line-through'
                          }
                        `}
                      >
                        {sizeLabel(sizeOption.size, (language === 'en' ? 'en' : 'mk'))}
                      </button>
                    );
                  })}
                </div>
                {hint && <p className="mt-3 text-xs text-stone-500">{t(`product.fitHint.${hint}`)}</p>}
              </div>
            )}

            {/* Stock Status */}
            <div className="mb-6">
              {hasSizes ? (
                selectedSize ? (
                  piecesLeft !== null ? (
                    <p className="inline-flex items-center gap-2 text-xs font-medium text-amber-700">
                      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-amber-600" />
                      {piecesLeft === 1
                        ? t('product.lastPieceInSize', { size: sizeLabel(selectedSize, (language === 'en' ? 'en' : 'mk')) })
                        : t('product.lastFewInSize', { count: piecesLeft.toString(), size: sizeLabel(selectedSize, (language === 'en' ? 'en' : 'mk')) })}
                    </p>
                  ) : availableStock > 0 ? (
                    <p className="text-xs text-stone-500">
                      {t('product.inStockInSize', { count: availableStock.toString(), size: sizeLabel(selectedSize, (language === 'en' ? 'en' : 'mk')) })}
                    </p>
                  ) : (
                    <p className="text-xs text-red-700">
                      {t('product.outOfStockInSize', { size: sizeLabel(selectedSize, (language === 'en' ? 'en' : 'mk')) })}
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
                    aria-label={t('common.decreaseQuantity')}
                    className="w-10 h-10 flex items-center justify-center text-stone-500 hover:text-stone-900 hover:bg-stone-100 active:bg-stone-200 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-inset"
                  >
                    <Minus className="h-3.5 w-3.5" />
                  </button>
                  <span className="w-12 h-10 flex items-center justify-center text-sm text-stone-900 border-x border-stone-300">
                    {quantity}
                  </span>
                  <button
                    onClick={() => setQuantity(Math.min(availableStock, quantity + 1))}
                    aria-label={t('common.increaseQuantity')}
                    className="w-10 h-10 flex items-center justify-center text-stone-500 hover:text-stone-900 hover:bg-stone-100 active:bg-stone-200 transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-inset"
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
                w-full flex items-center justify-center gap-2.5 py-4 text-xs uppercase tracking-[0.2em] transition-all duration-200 shadow-sm hover:shadow-lg active:scale-[0.99] focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-offset-2
                ${
                  addedToCart
                    ? 'bg-stone-700 text-white'
                    : 'bg-stone-900 text-white hover:bg-stone-800'
                }
                disabled:bg-stone-200 disabled:text-stone-400 disabled:cursor-not-allowed disabled:shadow-none disabled:active:scale-100
              `}
            >
              <ShoppingCart className="h-4 w-4" />
              {addedToCart
                ? t('product.addedToCart')
                : hasSizes && !selectedSize
                ? t('product.selectSize')
                : t('common.addToCart')}
            </button>

            {/* ─── Share: the phone's share sheet, or straight to an app (D-050) ─── */}
            <ShareProduct path={`/product/${encodeURIComponent(product.id)}`} title={productTitle(product, language)} />

            {/* ─── Details, size and fit, care (9.9), then delivery: one list of rows ─── */}
            <div className="mt-8">
              <ProductDetailsFold product={product} facts={facts} />
              {hasSizes && (
                <SizeGuide
                  chart={chart}
                  measurements={measurements}
                  sizes={product.sizes ?? []}
                  fit={facts.fit}
                  advice={product.attributes?.sizeAdvice}
                  selectedSize={selectedSize}
                  onChoose={(size) => {
                    setSelectedSize(size);
                    setQuantity(1);
                  }}
                  open={guideOpen}
                  onToggle={setGuideOpen}
                />
              )}
              <CareFold facts={facts} />
              <ProductDeliveryInfo />
            </div>
          </div>
        </div>
      </div>

      <RelatedProducts products={related} />
    </div>
  );
}
