import { Suspense } from 'react';
import NewPageContent from '@/components/NewPageContent';
import { fetchPaginatedProducts, parseSearchParams } from '@/lib/products-server';
import ProductGrid from '@/components/ProductGrid';

export const metadata = {
  title: "New Arrivals — Latest Men's Fashion",
  description:
    "Discover our latest men's clothing arrivals — new t-shirts, polos, shirts, pants, jackets and more. Fresh styles added regularly.",
  alternates: {
    canonical: '/new',
  },
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
        <div className="min-h-screen bg-white">
          {/* Hero skeleton */}
          <div className="w-full bg-stone-100 py-20 md:py-28 lg:py-36">
            <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-10 animate-pulse">
              <div className="h-3 bg-stone-200 w-20 mb-5" />
              <div className="h-12 bg-stone-200 w-80 mb-5" />
              <div className="h-4 bg-stone-200 w-64 mb-10" />
              <div className="h-12 bg-stone-200 w-36" />
            </div>
          </div>
          {/* Product grid skeleton */}
          <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-10 py-16 md:py-20">
            <ProductGrid products={[]} loading />
          </div>
        </div>
      }
    >
      <NewPageLoader searchParams={searchParams} />
    </Suspense>
  );
}
