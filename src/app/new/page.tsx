import { Suspense } from 'react';
import NewPageContent from '@/components/NewPageContent';
import { fetchPaginatedProducts, parseSearchParams } from '@/lib/products-server';
import ProductGrid from '@/components/ProductGrid';

export const metadata = {
  title: 'New Arrivals | MyStore',
  description: 'Discover our latest products and new arrivals',
};

interface NewPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function NewPageLoader({ searchParams }: NewPageProps) {
  const resolved = await searchParams;
  const queryParams = parseSearchParams(resolved);
  const paginatedData = await fetchPaginatedProducts(queryParams);

  return <NewPageContent paginatedData={paginatedData} />;
}

export default async function NewPage({ searchParams }: NewPageProps) {
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
      <NewPageLoader searchParams={searchParams} />
    </Suspense>
  );
}
