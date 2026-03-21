import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProductById } from '@/lib/products-server';
import { getProductDisplayName, getCategoryLabel } from '@/lib/product-display';
import ProductPageClient from './ProductPageClient';

interface ProductPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { id } = await params;
  const product = await getProductById(id);

  if (!product) {
    return { title: 'Product Not Found' };
  }

  const displayName = getProductDisplayName(product.name, product.category, product.brand);
  const categoryLabel = getCategoryLabel(product.category);
  const title = `${displayName} — Men's ${categoryLabel}`;
  const description =
    product.description?.slice(0, 155) ||
    `Shop ${displayName} in men's ${categoryLabel}. Premium quality, great prices. Free shipping available.`;

  return {
    title,
    description,
    alternates: {
      canonical: `/product/${id}`,
    },
    openGraph: {
      title,
      description,
      url: `/product/${id}`,
      siteName: 'Marshal',
      images: product.imageUrl
        ? [
            {
              url: product.imageUrl,
              width: 800,
              height: 1067,
              alt: `${displayName} - Men's ${categoryLabel}`,
            },
          ]
        : [],
      type: 'website',
      locale: 'en_US',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: product.imageUrl ? [product.imageUrl] : [],
    },
  };
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { id } = await params;
  const product = await getProductById(id);

  if (!product) {
    notFound();
  }

  // Serialize Firestore Timestamps to plain Date objects for client component
  const toDate = (val: unknown): Date => {
    if (val instanceof Date) return val;
    if (val && typeof val === 'object' && 'toDate' in val) return (val as { toDate: () => Date }).toDate();
    return new Date();
  };

  const serializedProduct = {
    ...product,
    createdAt: toDate(product.createdAt),
    updatedAt: toDate(product.updatedAt),
  };

  return <ProductPageClient product={serializedProduct} />;
}
