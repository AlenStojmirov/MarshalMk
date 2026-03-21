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

  return (
    <article>
    <Link href={`/product/${product.id}`}>
      <div className="group">
        {/* Product Image */}
        <div className="relative aspect-[3/4] overflow-hidden bg-stone-100 mb-3">
          {isValidImageUrl ? (
            <Image
              src={product.imageUrl}
              alt={`${getProductDisplayName(product.name, product.category, product.brand)} — Men's ${product.category}`}
              fill
              className="object-cover transition-opacity duration-200 group-hover:opacity-90"
              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
              placeholder="blur"
              blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMzAwIiBoZWlnaHQ9IjQwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZTdlNWUwIi8+PC9zdmc+"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-stone-400 text-xs uppercase tracking-wider">
              {t('common.noImage')}
            </div>
          )}
          {product.stock === 0 && (
            <div className="absolute inset-0 bg-white/70 flex items-center justify-center">
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
          {product.sale?.isActive ? (
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-stone-900">
                {product.sale.salePrice.toFixed(2)} ден.
              </span>
              <span className="text-[13px] text-stone-400 line-through">
                {product.price.toFixed(2)} ден.
              </span>
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
