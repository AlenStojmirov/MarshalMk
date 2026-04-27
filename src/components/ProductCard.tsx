'use client';

import Image from 'next/image';
import Link from 'next/link';
import { Product } from '@/types';
import { useTranslation } from '@/lib/i18n';
import { getProductDisplayName } from '@/lib/product-display';

interface ProductCardProps {
  product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
  const { t } = useTranslation();

  const isValidImageUrl = product.imageUrl && (
                  product.imageUrl.startsWith('http://') ||
                  product.imageUrl.startsWith('https://') ||
                  product.imageUrl.startsWith('/')
                );

  const onSale = !!product.sale?.isActive;
  const percentOff = onSale
    ? Math.round(
        product.sale!.percentageOff ||
          ((product.price - product.sale!.salePrice) / product.price) * 100
      )
    : 0;
  const savings = onSale ? Math.max(0, product.price - product.sale!.salePrice) : 0;

  return (
    <article className={onSale ? 'group/card relative' : 'group/card'}>
    <Link href={`/product/${product.id}`}>
      <div className="group">
        {/* Product Image */}
        <div
          className={
            onSale
              ? 'relative aspect-[3/4] overflow-hidden bg-stone-100 mb-3 ring-1 ring-red-500/20 shadow-sm group-hover/card:shadow-lg group-hover/card:ring-red-500/40 transition-all duration-300'
              : 'relative aspect-[3/4] overflow-hidden bg-stone-100 mb-3'
          }
        >
          {isValidImageUrl ? (
            <Image
              src={product.imageUrl}
              alt={`${getProductDisplayName(product.name, product.category, product.brand)} — Men's ${product.category}`}
              fill
              className={
                onSale
                  ? 'object-cover transition-transform duration-500 ease-out group-hover:scale-105'
                  : 'object-cover transition-opacity duration-200 group-hover:opacity-90'
              }
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              placeholder="blur"
              blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZTdlNWUwIi8+PC9zdmc+"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-stone-400 text-xs uppercase tracking-wider">
              {t('common.noImage')}
            </div>
          )}

          {/* Sale badges */}
          {onSale && product.stock > 0 && (
            <>
              <div className="absolute top-2 left-2 z-10 flex flex-col gap-1.5 items-start">
                <span
                  className="bg-red-600 text-white text-[10px] font-bold uppercase tracking-[0.2em] px-2.5 py-1 shadow-md ring-1 ring-red-700/30 animate-[pulse_2.5s_ease-in-out_infinite]"
                >
                  {t('product.sale')}
                </span>
                {percentOff > 0 && (
                  <span className="bg-stone-900 text-white text-[11px] font-semibold px-2 py-0.5 shadow-sm">
                    -{percentOff}%
                  </span>
                )}
              </div>
            </>
          )}

          {product.stock === 0 && (
            <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-20">
              <span className="text-stone-900 text-[11px] uppercase tracking-[0.2em] font-medium">
                {t('common.outOfStock')}
              </span>
            </div>
          )}
          {/* View product overlay */}
          {product.stock > 0 && (
            <div
              className="absolute bottom-0 left-0 right-0 bg-stone-900/90 text-white text-[11px] uppercase tracking-[0.15em] py-3.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 text-center"
            >
              {t('common.viewProduct')}
            </div>
          )}
        </div>

        {/* Product Info */}
        <div>
          <h3 className="text-[13px] text-stone-900 leading-snug mb-1.5 tracking-wide">
            {getProductDisplayName(product.name, product.category, product.brand)}
          </h3>
          {onSale ? (
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <span className="text-[14px] font-semibold text-red-600">
                {product.sale!.salePrice.toFixed(2)} ден.
              </span>
              <span className="text-[12px] text-stone-400 line-through">
                {product.price.toFixed(2)} ден.
              </span>
              {savings > 0 && (
                <span className="text-[10px] font-semibold uppercase tracking-wider text-red-600 bg-red-50 px-1.5 py-0.5 rounded-sm">
                  {t('product.save', { amount: savings.toFixed(0) })}
                </span>
              )}
            </div>
          ) : (
            <span className="text-[13px] text-stone-900">
              {product.price.toFixed(2)} ден.
            </span>
          )}
        </div>
      </div>
    </Link>
    </article>
  );
}
