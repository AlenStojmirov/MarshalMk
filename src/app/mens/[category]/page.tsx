import { Suspense } from 'react';
import CategoryPageContent from '@/components/CategoryPageContent';
import { fetchPaginatedProducts, parseSearchParams } from '@/lib/products-server';
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

  // Resolve display name from slug
  const categoryName = slug
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return (
    <CategoryPageContent
      paginatedData={paginatedData}
      categoryName={categoryName}
    />
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
