import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProductById } from '@/lib/products-server';
import { getProductDisplayName, getCategoryLabel } from '@/lib/product-display';
import { productShare, SHARE_IMAGE, SHARE_LOCALE, SHARE_SITE_NAME } from '@/lib/share-preview';
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
  const share = productShare(product);

  return {
    title,
    description,
    alternates: {
      canonical: `/product/${id}`,
    },
    // The share card (Task 10.8): Macedonian, with price, sizes on the shelf and
    // delivery. Title and description above stay for search until 9.7.
    openGraph: {
      title: share.title,
      description: share.description,
      url: `/product/${id}`,
      siteName: SHARE_SITE_NAME,
      // The photos are not all 800×1067, so no size is claimed; without one the shop's card stands in.
      images: product.imageUrl ? [{ url: product.imageUrl, alt: share.alt }] : [SHARE_IMAGE],
      type: 'website',
      locale: SHARE_LOCALE,
    },
    twitter: {
      card: 'summary_large_image',
      title: share.title,
      description: share.description,
      images: [product.imageUrl || SHARE_IMAGE.url],
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

  const displayName = getProductDisplayName(product.name, product.category, product.brand);
  const categoryLabel = getCategoryLabel(product.category);
  const categorySlug = product.category.toLowerCase().replace(/\s+/g, '-');

  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: displayName,
    description: product.description,
    image: [product.imageUrl, ...(product.images || [])].filter(Boolean),
    category: `Men's ${categoryLabel}`,
    offers: {
      '@type': 'Offer',
      price: product.sale?.isActive ? product.sale.salePrice : product.price,
      priceCurrency: 'MKD',
      availability: product.stock > 0
        ? 'https://schema.org/InStock'
        : 'https://schema.org/OutOfStock',
      url: `https://marshal.mk/product/${id}`,
    },
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        position: 1,
        name: 'Home',
        item: 'https://marshal.mk',
      },
      {
        '@type': 'ListItem',
        position: 2,
        name: categoryLabel,
        item: `https://marshal.mk/mens/${categorySlug}`,
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: displayName,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <ProductPageClient product={serializedProduct} />
    </>
  );
}
