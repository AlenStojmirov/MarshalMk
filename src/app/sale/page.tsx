import { Suspense } from 'react';
import SalePageContent from '@/components/SalePageContent';
import { fetchPaginatedProducts, parseSearchParams } from '@/lib/products-server';
import ProductGrid from '@/components/ProductGrid';

export const metadata = {
  title: 'Sale | MyStore',
  description: 'Discover amazing deals on our sale products',
};

interface SalePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

async function SalePageLoader({ searchParams }: SalePageProps) {
  const resolved = await searchParams;
  const queryParams = parseSearchParams(resolved);
  const paginatedData = await fetchPaginatedProducts({
    ...queryParams,
    saleOnly: true,
  });

  return <SalePageContent paginatedData={paginatedData} />;
}

export default async function SalePage({ searchParams }: SalePageProps) {
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
      <SalePageLoader searchParams={searchParams} />
    </Suspense>
  );
}
