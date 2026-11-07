import { Suspense } from 'react';
import type { Metadata } from 'next';
import { SALE_SEARCH, pageShare } from '@/lib/share-preview';
import { onPage, pageOf, withPage } from '@/lib/page-number';
import SalePageContent from '@/components/SalePageContent';
import { fetchPaginatedProducts, parseSearchParams } from '@/lib/products-server';
import ProductGrid from '@/components/ProductGrid';

interface SalePageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Macedonian, like all page metadata (D-039, Task 16.3); ?page=N keeps its own canonical (16.2). */
export async function generateMetadata({ searchParams }: SalePageProps): Promise<Metadata> {
  const page = pageOf((await searchParams).page);
  const path = withPage('/sale', page);
  return {
    title: onPage(SALE_SEARCH.title, page),
    description: SALE_SEARCH.description,
    alternates: { canonical: path },
    ...pageShare(onPage(SALE_SEARCH.title, page), SALE_SEARCH.description, path),
  };
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
