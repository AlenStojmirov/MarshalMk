import { Suspense } from 'react';
import CategoryPageContent from '@/components/CategoryPageContent';
import { fetchPaginatedProducts, parseSearchParams } from '@/lib/products-server';
import { getCategoryLabel } from '@/lib/product-display';
import ProductGrid from '@/components/ProductGrid';

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

  const categoryLabel = getCategoryLabel(slug);

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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(itemListJsonLd) }}
      />
      <CategoryPageContent
        paginatedData={paginatedData}
        categoryName={category}
      />
    </>
  );
}

export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
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
  const categoryName = decodeURIComponent(category)
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return {
    title: `${categoryName} | MyStore`,
    description: `Пребарувајте ги нашите ${categoryName} производи`,
  };
}
