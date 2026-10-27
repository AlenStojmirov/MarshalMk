import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import CategoryPageContent from '@/components/CategoryPageContent';
import { fetchPaginatedProducts, parseSearchParams } from '@/lib/products-server';
import { categoryForSlug, getCategoryLabel } from '@/lib/product-display';
import ProductGrid from '@/components/ProductGrid';
import { jsonLd } from '@/lib/json-ld';

interface CategoryPageProps {
  params: Promise<{
    category: string;
  }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function CategoryPageLoader({ params, searchParams }: CategoryPageProps) {
  const [{ category }, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const slug = decodeURIComponent(category);
  const queryParams = parseSearchParams(resolvedSearchParams);
  const paginatedData = await fetchPaginatedProducts({
    ...queryParams,
    category: slug,
  });

  // The raw key, so /mens/shortsjeans from the sitemap is named like /mens/shortsJeans from the header.
  const key = categoryForSlug(slug) ?? slug;
  const categoryLabel = getCategoryLabel(key);

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
      },
    ],
  };

  const itemListJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: `Men's ${categoryLabel}`,
    numberOfItems: paginatedData.totalCount,
    itemListElement: paginatedData.products.map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `https://marshal.mk/product/${p.id}`,
      name: p.name,
    })),
  };

  return (
    <>
      {/* jsonLd, not JSON.stringify: the label falls back to the slug from the URL (15.3). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(itemListJsonLd) }}
      />
      <CategoryPageContent
        paginatedData={paginatedData}
        categoryName={key}
      />
    </>
  );
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  // An unknown category is a 404 before anything streams, so the status is a
  // real 404 rather than a 200 around an empty grid (14.6). Only an unknown slug
  // waits for the database; a known one, empty for now or not, goes straight on.
  let slug: string;
  try {
    slug = decodeURIComponent((await params).category);
  } catch {
    notFound();
  }
  if (!categoryForSlug(slug) &&(await fetchPaginatedProducts({ category: slug, limit: 1 })).totalCount === 0) {
    notFound();
  }

  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <ProductGrid products={[]} loading />
          </div>
        </div>
      }
    >
      <CategoryPageLoader params={params} searchParams={searchParams} />
    </Suspense>
  );
}

export async function generateMetadata({ params }: CategoryPageProps) {
  const { category } = await params;
  const slug = decodeURIComponent(category);
  const categoryLabel = getCategoryLabel(categoryForSlug(slug) ?? slug);
  // One address per category, whichever spelling was asked for: the sitemap's lowercase.
  const canonical = `/mens/${encodeURIComponent(slug.toLowerCase())}`;

  const title = `Men's ${categoryLabel} — Shop Online`;
  const description = `Browse our collection of men's ${categoryLabel.toLowerCase()}. Premium quality, great prices, free shipping available.`;

  return {
    title,
    description,
    alternates: {
      canonical,
    },
    openGraph: {
      title,
      description,
      url: canonical,
      siteName: 'Marshal',
      images: [
        {
          url: '/og-image.jpg',
          width: 1200,
          height: 630,
          alt: `Marshal — Men's ${categoryLabel}`,
        },
      ],
      type: 'website',
      locale: 'en_US',
    },
    twitter: {
      card: 'summary_large_image' as const,
      title,
      description,
      images: ['/og-image.jpg'],
    },
  };
}
