import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getProductById } from '@/lib/products-server';
import { productTitle, categoryName, groupName } from '@/lib/product-display';
import { categoryHref, groupHref, groupOfCategory } from '@/config/categories';
import { generateDescription } from '@/lib/product-title';
import { productShare, SHARE_IMAGE, SHARE_LOCALE, SHARE_SITE_NAME } from '@/lib/share-preview';
import { jsonLd } from '@/lib/json-ld';
import { productFacts } from '@/lib/product-facts';
import { COLORS, FITS, PATTERNS, formatComposition } from '@/lib/attributes';
import { sizeLabel } from '@/lib/sizes';
import ProductPageClient from './ProductPageClient';

interface ProductPageProps {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: ProductPageProps): Promise<Metadata> {
  const { id } = await params;
  const product = await getProductById(id);

  if (!product) {
    return { title: 'Страната не постои' };
  }

  // Macedonian, like all page metadata (D-039): the written title (9.7), and
  // the share card's line — material, sizes on the shelf, delivery — for search.
  const share = productShare(product);

  return {
    title: productTitle(product),
    description: share.description.slice(0, 160),
    alternates: {
      canonical: `/product/${id}`,
    },
    // The share card (Task 10.8): the title with the price.
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

  const displayName = productTitle(product);
  // Macedonian, like the title (9.7): the group, then the kind (Task 2.4).
  const group = groupOfCategory(product.category);
  const crumbs = [
    ...(group ? [{ name: groupName(group.key), item: `https://marshal.mk${groupHref(group.key)}` }] : []),
    ...(!group || group.categories.length > 1
      ? [{ name: categoryName(product.category), item: `https://marshal.mk${categoryHref(product.category)}` }]
      : []),
  ];

  // What a search engine can filter apparel by (9.9), in Macedonian like the
  // rest of the page's data: colour, material, the sizes on the shelf, the cut.
  const facts = productFacts(product);
  const colorKey = product.attributes?.color;
  const pattern = product.attributes?.pattern;
  const sizesOnShelf = (product.sizes ?? []).filter((s) => s.quantity >= 1).map((s) => sizeLabel(s.size));
  const attributeJsonLd = {
    ...(colorKey && COLORS[colorKey] ? { color: COLORS[colorKey].mk } : {}),
    ...(facts.composition.length ? { material: formatComposition(facts.composition) } : {}),
    ...(pattern && pattern !== 'solid' && PATTERNS[pattern] ? { pattern: PATTERNS[pattern].mk } : {}),
    ...(sizesOnShelf.length ? { size: sizesOnShelf } : {}),
    audience: { '@type': 'PeopleAudience', suggestedGender: 'male' },
    ...(facts.fit && FITS[facts.fit]
      ? { additionalProperty: [{ '@type': 'PropertyValue', name: 'Крој', value: FITS[facts.fit].mk }] }
      : {}),
  };

  const productJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: displayName,
    description: product.attributes
      ? generateDescription(product.category, product.attributes).join(' ') || product.description
      : product.description,
    image: [product.imageUrl, ...(product.images || [])].filter(Boolean),
    category: crumbs.map((c) => c.name).join(' > '),
    ...attributeJsonLd,
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
        name: 'Маршал',
        item: 'https://marshal.mk',
      },
      ...crumbs.map((c, i) => ({
        '@type': 'ListItem',
        position: i + 2,
        name: c.name,
        item: c.item,
      })),
      {
        '@type': 'ListItem',
        position: crumbs.length + 2,
        name: displayName,
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(productJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbJsonLd) }}
      />
      <ProductPageClient product={serializedProduct} />
    </>
  );
}
